import type { ShouldbotConfig } from '../config.js';
import { DockerGitClient, type MemoryGitClient } from '../github/docker-git-client.js';
import type { GitHubAppTokenBroker } from '../github/app-token-broker.js';
import type { DockerSandboxManager } from '../sandboxes/docker-manager.js';
import type { DockerContainer } from '../sandboxes/docker.js';

export interface MemoryTransactionContext {
  container: DockerContainer;
  checkoutPath: string;
  startingSha: string;
}

export interface MemoryTransactionResult<T> {
  value: T;
  commitSha: string;
  changedPaths: string[];
}

export interface MemoryTransactionOptions {
  config: ShouldbotConfig;
  sandboxManager: DockerSandboxManager;
  tokenBroker: Pick<GitHubAppTokenBroker, 'getToken'>;
  createGitClient?: (container: DockerContainer, token: string) => MemoryGitClient;
}

export class MemoryTransaction {
  private readonly createGitClient: (container: DockerContainer, token: string) => MemoryGitClient;

  constructor(private readonly options: MemoryTransactionOptions) {
    this.createGitClient = options.createGitClient ?? ((container, token) => new DockerGitClient({
      container,
      token,
      remoteUrl: `https://github.com/${options.config.github.owner}/${options.config.github.repository}.git`,
      branch: options.config.github.defaultBranch,
      authorName: options.config.git.authorName,
      authorEmail: options.config.git.authorEmail,
    }));
  }

  async run<T>(options: {
    runId: string;
    commitMessage: string;
    work(context: MemoryTransactionContext): Promise<T>;
    validate(context: MemoryTransactionContext, changedPaths: string[]): Promise<void>;
  }): Promise<MemoryTransactionResult<T>> {
    const installationToken = await this.options.tokenBroker.getToken();
    return this.options.sandboxManager.withSandbox(options.runId, async (container) => {
      const git = this.createGitClient(container, installationToken.token);
      await git.clone();
      const startingSha = await git.head();
      const context = { container, checkoutPath: '/workspace/memory', startingSha };
      const value = await options.work(context);
      const changedPaths = await git.changedPaths();
      if (changedPaths.length === 0) throw new NoMemoryChangesError();
      await options.validate(context, changedPaths);
      const currentRemoteSha = await git.remoteHead();
      if (currentRemoteSha !== startingSha) {
        throw new MemoryBranchConflictError(startingSha, currentRemoteSha);
      }
      const commitSha = await git.commitAndPush(options.commitMessage);
      return { value, commitSha, changedPaths };
    });
  }
}

export class MemoryBranchConflictError extends Error {
  readonly code = 'memory_branch_changed';

  constructor(readonly startingSha: string, readonly currentSha: string) {
    super('Memory changed while this reflection was processing. Please retry against the latest memory revision.');
    this.name = 'MemoryBranchConflictError';
  }
}

export class NoMemoryChangesError extends Error {
  readonly code = 'no_memory_changes';

  constructor() {
    super('The workflow completed without producing any memory changes.');
    this.name = 'NoMemoryChangesError';
  }
}
