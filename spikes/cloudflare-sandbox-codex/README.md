# Cloudflare Sandbox + Flue + Codex OAuth spike

Throwaway code to answer three questions:

1. Can a Cloudflare-targeted Flue workflow use a Cloudflare Sandbox container?
2. Can it select Pi's `openai-codex` catalog provider using a ChatGPT subscription access token?
3. Can Pi's OAuth refresh implementation execute in the Cloudflare Worker runtime?

This is not production Shouldbot code. In particular, refreshed credentials are
not persisted. A production design needs an encrypted credential store whose
read-modify-write operation is safe across Worker invocations.

## Local checks without credentials

```sh
npm install
npm run check
```

This typechecks the Worker, builds the Flue Cloudflare target, and performs a
Wrangler dry run. It does not contact OpenAI or start a remote container.

## Obtain subscription credentials

Run Pi's supported interactive login on a trusted machine:

```sh
npm run login:codex
```

The command writes `auth.json` in the current directory. Do not commit it.
Copy only the `openai-codex` credential's `access`, `refresh`, and `expires`
values into a local `.dev.vars` file based on `.dev.vars.example`, then remove
the temporary `auth.json` when no longer needed.

## Run locally

Docker must be running because Cloudflare builds the Sandbox container locally.

```sh
npm run dev
```

Invoke the exposed workflow:

```sh
curl 'http://localhost:3583/workflows/sandbox-codex?wait=result' \
  -H 'content-type: application/json' \
  --data '{"message":"Reply with exactly: codex and sandbox are connected"}'
```

## Deploy for the remote proof

Cloudflare Sandbox requires Workers Paid/Containers access and Wrangler login.

```sh
npx wrangler login
npx wrangler secret put OPENAI_CODEX_ACCESS_TOKEN
npx wrangler secret put OPENAI_CODEX_REFRESH_TOKEN
npx wrangler secret put OPENAI_CODEX_EXPIRES_AT
npx wrangler secret put OPENAI_CODEX_MODEL
npm run build
npx wrangler deploy --config dist/shouldbot_cloudflare_spike/wrangler.json
```

The workflow writes and reads `/workspace/spike-marker.txt`, runs `node
--version` in the container, calls the configured Codex model, and returns all
three results.

## Deliberate limitation discovered by the spike design

`registerProvider()` accepts the OAuth-derived access token, and Pi exposes
`refreshOpenAICodexToken()`. A refresh can therefore occur during agent
initialization. Cloudflare secrets are immutable from ordinary Worker code,
however, so rotated access/refresh credentials cannot be safely persisted back
to those bindings. The production application will need an encrypted mutable
credential record (for example in D1, encrypted with a Worker secret) or an
external credential broker.
