import { randomUUID } from 'node:crypto';

import { processCommandRunner, type CommandRunner } from './command-runner.js';
import type { DockerContainer } from './docker.js';

export interface DockerSandboxManagerOptions {
  image: string;
  memory?: string;
  cpus?: string;
  pidsLimit?: number;
  runner?: CommandRunner;
}

export class DockerSandboxManager {
  private readonly runner: CommandRunner;

  constructor(private readonly options: DockerSandboxManagerOptions) {
    this.runner = options.runner ?? processCommandRunner;
  }

  async create(runId: string): Promise<DockerContainer> {
    const name = this.containerName(runId);
    const args = [
      'run', '--detach', '--rm', '--name', name,
      '--label', 'shouldbot.sandbox=true',
      '--label', `shouldbot.run-id=${runId}`,
      '--network', 'bridge',
      '--memory', this.options.memory ?? '1g',
      '--cpus', this.options.cpus ?? '1',
      '--pids-limit', String(this.options.pidsLimit ?? 256),
      '--read-only',
      '--tmpfs', '/tmp:rw,noexec,nosuid,size=128m',
      '--tmpfs', '/workspace:rw,exec,nosuid,size=1g,uid=10001,gid=10001,mode=0700',
      this.options.image,
      'sleep', 'infinity',
    ];
    const result = await this.runner.run({ command: 'docker', args });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create Docker sandbox: ${new TextDecoder().decode(result.stderr).trim()}`);
    }
    return { name, runner: this.runner };
  }

  async destroy(container: DockerContainer): Promise<void> {
    const result = await this.runner.run({
      command: 'docker',
      args: ['rm', '--force', container.name],
    });
    if (result.exitCode !== 0) {
      const stderr = new TextDecoder().decode(result.stderr);
      if (!stderr.includes('No such container')) {
        throw new Error(`Failed to destroy Docker sandbox: ${stderr.trim()}`);
      }
    }
  }

  async withSandbox<T>(runId: string, work: (container: DockerContainer) => Promise<T>): Promise<T> {
    const container = await this.create(runId);
    try {
      return await work(container);
    } finally {
      await this.destroy(container);
    }
  }

  private containerName(runId: string): string {
    const safeRunId = runId.toLowerCase().replace(/[^a-z0-9_.-]/g, '-').slice(0, 40);
    return `shouldbot-${safeRunId}-${randomUUID().slice(0, 8)}`;
  }
}
