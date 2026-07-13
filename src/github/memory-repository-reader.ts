import type { ShouldbotConfig } from '../config.js';
import type { GitHubAppTokenBroker } from './app-token-broker.js';

const GITHUB_API_VERSION = '2022-11-28';
const PROMPTS_FILENAME = /^\d{4}-\d{2}-\d{2}T\d{6}Z\.md$/;

export interface RepositoryDocument {
  path: string;
  content: string;
  blobSha: string;
}

export interface MemoryRepositoryReaderOptions {
  config: ShouldbotConfig;
  tokenBroker: Pick<GitHubAppTokenBroker, 'getToken'>;
  fetch?: typeof fetch;
  apiBaseUrl?: string;
}

export class MemoryRepositoryReader {
  private readonly fetch: typeof fetch;
  private readonly apiBaseUrl: string;

  constructor(private readonly options: MemoryRepositoryReaderOptions) {
    this.fetch = options.fetch ?? fetch;
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.github.com';
  }

  async readDaily(localDate: string): Promise<RepositoryDocument> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new Error('Daily date must use YYYY-MM-DD.');
    return this.readFile(`memory/daily/${localDate}.md`);
  }

  async readLatestPrompts(): Promise<RepositoryDocument> {
    const entries = await this.readDirectory('memory/prompts');
    const latest = entries
      .filter((entry) => entry.type === 'file' && PROMPTS_FILENAME.test(entry.name))
      .sort((a, b) => b.name.localeCompare(a.name))[0];
    if (!latest) throw new MemoryArtifactNotFoundError('memory/prompts');
    return this.readFile(latest.path);
  }

  private async readDirectory(path: string): Promise<GitHubDirectoryEntry[]> {
    const response = await this.request(path);
    if (response.status === 404) throw new MemoryArtifactNotFoundError(path);
    if (!response.ok) throw new MemoryRepositoryReadError(response.status, response.headers.get('x-github-request-id'));
    const body: unknown = await response.json();
    if (!Array.isArray(body) || !body.every(isDirectoryEntry)) {
      throw new MemoryRepositoryReadError(response.status, response.headers.get('x-github-request-id'));
    }
    return body;
  }

  private async readFile(path: string): Promise<RepositoryDocument> {
    const response = await this.request(path);
    if (response.status === 404) throw new MemoryArtifactNotFoundError(path);
    if (!response.ok) throw new MemoryRepositoryReadError(response.status, response.headers.get('x-github-request-id'));
    const body: unknown = await response.json();
    if (!isFileResponse(body)) {
      throw new MemoryRepositoryReadError(response.status, response.headers.get('x-github-request-id'));
    }
    return {
      path: body.path,
      content: Buffer.from(body.content.replaceAll('\n', ''), 'base64').toString('utf8'),
      blobSha: body.sha,
    };
  }

  private async request(path: string): Promise<Response> {
    const token = await this.options.tokenBroker.getToken();
    const { owner, repository, defaultBranch } = this.options.config.github;
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = new URL(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents/${encodedPath}`,
      this.apiBaseUrl,
    );
    url.searchParams.set('ref', defaultBranch);
    return this.fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token.token}`,
        'user-agent': 'shouldbot',
        'x-github-api-version': GITHUB_API_VERSION,
      },
    });
  }
}

interface GitHubDirectoryEntry {
  type: string;
  name: string;
  path: string;
}

function isDirectoryEntry(value: unknown): value is GitHubDirectoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.type === 'string' && typeof entry.name === 'string' && typeof entry.path === 'string';
}

function isFileResponse(value: unknown): value is {
  type: 'file'; path: string; sha: string; encoding: 'base64'; content: string;
} {
  if (!value || typeof value !== 'object') return false;
  const file = value as Record<string, unknown>;
  return file.type === 'file' && file.encoding === 'base64' &&
    typeof file.path === 'string' && typeof file.sha === 'string' && typeof file.content === 'string';
}

export class MemoryArtifactNotFoundError extends Error {
  readonly code = 'memory_artifact_not_found';

  constructor(readonly path: string) {
    super(`No generated memory artifact exists at ${path}.`);
    this.name = 'MemoryArtifactNotFoundError';
  }
}

export class MemoryRepositoryReadError extends Error {
  readonly code = 'memory_repository_read_failed';

  constructor(readonly status: number, readonly requestId: string | null) {
    super(`Reading generated memory from GitHub failed with status ${status}${
      requestId ? ` (request ${requestId})` : ''
    }.`);
    this.name = 'MemoryRepositoryReadError';
  }
}
