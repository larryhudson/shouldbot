import { CodexCredentialPool } from '../auth/codex-credential-pool.js';
import { loadConfig } from '../config.js';
import { GitHubAppTokenBroker } from '../github/app-token-broker.js';
import { DockerSandboxManager } from '../sandboxes/docker-manager.js';

export async function createServices() {
  const config = await loadConfig();
  return {
    config,
    codexPool: new CodexCredentialPool(config.codex.authDirectory),
    tokenBroker: await GitHubAppTokenBroker.fromConfig(config),
    sandboxManager: new DockerSandboxManager({
      image: config.sandbox.image,
      memory: config.sandbox.memory,
      cpus: config.sandbox.cpus,
      pidsLimit: config.sandbox.pidsLimit,
    }),
  };
}

export type ShouldbotServices = Awaited<ReturnType<typeof createServices>>;

let servicesPromise: Promise<ShouldbotServices> | undefined;

export function getServices(): Promise<ShouldbotServices> {
  servicesPromise ??= createServices();
  return servicesPromise;
}
