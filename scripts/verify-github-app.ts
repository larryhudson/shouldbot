import { loadConfig } from '../src/config.js';
import { GitHubAppTokenBroker } from '../src/github/app-token-broker.js';

const config = await loadConfig();
const broker = await GitHubAppTokenBroker.fromConfig(config);
const installationToken = await broker.getToken();
const response = await fetch(
  `https://api.github.com/repos/${encodeURIComponent(config.github.owner)}/${encodeURIComponent(config.github.repository)}`,
  {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${installationToken.token}`,
      'user-agent': 'shouldbot',
      'x-github-api-version': '2022-11-28',
    },
  },
);

if (!response.ok) {
  throw new Error(`GitHub repository access verification failed with status ${response.status}.`);
}

const repository: unknown = await response.json();
if (!repository || typeof repository !== 'object') {
  throw new Error('GitHub returned invalid repository metadata.');
}
const metadata = repository as Record<string, unknown>;
if (metadata.private !== true) {
  throw new Error('The configured memory repository must be private.');
}
if (metadata.default_branch !== config.github.defaultBranch) {
  throw new Error('The configured default branch does not match GitHub repository metadata.');
}

process.stdout.write(
  `GitHub App access verified for ${config.github.owner}/${config.github.repository}; token expires ${installationToken.expiresAt.toISOString()}.\n`,
);
