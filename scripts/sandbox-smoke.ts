import { DockerSandboxManager } from '../src/sandboxes/docker-manager.js';
import { docker } from '../src/sandboxes/docker.js';

const manager = new DockerSandboxManager({
  image: process.env.SHOULDBOT_SANDBOX_IMAGE ?? 'shouldbot-sandbox:dev',
});

const result = await manager.withSandbox('smoke', async (container) => {
  const env = await docker(container).createSessionEnv({ id: 'smoke' });
  await env.writeFile('/workspace/nested/marker.txt', 'docker-sandbox-ok');
  const marker = await env.readFile('/workspace/nested/marker.txt');
  const node = await env.exec('node --version', { cwd: '/workspace', timeoutMs: 10_000 });
  const entries = await env.readdir('/workspace/nested');

  return { marker: marker.trim(), node: node.stdout.trim(), entries };
});

if (result.marker !== 'docker-sandbox-ok' || result.node.length === 0) {
  throw new Error(`Unexpected sandbox result: ${JSON.stringify(result)}`);
}

process.stdout.write(`${JSON.stringify(result)}\n`);
