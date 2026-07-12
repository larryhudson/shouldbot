import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { refreshOpenAICodexToken } from '@earendil-works/pi-ai/oauth';

const CURSOR_FILE = '.round-robin-cursor';
const REFRESH_SKEW_MS = 60_000;

interface OAuthCredential {
  type: 'oauth';
  access: string;
  refresh: string;
  expires: number;
}

interface PiAuthFile {
  'openai-codex'?: OAuthCredential;
  [provider: string]: unknown;
}

export interface SelectedCodexCredential {
  accessToken: string;
  source: string;
}

export class AllCodexSubscriptionsRateLimitedError extends Error {
  readonly code = 'all_codex_subscriptions_rate_limited';

  constructor(readonly subscriptionCount: number) {
    super(
      `All ${subscriptionCount} configured Codex subscriptions are currently rate-limited. Please try again later.`,
    );
    this.name = 'AllCodexSubscriptionsRateLimitedError';
  }
}

export interface CodexCredentialPoolOptions {
  refresh?: typeof refreshOpenAICodexToken;
  now?: () => number;
}

export class CodexCredentialPool {
  private pending: Promise<void> = Promise.resolve();
  private readonly refresh: typeof refreshOpenAICodexToken;
  private readonly now: () => number;

  constructor(
    private readonly directory: string,
    options: CodexCredentialPoolOptions = {},
  ) {
    this.refresh = options.refresh ?? refreshOpenAICodexToken;
    this.now = options.now ?? Date.now;
  }

  select(): Promise<SelectedCodexCredential> {
    return this.withLock(() => this.selectLocked());
  }

  withRateLimitFailover<T>(
    operation: (credential: SelectedCodexCredential) => Promise<T>,
    options: { excludeSources?: string[] } = {},
  ): Promise<T> {
    return this.withLock(() => this.withRateLimitFailoverLocked(operation, options));
  }

  private async selectLocked(): Promise<SelectedCodexCredential> {
    const files = (await readdir(this.directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();

    if (files.length === 0) {
      throw new Error(`No Pi auth JSON files found in ${this.directory}.`);
    }

    const index = (await this.readCursor()) % files.length;
    const credential = await this.resolveCredential(files[index]!);
    await this.writeCursor((index + 1) % files.length);
    return credential;
  }

  private async withRateLimitFailoverLocked<T>(
    operation: (credential: SelectedCodexCredential) => Promise<T>,
    options: { excludeSources?: string[] },
  ): Promise<T> {
    const files = (await readdir(this.directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();

    if (files.length === 0) {
      throw new Error(`No Pi auth JSON files found in ${this.directory}.`);
    }

    const startIndex = (await this.readCursor()) % files.length;
    const excluded = new Set(options.excludeSources ?? []);
    for (let offset = 0; offset < files.length; offset += 1) {
      const index = (startIndex + offset) % files.length;
      if (excluded.has(files[index]!)) continue;
      const credential = await this.resolveCredential(files[index]!);
      try {
        const result = await operation(credential);
        await this.writeCursor((index + 1) % files.length);
        return result;
      } catch (error) {
        if (!isRateLimitError(error)) throw error;
      }
    }

    await this.writeCursor((startIndex + 1) % files.length);
    throw new AllCodexSubscriptionsRateLimitedError(files.length);
  }

  private async resolveCredential(filename: string): Promise<SelectedCodexCredential> {
    const filePath = path.join(this.directory, filename);
    const auth = await this.readAuthFile(filePath);
    let credential = requireCodexCredential(auth, filename);

    if (this.now() + REFRESH_SKEW_MS >= credential.expires) {
      const refreshed = await this.refresh(credential.refresh);
      credential = {
        type: 'oauth',
        access: refreshed.access,
        refresh: refreshed.refresh,
        expires: refreshed.expires,
      };
      auth['openai-codex'] = credential;
      await atomicWriteJson(filePath, auth);
    }

    return { accessToken: credential.access, source: filename };
  }

  private withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readAuthFile(filePath: string): Promise<PiAuthFile> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
      throw new Error(`Could not read Pi auth file ${path.basename(filePath)}.`, { cause: error });
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Pi auth file ${path.basename(filePath)} must contain a JSON object.`);
    }
    return parsed as PiAuthFile;
  }

  private async readCursor(): Promise<number> {
    try {
      const value = Number.parseInt(await readFile(path.join(this.directory, CURSOR_FILE), 'utf8'), 10);
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  private async writeCursor(cursor: number): Promise<void> {
    await atomicWrite(path.join(this.directory, CURSOR_FILE), `${cursor}\n`);
  }
}

export function isRateLimitError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      if (record.status === 429 || record.statusCode === 429 || record.code === 429 || record.code === 'rate_limit_exceeded') {
        return true;
      }
      if (typeof record.message === 'string' && isRateLimitMessage(record.message)) return true;
      current = record.cause;
      continue;
    }
    if (typeof current === 'string' && isRateLimitMessage(current)) return true;
    break;
  }
  return false;
}

function isRateLimitMessage(message: string): boolean {
  return /\busage limit (?:has been )?reached\b|\brate[ -]?limit(?:ed| exceeded)?\b|\btoo many requests\b/i.test(message);
}

function requireCodexCredential(auth: PiAuthFile, filename: string): OAuthCredential {
  const credential = auth['openai-codex'];
  if (
    !credential ||
    credential.type !== 'oauth' ||
    typeof credential.access !== 'string' ||
    credential.access.length === 0 ||
    typeof credential.refresh !== 'string' ||
    credential.refresh.length === 0 ||
    typeof credential.expires !== 'number' ||
    !Number.isFinite(credential.expires)
  ) {
    throw new Error(`Pi auth file ${filename} has no valid openai-codex OAuth credential.`);
  }
  return credential;
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600 });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, filePath);
  } catch (error) {
    throw new Error(`Could not atomically update ${path.basename(filePath)}.`, { cause: error });
  }
}
