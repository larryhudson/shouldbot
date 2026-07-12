import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import {
  defineAgent,
  defineWorkflow,
  registerProvider,
  type WorkflowRouteHandler,
} from '@flue/runtime';
import { cloudflareSandbox } from '@flue/runtime/cloudflare';
import * as v from 'valibot';

import { resolveCodexAuth, type CodexAuthEnv } from '../codex-auth.ts';

interface Env extends CodexAuthEnv {
  Sandbox: DurableObjectNamespace<Sandbox>;
  OPENAI_CODEX_MODEL?: string;
}

export const route: WorkflowRouteHandler = async (_context, next) => next();

const agent = defineAgent<Env>(async ({ env, id }) => {
  const auth = await resolveCodexAuth(env);

  // This proves Flue can use a Pi catalog provider with an OAuth-derived
  // bearer token in a Worker. It is intentionally process-local spike code.
  registerProvider('openai-codex', { apiKey: auth.accessToken });

  return {
    cwd: '/workspace',
    instructions:
      'You are a minimal spike agent. Follow the user request and be concise.',
    model: `openai-codex/${env.OPENAI_CODEX_MODEL ?? 'gpt-5.4-mini'}`,
    sandbox: cloudflareSandbox(getSandbox(env.Sandbox, id)),
    thinkingLevel: 'low',
  };
});

export default defineWorkflow({
  agent,
  input: v.object({
    message: v.optional(v.string(), 'Reply with exactly: codex and sandbox are connected'),
  }),
  output: v.object({
    response: v.string(),
    sandbox: v.object({
      node: v.string(),
      marker: v.string(),
    }),
  }),
  async run({ harness, input }) {
    await harness.fs.writeFile('/workspace/spike-marker.txt', 'cloudflare-sandbox-ok');

    const marker = await harness.fs.readFile('/workspace/spike-marker.txt');
    const node = await harness.shell('node --version');
    const response = await (await harness.session()).prompt(input.message);

    return {
      response: response.text,
      sandbox: {
        marker: marker.trim(),
        node: node.stdout.trim(),
      },
    };
  },
});
