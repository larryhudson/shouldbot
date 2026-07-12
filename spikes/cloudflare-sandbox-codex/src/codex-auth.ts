import { refreshOpenAICodexToken } from '@earendil-works/pi-ai/oauth';

export interface CodexAuthEnv {
  OPENAI_CODEX_ACCESS_TOKEN?: string;
  OPENAI_CODEX_REFRESH_TOKEN?: string;
  OPENAI_CODEX_EXPIRES_AT?: string;
}

export interface ResolvedCodexAuth {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
  refreshed: boolean;
}

const REFRESH_SKEW_MS = 60_000;

export async function resolveCodexAuth(
  env: CodexAuthEnv,
  now = Date.now(),
): Promise<ResolvedCodexAuth> {
  const accessToken = requireValue(
    env.OPENAI_CODEX_ACCESS_TOKEN,
    'OPENAI_CODEX_ACCESS_TOKEN',
  );
  const refreshToken = requireValue(
    env.OPENAI_CODEX_REFRESH_TOKEN,
    'OPENAI_CODEX_REFRESH_TOKEN',
  );
  const expiresAt = Number(env.OPENAI_CODEX_EXPIRES_AT);

  if (!Number.isFinite(expiresAt)) {
    throw new Error('OPENAI_CODEX_EXPIRES_AT must be an epoch timestamp in milliseconds.');
  }

  if (now + REFRESH_SKEW_MS < expiresAt) {
    return {
      accessToken,
      expiresAt,
      refreshToken,
      refreshed: false,
    };
  }

  const refreshed = await refreshOpenAICodexToken(refreshToken);

  return {
    accessToken: refreshed.access,
    expiresAt: refreshed.expires,
    refreshToken: refreshed.refresh,
    refreshed: true,
  };
}

function requireValue(value: string | undefined, name: string): string {
  if (!value || value === 'replace-me') {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}
