import { getSandbox, type Sandbox } from '@cloudflare/sandbox';
import {
  defineAgent,
  defineWorkflow,
  type WorkflowRouteHandler,
} from '@flue/runtime';
import { cloudflareSandbox } from '@flue/runtime/cloudflare';
import * as v from 'valibot';

interface Env {
  Sandbox: DurableObjectNamespace<Sandbox>;
}

export const route: WorkflowRouteHandler = async (_context, next) => next();

const agent = defineAgent<Env>(({ env, id }) => ({
  cwd: '/workspace',
  model: 'openai-codex/gpt-5.4-mini',
  sandbox: cloudflareSandbox(getSandbox(env.Sandbox, id)),
}));

export default defineWorkflow({
  agent,
  output: v.object({
    marker: v.string(),
    node: v.string(),
  }),
  async run({ harness }) {
    await harness.fs.writeFile('/workspace/remote-marker.txt', 'remote-sandbox-ok');
    const marker = await harness.fs.readFile('/workspace/remote-marker.txt');
    const node = await harness.shell('node --version');

    return {
      marker: marker.trim(),
      node: node.stdout.trim(),
    };
  },
});
