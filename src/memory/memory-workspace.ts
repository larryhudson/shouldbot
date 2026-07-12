import path from 'node:path/posix';

import type { FileStat, SessionEnv } from '@flue/runtime';
import { parse, stringify } from 'yaml';

export interface MemoryIndexEntry {
  path: string;
  description: string;
}

export interface ParsedMemoryDocument {
  frontmatter: Record<string, unknown>;
  description: string;
  body: string;
}

export interface MemoryWorkspaceOptions {
  env: SessionEnv;
  checkoutPath?: string;
}

export class MemoryWorkspace {
  readonly root: string;

  constructor(private readonly options: MemoryWorkspaceOptions) {
    this.root = path.join(options.checkoutPath ?? '/workspace/memory', 'memory');
  }

  async list(relativeDirectory = ''): Promise<MemoryIndexEntry[]> {
    if (!(await this.options.env.exists(this.root))) return [];
    const safeDirectory = memoryDirectoryPath(relativeDirectory);
    const target = safeDirectory ? path.join(this.root, safeDirectory) : this.root;
    if (!(await this.options.env.exists(target))) {
      throw new MemoryValidationError(`Memory directory ${safeDirectory} does not exist.`);
    }
    const targetStat = await this.options.env.stat(target);
    if (!targetStat.isDirectory || targetStat.isSymbolicLink) {
      throw new MemoryValidationError(`${safeDirectory || 'memory'} is not a safe memory directory.`);
    }
    const paths = await this.walk(target);
    const entries: MemoryIndexEntry[] = [];
    for (const absolutePath of paths) {
      const relativePath = path.relative(this.root, absolutePath);
      const document = parseMemoryDocument(await this.options.env.readFile(absolutePath), relativePath);
      entries.push({ path: relativePath, description: document.description });
    }
    return entries.sort((a, b) => a.path.localeCompare(b.path));
  }

  async read(relativePath: string): Promise<string> {
    const safePath = memoryPath(relativePath);
    const absolutePath = path.join(this.root, safePath);
    if (!(await this.options.env.exists(absolutePath))) {
      throw new MemoryValidationError(`Memory document ${safePath} does not exist.`);
    }
    const content = await this.options.env.readFile(absolutePath);
    parseMemoryDocument(content, safePath);
    return content;
  }

  async writeDocument(relativePath: string, content: string): Promise<void> {
    const safePath = memoryPath(relativePath);
    if (isReflectionPath(safePath)) {
      throw new MemoryValidationError('Reflection source documents are create-only.');
    }
    parseMemoryDocument(content, safePath);
    await this.options.env.writeFile(path.join(this.root, safePath), content);
  }

  async saveReflection(options: {
    date: string;
    id: string;
    description: string;
    original: string;
  }): Promise<string> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date)) {
      throw new MemoryValidationError('Reflection date must use YYYY-MM-DD.');
    }
    const id = options.id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!id) throw new MemoryValidationError('Reflection ID must contain a letter or number.');
    const description = options.description.trim();
    if (!description) throw new MemoryValidationError('Reflection description must not be empty.');
    if (!options.original.trim()) throw new MemoryValidationError('Original reflection must not be empty.');

    const relativePath = `reflections/${options.date}-${id}.md`;
    const absolutePath = path.join(this.root, relativePath);
    if (await this.options.env.exists(absolutePath)) {
      throw new MemoryValidationError(`Reflection ${relativePath} already exists and cannot be overwritten.`);
    }
    const frontmatter = stringify({ description }).trimEnd();
    const content = `---\n${frontmatter}\n---\n\n## Original reflection\n\n${options.original}`;
    await this.options.env.writeFile(absolutePath, content);
    return relativePath;
  }

  async validateWorkspace(options: { changedPaths: string[]; protectedReflections?: Record<string, string> }): Promise<void> {
    const protectedReflections = new Map(
      Object.entries(options.protectedReflections ?? {}).map(([key, value]) => [`memory/${memoryPath(key)}`, value]),
    );
    for (const changedPath of options.changedPaths) {
      const normalized = gitMemoryPath(changedPath);
      if (normalized.startsWith('memory/reflections/') && !protectedReflections.has(normalized)) {
        throw new MemoryValidationError(`Reflection source change is not authorized: ${normalized}.`);
      }
    }

    if (!(await this.options.env.exists(this.root))) {
      throw new MemoryValidationError('The memory repository must contain a memory directory.');
    }
    await this.list();
    for (const [gitPath, expectedContent] of protectedReflections) {
      const relativePath = gitPath.slice('memory/'.length);
      if (await this.read(relativePath) !== expectedContent) {
        throw new MemoryValidationError(`Original reflection was modified after capture: ${gitPath}.`);
      }
    }
  }

  private async walk(directory: string): Promise<string[]> {
    const files: string[] = [];
    for (const name of await this.options.env.readdir(directory)) {
      if (name.includes('/') || name === '.' || name === '..') {
        throw new MemoryValidationError('Sandbox returned an unsafe directory entry.');
      }
      const absolutePath = path.join(directory, name);
      const stat = await this.options.env.stat(absolutePath);
      assertSafeStat(stat, path.relative(this.root, absolutePath));
      if (stat.isDirectory) files.push(...await this.walk(absolutePath));
      else {
        const relativePath = path.relative(this.root, absolutePath);
        memoryPath(relativePath);
        files.push(absolutePath);
      }
    }
    return files;
  }
}

