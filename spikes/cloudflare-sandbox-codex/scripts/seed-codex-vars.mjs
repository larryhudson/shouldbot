import { chmod, readFile, writeFile } from 'node:fs/promises';

const auth = JSON.parse(await readFile(new URL('../auth.json', import.meta.url), 'utf8'));
const credential = auth['openai-codex'];

if (
  credential?.type !== 'oauth' ||
  typeof credential.access !== 'string' ||
  typeof credential.refresh !== 'string' ||
  typeof credential.expires !== 'number'
) {
  throw new Error('auth.json does not contain a valid openai-codex OAuth credential.');
}

const quote = (value) => JSON.stringify(String(value));
const content = [
  `OPENAI_CODEX_ACCESS_TOKEN=${quote(credential.access)}`,
  `OPENAI_CODEX_REFRESH_TOKEN=${quote(credential.refresh)}`,
  `OPENAI_CODEX_EXPIRES_AT=${quote(credential.expires)}`,
  'OPENAI_CODEX_MODEL="gpt-5.4-mini"',
  '',
].join('\n');

const output = new URL('../.dev.vars', import.meta.url);
await writeFile(output, content, { mode: 0o600 });
await chmod(output, 0o600);

console.log('Wrote gitignored .dev.vars with mode 0600.');
