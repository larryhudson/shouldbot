import assert from 'node:assert/strict';
import test from 'node:test';

import type { CommandRequest, CommandResult, CommandRunner } from '../src/sandboxes/command-runner.js';
import { DockerGitClient, GitControlPlaneError } from '../src/github/docker-git-client.js';

class GitRunner implements CommandRunner {
  readonly requests: CommandRequest[] = [];
  results: CommandResult[] = [];

  async run(request: CommandRequest): Promise<CommandResult> {
    this.requests.push(request);
    return this.results.shift() ?? result('');
  }
}

function result(stdout: string, exitCode = 0): CommandResult {
  return { stdout: new TextEncoder().encode(stdout), stderr: new Uint8Array(), exitCode };
}

function client(runner: GitRunner, token = 'installation-token-secret') {
  return new DockerGitClient({
    container: { name: 'sandbox', runner },
    token,
    remoteUrl: 'https://github.com/owner/memory.git',
    branch: 'main',
    authorName: 'Shouldbot[bot]',
    authorEmail: '1+shouldbot[bot]@users.noreply.github.com',
  });
}

test('streams credentials over stdin without placing them in arguments or errors', async () => {
  const runner = new GitRunner();
  const secret = 'installation-token-secret';
  await client(runner, secret).clone();
  const request = runner.requests[0]!;
  assert.equal(request.args.join(' ').includes(secret), false);
  assert.equal(new TextDecoder().decode(request.input), `${secret}\n`);

  runner.results.push(result('', 128));
  await assert.rejects(client(runner, secret).clone(), (error: unknown) => {
    assert.ok(error instanceof GitControlPlaneError);
    assert.equal(error.message.includes(secret), false);
    return true;
  });
});

test('parses ordinary and renamed changed paths from porcelain output', async () => {
  const runner = new GitRunner();
  runner.results.push(result(' M memory/now.md\0R  memory/new.md\0memory/old.md\0'));
  assert.deepEqual(await client(runner).changedPaths(), ['memory/now.md', 'memory/new.md']);
});

test('commits and pushes through application-owned fixed git commands', async () => {
  const runner = new GitRunner();
  runner.results.push(result(''), result(''), result(''), result(`${'a'.repeat(40)}\n`));
  const sha = await client(runner).commitAndPush('reflection 2026-07-12');
  assert.equal(sha, 'a'.repeat(40));
  assert.equal(runner.requests.length, 4);
  assert.ok(runner.requests[2]?.args.includes('push'));
});
