import { access, constants } from 'node:fs/promises';
import path from 'node:path';

import type { ThinkingLevel } from '@flue/runtime';

export interface ShouldbotConfig {
  server: {
    port: number;
    baseUrl: URL;
  };
  github: {
    allowedUserId: number;
    clientId: string;
    clientSecret: string;
    callbackUrl: URL;
    appId: number;
    installationId: number;
    privateKeyPath: string;
    owner: string;
    repository: string;
    defaultBranch: string;
  };
  sessionSecret: string;
  codex: {
    authDirectory: string;
    model: string;
    reasoningLevel: ThinkingLevel;
  };
  sandbox: {
    image: string;
    memory: string;
    cpus: string;
    pidsLimit: number;
    timeoutMs: number;
  };
  git: {
    authorName: string;
    authorEmail: string;
  };
}

export async function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ShouldbotConfig> {
  const privateKeyPath = absolutePath(env, 'SHOULDBOT_GITHUB_PRIVATE_KEY_PATH');
  const authDirectory = absolutePath(env, 'SHOULDBOT_CODEX_AUTH_PATH');
  await requireAccess(privateKeyPath, constants.R_OK, 'GitHub App private key');
  await requireAccess(authDirectory, constants.R_OK | constants.W_OK, 'Codex auth directory');

  const baseUrl = url(env, 'SHOULDBOT_BASE_URL');
  const callbackUrl = url(env, 'SHOULDBOT_GITHUB_CALLBACK_URL');
  requireSecureOrLocal(baseUrl, 'SHOULDBOT_BASE_URL');
  requireSecureOrLocal(callbackUrl, 'SHOULDBOT_GITHUB_CALLBACK_URL');

  const sessionSecret = required(env, 'SHOULDBOT_SESSION_SECRET');
  if (Buffer.byteLength(sessionSecret) < 32) {
    throw new Error('SHOULDBOT_SESSION_SECRET must contain at least 32 bytes.');
  }

  return {
    server: { port: positiveInteger(env, 'PORT'), baseUrl },
    github: {
      allowedUserId: positiveInteger(env, 'SHOULDBOT_ALLOWED_GITHUB_USER_ID'),
      clientId: required(env, 'SHOULDBOT_GITHUB_CLIENT_ID'),
      clientSecret: required(env, 'SHOULDBOT_GITHUB_CLIENT_SECRET'),
      callbackUrl,
      appId: positiveInteger(env, 'SHOULDBOT_GITHUB_APP_ID'),
      installationId: positiveInteger(env, 'SHOULDBOT_GITHUB_INSTALLATION_ID'),
      privateKeyPath,
      owner: slug(env, 'SHOULDBOT_GITHUB_OWNER'),
      repository: slug(env, 'SHOULDBOT_GITHUB_REPOSITORY'),
      defaultBranch: branch(env, 'SHOULDBOT_GITHUB_DEFAULT_BRANCH'),
    },
    sessionSecret,
    codex: {
      authDirectory,
      model: required(env, 'SHOULDBOT_CODEX_MODEL'),
      reasoningLevel: reasoningLevel(env, 'SHOULDBOT_CODEX_REASONING_LEVEL'),
    },
    sandbox: {
      image: required(env, 'SHOULDBOT_SANDBOX_IMAGE'),
      memory: required(env, 'SHOULDBOT_SANDBOX_MEMORY'),
      cpus: required(env, 'SHOULDBOT_SANDBOX_CPUS'),
      pidsLimit: positiveInteger(env, 'SHOULDBOT_SANDBOX_PIDS_LIMIT'),
      timeoutMs: positiveInteger(env, 'SHOULDBOT_SANDBOX_TIMEOUT_MS'),
    },
    git: {
      authorName: required(env, 'SHOULDBOT_GIT_AUTHOR_NAME'),
      authorEmail: email(env, 'SHOULDBOT_GIT_AUTHOR_EMAIL'),
    },
  };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value || value.startsWith('replace-with-') || value.startsWith('/absolute/path/')) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function positiveInteger(env: NodeJS.ProcessEnv, name: string): number {
  const raw = required(env, name);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function absolutePath(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  if (!path.isAbsolute(value)) throw new Error(`${name} must be an absolute path.`);
  return value;
}

function url(env: NodeJS.ProcessEnv, name: string): URL {
  try {
    return new URL(required(env, name));
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }
}

function requireSecureOrLocal(value: URL, name: string): void {
  if (value.protocol === 'https:') return;
  if (value.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname)) return;
  throw new Error(`${name} must use HTTPS except on localhost.`);
}

function slug(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) throw new Error(`${name} contains unsupported characters.`);
  return value;
}

function branch(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  if (value.startsWith('-') || value.includes('..') || /[\s~^:?*[\\]/.test(value)) {
    throw new Error(`${name} is not a safe Git branch name.`);
  }
  return value;
}

function email(env: NodeJS.ProcessEnv, name: string): string {
  const value = required(env, name);
  if (!/^[^\s@]+@[^\s@]+$/.test(value)) throw new Error(`${name} must be an email address.`);
  return value;
}

function reasoningLevel(env: NodeJS.ProcessEnv, name: string): ThinkingLevel {
  const value = required(env, name);
  const levels: ThinkingLevel[] = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  if (!levels.includes(value as ThinkingLevel)) {
    throw new Error(`${name} must be one of: ${levels.join(', ')}.`);
  }
  return value as ThinkingLevel;
}

async function requireAccess(target: string, mode: number, description: string): Promise<void> {
  try {
    await access(target, mode);
  } catch {
    throw new Error(`${description} is not accessible at its configured path.`);
  }
}
