import { loadConfig } from '../src/config.js';
import { GitHubAppTokenBroker } from '../src/github/app-token-broker.js';
import { DockerGitClient } from '../src/github/docker-git-client.js';
import { DockerSandboxManager } from '../src/sandboxes/docker-manager.js';

const config = await loadConfig();
const broker = await GitHubAppTokenBroker.fromConfig(config);
const manager = new DockerSandboxManager({
  image: config.sandbox.image,
  memory: config.sandbox.memory,
  cpus: config.sandbox.cpus,
  pidsLimit: config.sandbox.pidsLimit,
});
const installationToken = await broker.getToken();

const sha = await manager.withSandbox('github-clone-smoke', async (container) => {
  const git = new DockerGitClient({
    container,
    token: installationToken.token,
    remoteUrl: `https://github.com/${config.github.owner}/${config.github.repository}.git`,
    branch: config.github.defaultBranch,
    authorName: config.git.authorName,
    authorEmail: config.git.authorEmail,
  });
  await git.clone();
  const local = await git.head();
  const remote = await git.remoteHead();
  if (local !== remote) throw new Error('Cloned memory revision does not match the remote branch.');
  return local;
});

process.stdout.write(`Private memory clone verified at revision ${sha}.\n`);
