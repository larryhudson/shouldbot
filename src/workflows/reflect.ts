import {
  defineAgent,
  defineWorkflow,
  registerProvider,
  type FlueSession,
  type SessionEnv,
  type WorkflowRouteHandler,
} from '@flue/runtime';
import * as v from 'valibot';

import {
  isRateLimitError,
  type SelectedCodexCredential,
} from '../auth/codex-credential-pool.js';
import { DockerGitClient } from '../github/docker-git-client.js';
import instructions from '../instructions/shouldbot.md' with { type: 'markdown' };
import { createMemoryTools } from '../memory/memory-tools.js';
import { MemoryBranchConflictError } from '../memory/memory-transaction.js';
import { MemoryWorkspace } from '../memory/memory-workspace.js';
import { getServices, type ShouldbotServices } from '../runtime/services.js';
import { docker, type DockerContainer } from '../sandboxes/docker.js';

export const route: WorkflowRouteHandler = async (_context, next) => next();

interface ActiveRun {
  id: string;
  services: ShouldbotServices;
  container: DockerContainer;
  git: DockerGitClient;
  memory: MemoryWorkspace;
  credential: SelectedCodexCredential;
  startingSha: string;
  cleanupTimer: NodeJS.Timeout;
  cleaned: boolean;
}

let activeRun: ActiveRun | undefined;
let initializing = false;

const agent = defineAgent(async ({ id }) => {
  if (initializing || activeRun) {
    throw new ReflectionAlreadyRunningError();
  }
  initializing = true;
  const services = await getServices();
  let container: DockerContainer | undefined;
  try {
    const [installationToken, credential] = await Promise.all([
      services.tokenBroker.getToken(),
      services.codexPool.select(),
    ]);
    registerCodexCredential(credential);
    container = await services.sandboxManager.create(id);
    const git = new DockerGitClient({
      container,
      token: installationToken.token,
      remoteUrl: `https://github.com/${services.config.github.owner}/${services.config.github.repository}.git`,
      branch: services.config.github.defaultBranch,
      authorName: services.config.git.authorName,
      authorEmail: services.config.git.authorEmail,
    });
    await git.clone();
    const startingSha = await git.head();
    const sessionEnv = await docker(container).createSessionEnv({ id });
    const memory = new MemoryWorkspace({ env: sessionEnv });
    const cleanupTimer = setTimeout(() => void cleanupActiveRun(id), services.config.sandbox.timeoutMs);
    cleanupTimer.unref();
    activeRun = {
      id, services, container, git, memory, credential, startingSha, cleanupTimer, cleaned: false,
    };

    return {
      cwd: '/workspace/memory',
      instructions,
      model: `openai-codex/${services.config.codex.model}`,
      sandbox: fixedSandbox(sessionEnv),
      thinkingLevel: services.config.codex.reasoningLevel,
      tools: createMemoryTools(memory),
    };
  } catch (error) {
    if (container) await services.sandboxManager.destroy(container).catch(() => undefined);
    throw error;
  } finally {
    initializing = false;
  }
});

export default defineWorkflow({
  agent,
  input: v.object({
    reflection: v.pipe(
      v.string(),
      v.maxLength(100_000),
      v.check((value) => value.trim().length > 0, 'Reflection must not be empty.'),
    ),
  }),
  output: v.object({
    response: v.string(),
    memoryRevision: v.string(),
    changedPaths: v.array(v.string()),
  }),
  async run({ harness, input }) {
    const run = requireActiveRun();
    try {
      const date = londonDate(new Date());
      const reflectionPath = await run.memory.saveReflection({
        date,
        id: run.id,
        description: `Original reflection submitted on ${date}`,
        original: input.reflection,
      });
      const protectedReflection = await run.memory.read(reflectionPath);
      const response = await promptWithFailover(run, harness.session(), input.reflection);
      const changedPaths = await run.git.changedPaths();
      await run.memory.validateWorkspace({
        changedPaths,
        protectedReflections: { [reflectionPath]: protectedReflection },
      });
      const currentSha = await run.git.remoteHead();
      if (currentSha !== run.startingSha) {
        throw new MemoryBranchConflictError(run.startingSha, currentSha);
      }
      const memoryRevision = await run.git.commitAndPush(`shouldbot: process reflection ${date}`);
      return { response: response.text, memoryRevision, changedPaths };
    } finally {
      await cleanupActiveRun(run.id);
    }
  },
});

async function promptWithFailover(
  run: ActiveRun,
  sessionPromise: Promise<FlueSession>,
  reflection: string,
) {
  const session = await sessionPromise;
  try {
    return await session.prompt(reflection);
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    return run.services.codexPool.withRateLimitFailover(async (credential) => {
      registerCodexCredential(credential);
      return session.prompt(reflection);
    }, { excludeSources: [run.credential.source] });
  }
}

function registerCodexCredential(credential: SelectedCodexCredential): void {
  registerProvider('openai-codex', {
    apiKey: credential.accessToken,
    headers: { 'OAI-Product-Sku': 'codex' },
  });
}

function fixedSandbox(env: SessionEnv) {
  return {
    createSessionEnv: async () => env,
    tools: () => [],
  };
}

function requireActiveRun(): ActiveRun {
  if (!activeRun) throw new Error('Reflection run resources were not initialized.');
  return activeRun;
}

async function cleanupActiveRun(id: string): Promise<void> {
  const run = activeRun;
  if (!run || run.id !== id || run.cleaned) return;
  run.cleaned = true;
  clearTimeout(run.cleanupTimer);
  activeRun = undefined;
  await run.services.sandboxManager.destroy(run.container);
}

function londonDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export class ReflectionAlreadyRunningError extends Error {
  readonly code = 'reflection_already_running';

  constructor() {
    super('Another reflection is already being processed. Please wait for it to finish.');
    this.name = 'ReflectionAlreadyRunningError';
  }
}
