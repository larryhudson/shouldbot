import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { local } from '@flue/runtime/node';

import {
  MemoryValidationError,
  MemoryWorkspace,
  memoryPath,
  parseMemoryDocument,
} from '../src/memory/memory-workspace.js';

async function workspace(t: test.TestContext) {
  const checkout = await mkdtemp(path.join(os.tmpdir(), 'shouldbot-memory-'));
  t.after(() => rm(checkout, { recursive: true, force: true }));
  const env = await local({ cwd: checkout }).createSessionEnv({ id: 'test' });
  return { checkout, memory: new MemoryWorkspace({ env, checkoutPath: checkout }) };
}

const document = (description: string, body = '# Body\n') =>
  `---\ndescription: ${JSON.stringify(description)}\n---\n\n${body}`;

test('lists paths and descriptions and reads only selected valid documents', async (t) => {
  const { memory } = await workspace(t);
  await memory.writeDocument('shoulds/licence.md', document('Driving licence context'));
  await memory.writeDocument('context/work.md', document('Current work context'));

  assert.deepEqual(await memory.list(), [
    { path: 'context/work.md', description: 'Current work context' },
    { path: 'shoulds/licence.md', description: 'Driving licence context' },
  ]);
  assert.deepEqual(await memory.list('shoulds'), [
    { path: 'shoulds/licence.md', description: 'Driving licence context' },
  ]);
  assert.match(await memory.read('shoulds/licence.md'), /# Body/);
  await assert.rejects(memory.list('../outside'), /traversal/);
});

test('rejects traversal, absolute paths, backslashes, and non-Markdown files', () => {
  for (const unsafe of ['../secret.md', '/etc/passwd.md', 'context\\secret.md', 'file.txt', 'a/../b.md']) {
    assert.throws(() => memoryPath(unsafe), MemoryValidationError);
  }
});

test('requires valid frontmatter with a non-empty string description', () => {
  assert.throws(() => parseMemoryDocument('# no frontmatter'), /must begin with YAML frontmatter/);
  assert.throws(() => parseMemoryDocument('---\ndescription: ""\n---\nbody'), /non-empty string description/);
  assert.throws(() => parseMemoryDocument('---\ndescription: [not, text]\n---\nbody'), /non-empty string description/);
  assert.equal(parseMemoryDocument(document('Useful description')).description, 'Useful description');
});

test('saves the original reflection verbatim with create-only semantics', async (t) => {
  const { checkout, memory } = await workspace(t);
  const original = 'I should do one thing.\n\nBut I am unsure why.\n';
  const reflectionPath = await memory.saveReflection({
    date: '2026-07-12',
    id: 'run_01 Example',
    description: 'Original reflection from 12 July',
    original,
  });
  assert.equal(reflectionPath, 'reflections/2026-07-12-run-01-example.md');
  const saved = await readFile(path.join(checkout, 'memory', reflectionPath), 'utf8');
  assert.equal(saved.endsWith(original), true);
  await assert.rejects(
    memory.saveReflection({
      date: '2026-07-12', id: 'run_01 Example', description: 'Again', original: 'replacement',
    }),
    /cannot be overwritten/,
  );
  await assert.rejects(memory.writeDocument(reflectionPath, document('replacement')), /create-only/);
});

test('whole-workspace validation rejects files, symlinks, and changes outside memory', async (t) => {
  const { checkout, memory } = await workspace(t);
  await memory.writeDocument('now.md', document('Current orientation'));
  await mkdir(path.join(checkout, 'memory', 'context'), { recursive: true });
  await writeFile(path.join(checkout, 'memory', 'context', 'data.json'), '{}');
  await assert.rejects(
    memory.validateWorkspace({ changedPaths: ['memory/now.md'] }),
    /must use the .md extension/,
  );
  await rm(path.join(checkout, 'memory', 'context', 'data.json'));
  await symlink(path.join(checkout, 'memory', 'now.md'), path.join(checkout, 'memory', 'context', 'link.md'));
  await assert.rejects(
    memory.validateWorkspace({ changedPaths: ['memory/now.md'] }),
    /Symbolic links are not allowed/,
  );
  await assert.rejects(
    memory.validateWorkspace({ changedPaths: ['README.md'] }),
    /outside the memory root/,
  );
});

test('validation permits only the transaction-authorized new reflection', async (t) => {
  const { memory } = await workspace(t);
  const reflection = await memory.saveReflection({
    date: '2026-07-12', id: 'run-1', description: 'Source reflection', original: 'Original',
  });
  await memory.validateWorkspace({
    changedPaths: [`memory/${reflection}`],
    protectedReflections: { [reflection]: await memory.read(reflection) },
  });
  await assert.rejects(
    memory.validateWorkspace({ changedPaths: [`memory/${reflection}`] }),
    /Reflection source change is not authorized/,
  );
  const original = await memory.read(reflection);
  const absolute = path.join(memory.root, reflection);
  await writeFile(absolute, original.replace('Original', 'Tampered'));
  await assert.rejects(
    memory.validateWorkspace({
      changedPaths: [`memory/${reflection}`],
      protectedReflections: { [reflection]: original },
    }),
    /Original reflection was modified after capture/,
  );
});
