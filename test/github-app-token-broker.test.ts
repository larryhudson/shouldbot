import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import test from 'node:test';

import {
  GitHubAppTokenBroker,
  GitHubTokenMintError,
} from '../src/github/app-token-broker.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

test('mints a repository-restricted installation token with a valid app JWT', async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const broker = new GitHubAppTokenBroker({
    appId: 123,
    installationId: 456,
    repository: 'shouldbot-memory',
    privateKey: privateKeyPem,
    now: () => Date.parse('2026-07-12T12:00:00Z'),
    fetch: async (input, init) => {
      request = { url: String(input), init };
      return Response.json({ token: 'installation-secret', expires_at: '2026-07-12T13:00:00Z' });
    },
  });

  const result = await broker.getToken();
  assert.equal(result.token, 'installation-secret');
  assert.equal(request?.url, 'https://api.github.com/app/installations/456/access_tokens');
  assert.deepEqual(JSON.parse(String(request?.init?.body)), {
    repositories: ['shouldbot-memory'],
    permissions: { contents: 'write' },
  });

  const headers = new Headers(request?.init?.headers);
  const jwt = headers.get('authorization')?.replace('Bearer ', '');
  assert.ok(jwt);
  const [header, payload, signature] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header!, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' });
  assert.deepEqual(JSON.parse(Buffer.from(payload!, 'base64url').toString()), {
    iat: 1_783_857_540,
    exp: 1_783_858_140,
    iss: '123',
  });
  assert.equal(
    verify('RSA-SHA256', Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature!, 'base64url')),
    true,
  );
});

test('coalesces concurrent requests and caches a valid installation token', async () => {
  let calls = 0;
  const broker = new GitHubAppTokenBroker({
    appId: 123,
    installationId: 456,
    repository: 'shouldbot-memory',
    privateKey: privateKeyPem,
    now: () => Date.parse('2026-07-12T12:00:00Z'),
    fetch: async () => {
      calls += 1;
      return Response.json({ token: 'cached', expires_at: '2026-07-12T13:00:00Z' });
    },
  });
  const [first, second] = await Promise.all([broker.getToken(), broker.getToken()]);
  assert.equal(first.token, 'cached');
  assert.equal(second.token, 'cached');
  assert.equal((await broker.getToken()).token, 'cached');
  assert.equal(calls, 1);
});

test('reports safe GitHub status metadata without including the response body', async () => {
  const broker = new GitHubAppTokenBroker({
    appId: 123,
    installationId: 456,
    repository: 'shouldbot-memory',
    privateKey: privateKeyPem,
    fetch: async () => new Response('{"token":"must-not-leak"}', {
      status: 403,
      headers: { 'x-github-request-id': 'request-123' },
    }),
  });
  await assert.rejects(broker.getToken(), (error: unknown) => {
    assert.ok(error instanceof GitHubTokenMintError);
    assert.equal(error.status, 403);
    assert.equal(error.requestId, 'request-123');
    assert.equal(error.message.includes('must-not-leak'), false);
    return true;
  });
});
