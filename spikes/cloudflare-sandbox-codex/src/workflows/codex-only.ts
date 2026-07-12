import {
  defineAgent,
  defineWorkflow,
  registerProvider,
  type WorkflowRouteHandler,
} from '@flue/runtime';
import * as v from 'valibot';

import { resolveCodexAuth, type CodexAuthEnv } from '../codex-auth.ts';

interface Env extends CodexAuthEnv {
  OPENAI_CODEX_MODEL?: string;
}

export const route: WorkflowRouteHandler = async (_context, next) => next();

const agent = defineAgent<Env>(async ({ env }) => {
  const auth = await resolveCodexAuth(env);
  registerProvider('openai-codex', { apiKey: auth.accessToken });

  return {
    model: `openai-codex/${env.OPENAI_CODEX_MODEL ?? 'gpt-5.4-mini'}`,
    thinkingLevel: 'low',
  };
});

export default defineWorkflow({
  agent,
  input: v.object({
    message: v.optional(v.string(), 'Reply with exactly: remote codex auth works'),
  }),
  output: v.object({ response: v.string() }),
  async run({ harness, input }) {
    const response = await (await harness.session()).prompt(input.message);
    return { response: response.text };
  },
});
