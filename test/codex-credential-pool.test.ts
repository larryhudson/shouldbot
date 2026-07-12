import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AllCodexSubscriptionsRateLimitedError,
  CodexCredentialPool,
} from '../src/auth/codex-credential-pool.js';

async function fixture(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shouldbot-codex-pool-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function writeAuth(directory: string, name: string, access: string, expires: number) {
  await writeFile(path.join(directory, name), JSON.stringify({
    'openai-codex': { type: 'oauth', access, refresh: `${access}-refresh`, expires },
  }));
}

test('selects subscriptions round-robin and persists its cursor', async (t) => {
  const directory = await fixture(t);
  await writeAuth(directory, 'b.json', 'second', 10_000_000);
  await writeAuth(directory, 'a.json', 'first', 10_000_000);

  const firstPool = new CodexCredentialPool(directory, { now: () => 1 });
  assert.deepEqual(await firstPool.select(), { accessToken: 'first', source: 'a.json' });
  assert.deepEqual(await firstPool.select(), { accessToken: 'second', source: 'b.json' });

  const restartedPool = new CodexCredentialPool(directory, { now: () => 1 });
  assert.deepEqual(await restartedPool.select(), { accessToken: 'first', source: 'a.json' });
});

test('refreshes and atomically persists only the selected credential', async (t) => {
  const directory = await fixture(t);
  await writeAuth(directory, 'account.json', 'expired', 1);

  const pool = new CodexCredentialPool(directory, {
    now: () => 100_000,
    refresh: async () => ({ access: 'fresh', refresh: 'fresh-refresh', expires: 999_999 }),
  });
  assert.deepEqual(await pool.select(), { accessToken: 'fresh', source: 'account.json' });

  const persisted = JSON.parse(await readFile(path.join(directory, 'account.json'), 'utf8'));
  assert.equal(persisted['openai-codex'].access, 'fresh');
  assert.equal(persisted['openai-codex'].refresh, 'fresh-refresh');
});

test('fails over to the next subscription after a rate limit', async (t) => {
  const directory = await fixture(t);
  await writeAuth(directory, 'a.json', 'limited', 10_000_000);
  await writeAuth(directory, 'b.json', 'available', 10_000_000);
  const attempts: string[] = [];
  const pool = new CodexCredentialPool(directory, { now: () => 1 });

  const result = await pool.withRateLimitFailover(async (credential) => {
    attempts.push(credential.source);
    if (credential.accessToken === 'limited') throw { status: 429 };
    return 'completed';
  });

  assert.equal(result, 'completed');
  assert.deepEqual(attempts, ['a.json', 'b.json']);
  assert.deepEqual(await pool.select(), { accessToken: 'limited', source: 'a.json' });
});

test('reports a safe dedicated error when every subscription is rate-limited', async (t) => {
  const directory = await fixture(t);
  await writeAuth(directory, 'a.json', 'first', 10_000_000);
  await writeAuth(directory, 'b.json', 'second', 10_000_000);
  const pool = new CodexCredentialPool(directory, { now: () => 1 });

  await assert.rejects(
    pool.withRateLimitFailover(async () => {
      const cause = Object.assign(new Error('raw provider response'), { statusCode: 429 });
      throw new Error('prompt failed', { cause });
    }),
    (error: unknown) => {
      assert.ok(error instanceof AllCodexSubscriptionsRateLimitedError);
      assert.equal(error.code, 'all_codex_subscriptions_rate_limited');
      assert.equal(error.subscriptionCount, 2);
      assert.equal(error.message.includes('raw provider response'), false);
      return true;
    },
  );
});

test('does not retry another subscription for non-rate-limit failures', async (t) => {
  const directory = await fixture(t);
  await writeAuth(directory, 'a.json', 'first', 10_000_000);
  await writeAuth(directory, 'b.json', 'second', 10_000_000);
  const pool = new CodexCredentialPool(directory, { now: () => 1 });
  let attempts = 0;

  await assert.rejects(
    pool.withRateLimitFailover(async () => {
      attempts += 1;
      throw new Error('model output was invalid');
    }),
    /model output was invalid/,
  );
  assert.equal(attempts, 1);
});

test('recognizes Pi Codex usage-limit errors that omit HTTP status metadata', async (t) => {
  const directory = await fixture(t);
  await writeAuth(directory, 'a.json', 'limited', 10_000_000);
  await writeAuth(directory, 'b.json', 'available', 10_000_000);
  const pool = new CodexCredentialPool(directory, { now: () => 1 });

  const result = await pool.withRateLimitFailover(async (credential) => {
    if (credential.accessToken === 'limited') {
      throw new Error('prompt failed: Codex error: The usage limit has been reached');
    }
    return credential.source;
  });
  assert.equal(result, 'b.json');
});
