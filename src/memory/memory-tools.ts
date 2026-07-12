import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

import { MemoryWorkspace, parseMemoryDocument } from './memory-workspace.js';

export function createMemoryTools(memory: MemoryWorkspace) {
  return [
    ...createMemoryReadTools(memory),
    defineTool({
      name: 'write_document',
      description: 'Create or replace one non-reflection Markdown memory document after validating its path and YAML frontmatter.',
      input: v.object({ path: v.string(), content: v.string() }),
      output: v.object({ path: v.string(), description: v.string() }),
      async run({ input }) {
        await memory.writeDocument(input.path, input.content);
        return {
          path: input.path,
          description: parseMemoryDocument(input.content, input.path).description,
        };
      },
    }),
  ];
}

export function createMemoryReadTools(memory: MemoryWorkspace) {
  return [
    defineTool({
      name: 'list_documents',
      description: 'List Markdown memory documents and their descriptions without returning document bodies.',
      input: v.object({
        path: v.optional(v.string(), ''),
      }),
      output: v.object({
        documents: v.array(v.object({ path: v.string(), description: v.string() })),
      }),
      async run({ input }) {
        return { documents: await memory.list(input.path) };
      },
    }),
    defineTool({
      name: 'read_document',
      description: 'Read one selected Markdown memory document, including its YAML frontmatter.',
      input: v.object({ path: v.string() }),
      output: v.object({ path: v.string(), content: v.string() }),
      async run({ input }) {
        return { path: input.path, content: await memory.read(input.path) };
      },
    }),
  ];
}
