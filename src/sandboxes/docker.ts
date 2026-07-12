import {
  createSandboxSessionEnv,
  type FileStat,
  type SandboxApi,
  type SandboxFactory,
  type SessionEnv,
} from '@flue/runtime';

import type { CommandRunner } from './command-runner.js';

const decoder = new TextDecoder();

export interface DockerContainer {
  readonly name: string;
  readonly runner: CommandRunner;
}

class DockerSandboxApi implements SandboxApi {
  constructor(private readonly container: DockerContainer) {}

  async readFile(path: string): Promise<string> {
    return decoder.decode(await this.readFileBuffer(path));
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const result = await this.run(['exec', this.container.name, 'cat', '--', path]);
    this.assertSuccess(result.exitCode, result.stderr);
    return result.stdout;
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    const result = await this.run(
      ['exec', '-i', this.container.name, 'sh', '-c', 'cat > "$1"', 'shouldbot-write', path],
      typeof content === 'string' ? new TextEncoder().encode(content) : content,
    );
    this.assertSuccess(result.exitCode, result.stderr);
  }

  async stat(path: string): Promise<FileStat> {
    const format = '%F\u001f%s\u001f%Y';
    const result = await this.run([
      'exec', this.container.name, 'stat', '-c', format, path,
    ]);
    this.assertSuccess(result.exitCode, result.stderr);
    const [kind, size, modifiedSeconds] = decoder.decode(result.stdout).split('\u001f');
    return {
      isFile: kind === 'regular file',
      isDirectory: kind === 'directory',
      isSymbolicLink: kind === 'symbolic link',
      size: Number(size),
      mtime: new Date(Number(modifiedSeconds) * 1000),
    };
  }

  async readdir(path: string): Promise<string[]> {
    const result = await this.run([
      'exec', this.container.name, 'find', path, '-mindepth', '1', '-maxdepth', '1', '-print0',
    ]);
    this.assertSuccess(result.exitCode, result.stderr);
    const prefix = path.endsWith('/') ? path : `${path}/`;
    return decoder.decode(result.stdout)
      .split('\0')
      .filter(Boolean)
      .map((entry) => entry.startsWith(prefix) ? entry.slice(prefix.length) : entry);
  }

  async exists(path: string): Promise<boolean> {
    const result = await this.run(['exec', this.container.name, 'test', '-e', path]);
    if (result.exitCode === 0) return true;
    if (result.exitCode === 1) return false;
    this.assertSuccess(result.exitCode, result.stderr);
    return false;
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    const args = ['exec', this.container.name, 'mkdir'];
    if (options?.recursive) args.push('-p');
    args.push('--', path);
    const result = await this.run(args);
    this.assertSuccess(result.exitCode, result.stderr);
  }

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    const args = ['exec', this.container.name, 'rm'];
    if (options?.recursive) args.push('-r');
    if (options?.force) args.push('-f');
    args.push('--', path);
    const result = await this.run(args);
    this.assertSuccess(result.exitCode, result.stderr);
  }

  async exec(
    command: string,
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const args = ['exec'];
    if (options?.cwd) args.push('--workdir', options.cwd);
    for (const [key, value] of Object.entries(options?.env ?? {})) {
      args.push('--env', `${key}=${value}`);
    }
    args.push(this.container.name, 'sh', '-lc', command);
    const result = await this.container.runner.run({
      command: 'docker',
      args,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
    });
    return {
      stdout: decoder.decode(result.stdout),
      stderr: decoder.decode(result.stderr),
      exitCode: result.exitCode,
    };
  }

  private run(args: string[], input?: Uint8Array) {
    return this.container.runner.run({ command: 'docker', args, input });
  }

  private assertSuccess(exitCode: number, stderr: Uint8Array): void {
    if (exitCode !== 0) {
      throw new Error(`Docker sandbox operation failed (${exitCode}): ${decoder.decode(stderr).trim()}`);
    }
  }
}

export function docker(container: DockerContainer): SandboxFactory {
  return {
    async createSessionEnv(): Promise<SessionEnv> {
      return createSandboxSessionEnv(new DockerSandboxApi(container), '/workspace');
    },
  };
}
