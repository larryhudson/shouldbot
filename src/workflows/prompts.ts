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
import instructions from '../instructions/prompts.md' with { type: 'markdown' };
import { promptsArtifactPath, renderPromptsArtifact } from '../memory/generated-artifacts.js';
import { createMemoryReadTools } from '../memory/memory-tools.js';
import { MemoryBranchConflictError } from '../memory/memory-transaction.js';
import { MemoryWorkspace } from '../memory/memory-workspace.js';
import { getServices, type ShouldbotServices } from '../runtime/services.js';
import { docker, type DockerContainer } from '../sandboxes/docker.js';

export const route: WorkflowRouteHandler = async (_context, next) => next();

const generatedPromptsSchema = v.object({
  prompts: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(3), v.maxLength(5)),
  invitation: v.pipe(v.string(), v.minLength(1)),
});

interface ActivePromptRun {
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

let activeRun: ActivePromptRun | undefined;
let initializing = false;

const agent = defineAgent(async ({ id }) => {
  if (initializing || activeRun) throw new PromptGenerationAlreadyRunningError();
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
      // Prompt preparation must stay responsive enough for clients such as
      // Apple Shortcuts, whose HTTP action times out around 30 seconds. The
      // reflection workflow keeps the configured (typically higher) level.
      thinkingLevel: 'low',
      tools: createMemoryReadTools(memory),
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
  input: v.object({}),
  output: v.object({
    prompts: v.array(v.string()),
    invitation: v.string(),
    memoryRevision: v.string(),
    changedPaths: v.array(v.string()),
    generatedAt: v.string(),
  }),
  async run({ harness }) {
    const run = requireActiveRun();
    try {
      const response = await promptWithFailover(run, harness.session());
      const generatedAt = new Date();
      await run.memory.writeDocument(
        promptsArtifactPath(generatedAt),
        renderPromptsArtifact(response.data.prompts, response.data.invitation, generatedAt),
      );
      const changedPaths = await run.git.changedPaths();
      await run.memory.validateWorkspace({ changedPaths });
      const currentSha = await run.git.remoteHead();
      if (currentSha !== run.startingSha) {
        throw new MemoryBranchConflictError(run.startingSha, currentSha);
      }
      const memoryRevision = await run.git.commitAndPush(
        `shouldbot: generate reflection prompts ${generatedAt.toISOString()}`,
      );
      return {
        ...response.data,
        memoryRevision,
        changedPaths,
        generatedAt: generatedAt.toISOString(),
      };
    } finally {
      await cleanupActiveRun(run.id);
    }
  },
});

async function promptWithFailover(run: ActivePromptRun, sessionPromise: Promise<FlueSession>) {
  const session = await sessionPromise;
  const prompt = () => session.prompt(
    'Generate optional prompts for my next brain dump from the current memory.',
    { result: generatedPromptsSchema },
  );
  try {
    return await prompt();
  } catch (error) {
    if (!isRateLimitError(error)) throw error;
    return run.services.codexPool.withRateLimitFailover(async (credential) => {
      registerCodexCredential(credential);
      return prompt();
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
  return { createSessionEnv: async () => env, tools: () => [] };
}

function requireActiveRun(): ActivePromptRun {
  if (!activeRun) throw new Error('Prompt-generation resources were not initialized.');
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

export class PromptGenerationAlreadyRunningError extends Error {
  readonly code = 'prompt_generation_already_running';

  constructor() {
    super('A reflection-prompt generation is already running. Please wait for it to finish.');
    this.name = 'PromptGenerationAlreadyRunningError';
  }
}