export function memoryPath(input: string): string {
  if (!input || input.includes('\0') || input.includes('\\') || input.startsWith('/')) {
    throw new MemoryValidationError('Memory path must be a relative POSIX path.');
  }
  const normalized = path.normalize(input);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized !== input) {
    throw new MemoryValidationError('Memory path traversal or non-normalized paths are not allowed.');
  }
  if (!normalized.endsWith('.md')) {
    throw new MemoryValidationError('Memory documents must use the .md extension.');
  }
  return normalized;
}

export function memoryDirectoryPath(input: string): string {
  if (input === '') return '';
  if (input.includes('\0') || input.includes('\\') || input.startsWith('/')) {
    throw new MemoryValidationError('Memory directory must be a relative POSIX path.');
  }
  const normalized = path.normalize(input);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized !== input) {
    throw new MemoryValidationError('Memory directory traversal or non-normalized paths are not allowed.');
  }
  return normalized;
}

export function gitMemoryPath(input: string): string {
  if (!input.startsWith('memory/')) {
    throw new MemoryValidationError(`Changed path is outside the memory root: ${input}.`);
  }
  const relative = input.slice('memory/'.length);
  return `memory/${memoryPath(relative)}`;
}

export function parseMemoryDocument(content: string, documentPath = 'document.md'): ParsedMemoryDocument {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    throw new MemoryValidationError(`${documentPath} must begin with YAML frontmatter.`);
  }
  const closing = normalized.indexOf('\n---\n', 4);
  if (closing < 0) throw new MemoryValidationError(`${documentPath} has unclosed YAML frontmatter.`);
  let frontmatter: unknown;
  try {
    frontmatter = parse(normalized.slice(4, closing));
  } catch {
    throw new MemoryValidationError(`${documentPath} contains invalid YAML frontmatter.`);
  }
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new MemoryValidationError(`${documentPath} frontmatter must be a YAML mapping.`);
  }
  const description = (frontmatter as Record<string, unknown>).description;
  if (typeof description !== 'string' || !description.trim()) {
    throw new MemoryValidationError(`${documentPath} must have a non-empty string description.`);
  }
  return {
    frontmatter: frontmatter as Record<string, unknown>,
    description: description.trim(),
    body: normalized.slice(closing + 5),
  };
}

function assertSafeStat(stat: FileStat, relativePath: string): void {
  if (stat.isSymbolicLink) throw new MemoryValidationError(`Symbolic links are not allowed in memory: ${relativePath}.`);
  if (!stat.isFile && !stat.isDirectory) {
    throw new MemoryValidationError(`Unsupported filesystem entry in memory: ${relativePath}.`);
  }
}

function isReflectionPath(relativePath: string): boolean {
  return relativePath.startsWith('reflections/');
}

export class MemoryValidationError extends Error {
  readonly code = 'memory_validation_failed';

  constructor(message: string) {
    super(message);
    this.name = 'MemoryValidationError';
  }
}
