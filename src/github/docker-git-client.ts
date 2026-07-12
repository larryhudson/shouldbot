import type { CommandResult, CommandRunner } from '../sandboxes/command-runner.js';
import type { DockerContainer } from '../sandboxes/docker.js';

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const AUTH_SCRIPT = [
  'IFS= read -r SHOULDBOT_GITHUB_TOKEN',
  'export SHOULDBOT_GITHUB_TOKEN',
  'export GIT_ASKPASS=/usr/local/bin/shouldbot-git-askpass',
  'export GIT_TERMINAL_PROMPT=0',
  'exec git "$@"',
].join('; ');

export interface DockerGitClientOptions {
  container: DockerContainer;
  token: string;
  remoteUrl: string;
  branch: string;
  authorName: string;
  authorEmail: string;
  checkoutPath?: string;
}

export interface MemoryGitClient {
  clone(): Promise<void>;
  head(): Promise<string>;
  remoteHead(): Promise<string>;
  changedPaths(): Promise<string[]>;
  commitAndPush(message: string): Promise<string>;
}

export class DockerGitClient implements MemoryGitClient {
  readonly checkoutPath: string;
  private readonly runner: CommandRunner;

  constructor(private readonly options: DockerGitClientOptions) {
    this.checkoutPath = options.checkoutPath ?? '/workspace/memory';
    this.runner = options.container.runner;
  }

  async clone(): Promise<void> {
    await this.authenticated([
      'clone', '--branch', this.options.branch, '--single-branch', '--',
      this.options.remoteUrl, this.checkoutPath,
    ]);
  }

  async head(): Promise<string> {
    return (await this.git(['-C', this.checkoutPath, 'rev-parse', 'HEAD'])).trim();
  }

  async remoteHead(): Promise<string> {
    const output = await this.authenticated([
      '-C', this.checkoutPath, 'ls-remote', '--exit-code', 'origin',
      `refs/heads/${this.options.branch}`,
    ]);
    const sha = output.trim().split(/\s+/)[0];
    if (!sha || !/^[a-f0-9]{40,64}$/i.test(sha)) {
      throw new GitControlPlaneError('Git returned an invalid remote branch SHA.');
    }
    return sha;
  }

  async changedPaths(): Promise<string[]> {
    const output = await this.git([
      '-C', this.checkoutPath, 'status', '--porcelain=v1', '-z', '--untracked-files=all',
    ]);
    const entries = output.split('\0').filter(Boolean);
    const paths: string[] = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]!;
      paths.push(entry.slice(3));
      if (entry[0] === 'R' || entry[0] === 'C' || entry[1] === 'R' || entry[1] === 'C') {
        index += 1; // porcelain -z emits the original path as the next field
      }
    }
    return paths;
  }

  async commitAndPush(message: string): Promise<string> {
    await this.git(['-C', this.checkoutPath, 'add', '--all']);
    await this.git([
      '-C', this.checkoutPath,
      '-c', `user.name=${this.options.authorName}`,
      '-c', `user.email=${this.options.authorEmail}`,
      'commit', '--message', message,
    ]);
    await this.authenticated([
      '-C', this.checkoutPath, 'push', 'origin', `HEAD:${this.options.branch}`,
    ]);
    return this.head();
  }

  private async git(args: string[]): Promise<string> {
    const result = await this.runner.run({
      command: 'docker',
      args: ['exec', this.options.container.name, 'git', ...args],
    });
    return this.requireSuccess(result);
  }

  private async authenticated(args: string[]): Promise<string> {
    const result = await this.runner.run({
      command: 'docker',
      args: [
        'exec', '-i', this.options.container.name,
        'sh', '-c', AUTH_SCRIPT, 'shouldbot-authenticated-git', ...args,
      ],
      input: encoder.encode(`${this.options.token}\n`),
    });
    return this.requireSuccess(result);
  }

  private requireSuccess(result: CommandResult): string {
    if (result.exitCode !== 0) {
      throw new GitControlPlaneError(`Application-owned Git operation failed with exit code ${result.exitCode}.`);
    }
    return decoder.decode(result.stdout);
  }
}

export class GitControlPlaneError extends Error {
  readonly code = 'git_control_plane_failed';

  constructor(message: string) {
    super(message);
    this.name = 'GitControlPlaneError';
  }
}
