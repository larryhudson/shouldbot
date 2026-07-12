import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryReadTools, createMemoryTools } from '../src/memory/memory-tools.js';
import type { MemoryWorkspace } from '../src/memory/memory-workspace.js';

const unusedMemory = {} as MemoryWorkspace;

test('prompt generation receives only read-only memory tools', () => {
  assert.deepEqual(createMemoryReadTools(unusedMemory).map((tool) => tool.name), [
    'list_documents',
    'read_document',
  ]);
  assert.deepEqual(createMemoryTools(unusedMemory).map((tool) => tool.name), [
    'list_documents',
    'read_document',
    'write_document',
  ]);
});
