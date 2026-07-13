import assert from 'node:assert/strict';
import test from 'node:test';

import type { ShouldbotConfig } from '../src/config.js';
import {
  MemoryArtifactNotFoundError,
  MemoryRepositoryReader,
} from '../src/github/memory-repository-reader.js';

const config = {
  github: { owner: 'owner', repository: 'memory', defaultBranch: 'main' },
} as ShouldbotConfig;

const tokenBroker = {
  getToken: async () => ({ token: 'installation-secret', expiresAt: new Date('2030-01-01') }),
};

test('reads the daily artifact for an exact date', async () => {
  const requests: string[] = [];
  const content = '---\ndescription: Daily\n---\n\nMessage';
  const reader = new MemoryRepositoryReader({
    config,
    tokenBroker,
    apiBaseUrl: 'https://github.test',
    fetch: async (input) => {
      requests.push(String(input));
      return Response.json({
        type: 'file',
        path: 'memory/daily/2026-07-13.md',
        sha: 'blob-sha',
        encoding: 'base64',
        content: Buffer.from(content).toString('base64'),
      });
    },
  });

  assert.deepEqual(await reader.readDaily('2026-07-13'), {
    path: 'memory/daily/2026-07-13.md',
    content,
    blobSha: 'blob-sha',
  });
  assert.match(requests[0]!, /memory\/daily\/2026-07-13\.md\?ref=main$/);
});

test('selects the latest valid timestamped prompts artifact', async () => {
  const requested: string[] = [];
  const reader = new MemoryRepositoryReader({
    config,
    tokenBroker,
    apiBaseUrl: 'https://github.test',
    fetch: async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.includes('/contents/memory/prompts?')) {
        return Response.json([
          { type: 'file', name: 'README.md', path: 'memory/prompts/README.md' },
          { type: 'file', name: '2026-07-13T053000Z.md', path: 'memory/prompts/2026-07-13T053000Z.md' },
          { type: 'file', name: '2026-07-13T142718Z.md', path: 'memory/prompts/2026-07-13T142718Z.md' },
        ]);
      }
      return Response.json({
        type: 'file',
        path: 'memory/prompts/2026-07-13T142718Z.md',
        sha: 'latest-sha',
        encoding: 'base64',
        content: Buffer.from('latest prompts').toString('base64'),
      });
    },
  });

  const result = await reader.readLatestPrompts();
  assert.equal(result.path, 'memory/prompts/2026-07-13T142718Z.md');
  assert.match(requested[1]!, /2026-07-13T142718Z\.md/);
});

test('reports a missing generated artifact without exposing credentials', async () => {
  const reader = new MemoryRepositoryReader({
    config,
    tokenBroker,
    fetch: async () => new Response('', { status: 404 }),
  });
  await assert.rejects(reader.readLatestPrompts(), (error: unknown) => {
    assert.ok(error instanceof MemoryArtifactNotFoundError);
    assert.equal(error.message.includes('installation-secret'), false);
    return true;
  });
});
