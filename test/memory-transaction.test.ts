import assert from 'node:assert/strict';
import test from 'node:test';

import type { ShouldbotConfig } from '../src/config.js';
import type { MemoryGitClient } from '../src/github/docker-git-client.js';
import {
  MemoryBranchConflictError,
  MemoryTransaction,
} from '../src/memory/memory-transaction.js';
import type { CommandRequest, CommandResult, CommandRunner } from '../src/sandboxes/command-runner.js';
import { DockerSandboxManager } from '../src/sandboxes/docker-manager.js';

class RecordingRunner implements CommandRunner {
  readonly requests: CommandRequest[] = [];
  async run(request: CommandRequest): Promise<CommandResult> {
    this.requests.push(request);
    return { stdout: new Uint8Array(), stderr: new Uint8Array(), exitCode: 0 };
  }
}

class FakeGit implements MemoryGitClient {
  readonly events: string[] = [];
  startingSha = 'a'.repeat(40);
  currentSha = this.startingSha;
  paths = ['memory/now.md'];

  async clone() { this.events.push('clone'); }
  async head() { this.events.push('head'); return this.startingSha; }
  async remoteHead() { this.events.push('remoteHead'); return this.currentSha; }
  async changedPaths() { this.events.push('changedPaths'); return this.paths; }
  async commitAndPush() { this.events.push('commitAndPush'); return 'c'.repeat(40); }
}

const config = {
  github: { owner: 'owner', repository: 'memory', defaultBranch: 'main' },
  git: { authorName: 'Shouldbot', authorEmail: 'shouldbot@example.com' },
} as ShouldbotConfig;

function setup(git = new FakeGit()) {
  const runner = new RecordingRunner();
  const sandboxManager = new DockerSandboxManager({ image: 'sandbox:test', runner });
  const transaction = new MemoryTransaction({
    config,
    sandboxManager,
    tokenBroker: { getToken: async () => ({ token: 'secret', expiresAt: new Date() }) },
    createGitClient: () => git,
  });
  return { transaction, git, runner };
}

test('validates, conflict-checks, commits, and cleans up one atomic interaction', async () => {
  const { transaction, git, runner } = setup();
  const result = await transaction.run({
    runId: 'run-1',
    commitMessage: 'reflection',
    work: async () => { git.events.push('work'); return 'response'; },
    validate: async () => { git.events.push('validate'); },
  });
  assert.equal(result.value, 'response');
  assert.equal(result.commitSha, 'c'.repeat(40));
  assert.deepEqual(git.events, [
    'clone', 'head', 'work', 'changedPaths', 'validate', 'remoteHead', 'commitAndPush',
  ]);
  assert.equal(runner.requests.at(-1)?.args[0], 'rm');
});

test('fails loudly on a changed remote without committing and still cleans up', async () => {
  const git = new FakeGit();
  git.currentSha = 'b'.repeat(40);
  const { transaction, runner } = setup(git);
  await assert.rejects(
    transaction.run({
      runId: 'run-conflict',
      commitMessage: 'reflection',
      work: async () => undefined,
      validate: async () => undefined,
    }),
    MemoryBranchConflictError,
  );
  assert.equal(git.events.includes('commitAndPush'), false);
  assert.equal(runner.requests.at(-1)?.args[0], 'rm');
});

test('does not conflict-check or commit after validation failure and still cleans up', async () => {
  const { transaction, git, runner } = setup();
  await assert.rejects(
    transaction.run({
      runId: 'run-invalid',
      commitMessage: 'reflection',
      work: async () => undefined,
      validate: async () => { throw new Error('invalid memory'); },
    }),
    /invalid memory/,
  );
  assert.equal(git.events.includes('remoteHead'), false);
  assert.equal(git.events.includes('commitAndPush'), false);
  assert.equal(runner.requests.at(-1)?.args[0], 'rm');
});
