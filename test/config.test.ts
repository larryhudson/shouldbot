import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadConfig } from '../src/config.js';

async function validEnv(t: test.TestContext): Promise<NodeJS.ProcessEnv> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'shouldbot-config-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const privateKeyPath = path.join(directory, 'app.pem');
  const authDirectory = path.join(directory, 'auth');
  await writeFile(privateKeyPath, 'synthetic-key');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(authDirectory));
  return {
    PORT: '3000',
    SHOULDBOT_BASE_URL: 'http://localhost:3000',
    SHOULDBOT_ALLOWED_GITHUB_USER_ID: '123',
    SHOULDBOT_GITHUB_CLIENT_ID: 'client-id',
    SHOULDBOT_GITHUB_CLIENT_SECRET: 'client-secret',
    SHOULDBOT_GITHUB_CALLBACK_URL: 'http://localhost:3000/auth/github/callback',
    SHOULDBOT_GITHUB_APP_ID: '456',
    SHOULDBOT_GITHUB_INSTALLATION_ID: '789',
    SHOULDBOT_GITHUB_PRIVATE_KEY_PATH: privateKeyPath,
    SHOULDBOT_GITHUB_OWNER: 'example-owner',
    SHOULDBOT_GITHUB_REPOSITORY: 'shouldbot-memory',
    SHOULDBOT_GITHUB_DEFAULT_BRANCH: 'main',
    SHOULDBOT_SESSION_SECRET: 'a'.repeat(64),
    SHOULDBOT_CODEX_AUTH_PATH: authDirectory,
    SHOULDBOT_CODEX_MODEL: 'gpt-test',
    SHOULDBOT_CODEX_REASONING_LEVEL: 'high',
    SHOULDBOT_SANDBOX_IMAGE: 'shouldbot-sandbox:dev',
    SHOULDBOT_SANDBOX_MEMORY: '1g',
    SHOULDBOT_SANDBOX_CPUS: '1',
    SHOULDBOT_SANDBOX_PIDS_LIMIT: '256',
    SHOULDBOT_SANDBOX_TIMEOUT_MS: '900000',
    SHOULDBOT_GIT_AUTHOR_NAME: 'Shouldbot[bot]',
    SHOULDBOT_GIT_AUTHOR_EMAIL: '123+shouldbot[bot]@users.noreply.github.com',
  };
}

test('loads and structures valid configuration', async (t) => {
  const env = await validEnv(t);
  const config = await loadConfig(env);
  assert.equal(config.github.installationId, 789);
  assert.equal(config.github.repository, 'shouldbot-memory');
  assert.equal(config.codex.authDirectory, env.SHOULDBOT_CODEX_AUTH_PATH);
  assert.equal(config.codex.reasoningLevel, 'high');
  assert.equal(config.sandbox.timeoutMs, 900_000);
});

test('rejects public insecure callback URLs', async (t) => {
  const env = await validEnv(t);
  env.SHOULDBOT_GITHUB_CALLBACK_URL = 'http://example.com/auth/github/callback';
  await assert.rejects(loadConfig(env), /must use HTTPS except on localhost/);
});

test('rejects unsupported Codex reasoning levels', async (t) => {
  const env = await validEnv(t);
  env.SHOULDBOT_CODEX_REASONING_LEVEL = 'extreme';
  await assert.rejects(loadConfig(env), /must be one of: minimal, low, medium, high, xhigh, max/);
});

test('rejects missing or inaccessible credential paths without echoing values', async (t) => {
  const env = await validEnv(t);
  const secretPath = '/does-not-exist/private-secret.pem';
  env.SHOULDBOT_GITHUB_PRIVATE_KEY_PATH = secretPath;
  await assert.rejects(loadConfig(env), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message.includes(secretPath), false);
    return true;
  });
});
