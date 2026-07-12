import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { ShouldbotConfig } from '../config.js';

const GITHUB_API_VERSION = '2022-11-28';
const REFRESH_SKEW_MS = 60_000;

export interface InstallationToken {
  token: string;
  expiresAt: Date;
}

export interface GitHubAppTokenBrokerOptions {
  appId: number;
  installationId: number;
  repository: string;
  privateKey: string;
  fetch?: typeof fetch;
  now?: () => number;
  apiBaseUrl?: string;
}

export class GitHubAppTokenBroker {
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private readonly apiBaseUrl: string;
  private cached?: InstallationToken;
  private pending?: Promise<InstallationToken>;

  constructor(private readonly options: GitHubAppTokenBrokerOptions) {
    this.fetch = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.github.com';
  }

  static async fromConfig(config: ShouldbotConfig): Promise<GitHubAppTokenBroker> {
    const privateKey = await readFile(config.github.privateKeyPath, 'utf8');
    return new GitHubAppTokenBroker({
      appId: config.github.appId,
      installationId: config.github.installationId,
      repository: config.github.repository,
      privateKey,
    });
  }

  async getToken(): Promise<InstallationToken> {
    if (this.cached && this.cached.expiresAt.getTime() - REFRESH_SKEW_MS > this.now()) {
      return this.cached;
    }
    if (this.pending) return this.pending;
    this.pending = this.mintToken();
    try {
      this.cached = await this.pending;
      return this.cached;
    } finally {
      this.pending = undefined;
    }
  }

  private async mintToken(): Promise<InstallationToken> {
    const response = await this.fetch(
      `${this.apiBaseUrl}/app/installations/${this.options.installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${this.createAppJwt()}`,
          'content-type': 'application/json',
          'user-agent': 'shouldbot',
          'x-github-api-version': GITHUB_API_VERSION,
        },
        body: JSON.stringify({
          repositories: [this.options.repository],
          permissions: { contents: 'write' },
        }),
      },
    );

    if (!response.ok) {
      const requestId = response.headers.get('x-github-request-id');
      throw new GitHubTokenMintError(response.status, requestId);
    }

    const body: unknown = await response.json();
    if (!isTokenResponse(body)) {
      throw new Error('GitHub returned an invalid installation-token response.');
    }
    return { token: body.token, expiresAt: new Date(body.expires_at) };
  }

  private createAppJwt(): string {
    const nowSeconds = Math.floor(this.now() / 1000);
    const header = encodeJson({ alg: 'RS256', typ: 'JWT' });
    const payload = encodeJson({
      iat: nowSeconds - 60,
      exp: nowSeconds + 9 * 60,
      iss: String(this.options.appId),
    });
    const unsigned = `${header}.${payload}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(this.options.privateKey, 'base64url');
    return `${unsigned}.${signature}`;
  }
}

export class GitHubTokenMintError extends Error {
  readonly code = 'github_installation_token_failed';

  constructor(readonly status: number, readonly requestId: string | null) {
    super(
      `GitHub App installation authentication failed with status ${status}${
        requestId ? ` (request ${requestId})` : ''
      }.`,
    );
    this.name = 'GitHubTokenMintError';
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function isTokenResponse(value: unknown): value is { token: string; expires_at: string } {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.token === 'string' && record.token.length > 0 &&
    typeof record.expires_at === 'string' && !Number.isNaN(Date.parse(record.expires_at));
}
