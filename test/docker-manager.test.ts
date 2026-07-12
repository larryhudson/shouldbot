import assert from 'node:assert/strict';
import test from 'node:test';

import type { CommandRequest, CommandResult, CommandRunner } from '../src/sandboxes/command-runner.js';
import { DockerSandboxManager } from '../src/sandboxes/docker-manager.js';

const ok: CommandResult = {
  stdout: new Uint8Array(),
  stderr: new Uint8Array(),
  exitCode: 0,
};

class RecordingRunner implements CommandRunner {
  readonly requests: CommandRequest[] = [];

  async run(request: CommandRequest): Promise<CommandResult> {
    this.requests.push(request);
    return ok;
  }
}

test('creates a constrained, disposable Docker sandbox', async () => {
  const runner = new RecordingRunner();
  const manager = new DockerSandboxManager({ image: 'shouldbot-sandbox:test', runner });
  const container = await manager.create('run/unsafe ID');

  assert.match(container.name, /^shouldbot-run-unsafe-id-[a-f0-9]{8}$/);
  assert.deepEqual(runner.requests[0]?.args.slice(0, 5), [
    'run', '--detach', '--rm', '--name', container.name,
  ]);
  assert.ok(runner.requests[0]?.args.includes('--read-only'));
  assert.ok(runner.requests[0]?.args.includes('--pids-limit'));
  assert.ok(runner.requests[0]?.args.includes(
    '/workspace:rw,exec,nosuid,size=1g,uid=10001,gid=10001,mode=0700',
  ));
  assert.equal(runner.requests[0]?.args.includes('/var/run/docker.sock'), false);
});

test('always destroys the sandbox when workflow work fails', async () => {
  const runner = new RecordingRunner();
  const manager = new DockerSandboxManager({ image: 'shouldbot-sandbox:test', runner });

  await assert.rejects(
    manager.withSandbox('run-1', async () => {
      throw new Error('workflow failed');
    }),
    /workflow failed/,
  );

  assert.equal(runner.requests.at(-1)?.args[0], 'rm');
  assert.equal(runner.requests.at(-1)?.args[1], '--force');
});
