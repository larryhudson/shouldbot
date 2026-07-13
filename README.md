# Shouldbot

Shouldbot is a self-hosted Flue application for reflective, GitHub-backed personal memory. The target architecture runs the Flue Node.js service on a trusted Linux server, reachable over Tailscale, and provisions one disposable Docker sandbox for each agent workflow.

The private GitHub memory repository is the durable source of truth. A sandbox checkout is temporary and must be validated, committed atomically, pushed only after a remote-SHA conflict check, and destroyed after success or failure.

## Current implementation slice

The initial scaffold contains:

- A project-owned Docker lifecycle manager with memory, CPU, PID, filesystem, and temporary-workspace constraints.
- A pure adapter from an already-created Docker container to Flue's public `SandboxFactory` contract.
- Guaranteed container cleanup through the application-owned `withSandbox(...)` boundary.
- Unit tests for container constraints and failure cleanup.
- A real Docker smoke script that exercises Flue's `SessionEnv` against a disposable container.
- A persistent round-robin Codex credential pool that supports multiple Pi auth files, fails over on confirmed rate limits, reports graceful exhaustion, and atomically saves refreshed credentials.
- Bounded Flue memory tools for deterministic description indexes, selective reads, and validated writes, plus application-owned create-only source reflections.
- Authoritative workspace validation for safe paths, Markdown-only content, YAML descriptions, symlink rejection, and reflection preservation before Git persistence.
- Persisted, dynamically generated reflection-preparation prompts grounded selectively in the latest canonical memory.
- A persisted good morning message generated every day at 06:30 Europe/London time.
- Fast application-owned GET endpoints for Apple Shortcuts and other clients to read generated artifacts from GitHub.

The lifecycle manager intentionally remains separate from the Flue adapter. Flue adapters do not own provider resource lifetime; the Shouldbot application must create the container before harness initialization and destroy it after the complete GitHub transaction.

## Development

```sh
npm install
npm run check
npm test
npm run github:verify
npm run github:clone-smoke
```

`github:verify` loads `.env`, mints a short-lived GitHub App installation token, and confirms the configured memory repository is private and uses the configured default branch. It never prints credentials.

`github:clone-smoke` performs a read-only clone in a disposable sandbox, verifies the cloned and remote branch revisions match, and removes the container afterward.

Build and exercise the sandbox image when Docker is available:

```sh
npm run sandbox:build
npm run sandbox:smoke
```

The smoke command creates a constrained container, writes and reads a marker through Flue's sandbox interface, runs Node inside the container, and removes the container in a `finally` block.

## Reflection workflow

Build and start the Flue Node server:

```sh
npm run build
node --env-file=.env dist/server.mjs
```

Submitting a real reflection creates a canonical commit in the configured private memory repository:

```sh
curl 'http://localhost:3000/workflows/reflect?wait=result' \
  -H 'content-type: application/json' \
  --data '{"reflection":"A real reflection to preserve and process."}'
```

The workflow permits only one active reflection, creates one disposable Docker sandbox, preserves the exact source reflection before prompting, exposes only bounded memory tools to the model, retries another configured Codex subscription after a confirmed rate limit, validates the complete workspace and protected source, rejects remote-branch conflicts, creates one commit, and removes the sandbox in `finally`.

## Reflection-prompt workflow

Submit generation of 3–5 optional prompts in the background:

```sh
curl -X POST 'http://localhost:3000/prompts'
# → 202 { "runId": "..." }
```

The workflow clones memory into a disposable sandbox and exposes only `list_documents` and `read_document`. Application code persists its structured result as `memory/prompts/<UTC timestamp>.md` in one validated Git commit. Fetch the latest completed set without waiting for model generation:

```sh
curl 'http://localhost:3000/prompts'
```

The response contains the prompts, invitation, generation time, London calendar date, memory path, and Git blob SHA. It returns `404 { "error": "prompts_not_ready" }` before the first set exists.

## Daily good morning workflow

While the Node server is running, an overlap-protected schedule admits the daily workflow at **06:30 Europe/London time**, including across GMT/BST changes. The workflow selectively reads current memory and earlier daily messages, then application code writes one canonical `memory/daily/YYYY-MM-DD.md` artifact and commits it to the memory repository.

Fetch today's completed message from an Apple Shortcut or another lightweight client:

```sh
curl 'http://localhost:3000/daily'
```

The response contains `message`, `generatedAt`, `localDate`, `path`, and `blobSha`. It returns `404 { "error": "daily_not_ready", "localDate": "..." }` if today's scheduled generation has not completed. To generate or retry it manually, invoke the ordinary Flue endpoint:

```sh
curl 'http://localhost:3000/workflows/daily?wait=result' \
  -H 'content-type: application/json' \
  --data '{}'
```

The schedule is process-local: the Node server must be alive at 06:30, and only one scheduler-owning application process should run. A deployment that requires catch-up after downtime or coordination across replicas should invoke `/workflows/daily` from a persistent external scheduler instead.

## Security boundaries

- Never mount `/var/run/docker.sock` inside an agent sandbox.
- Codex OAuth credentials and their writable refresh state belong only to the trusted Flue control plane.
- `SHOULDBOT_CODEX_AUTH_PATH` points to a private directory of Pi auth JSON files. Files are selected in sorted filename order, and the next selection is persisted in `.round-robin-cursor`.
- The GitHub App private key and token-minting capability belong only to the control plane.
- Model-directed shell and filesystem operations must not receive GitHub or Codex credentials.
- Docker build context excludes local credential files, the completed Cloudflare spike, dependency trees, and Git metadata.
