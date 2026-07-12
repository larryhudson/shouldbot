import { readFile } from 'node:fs/promises';

import { createModels, InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';

const auth = JSON.parse(await readFile(new URL('../auth.json', import.meta.url), 'utf8'));
const credential = auth['openai-codex'];

if (credential?.type !== 'oauth') {
  throw new Error('Missing openai-codex OAuth credential.');
}

const credentials = new InMemoryCredentialStore();
await credentials.modify('openai-codex', async () => credential);

const models = createModels({ credentials });
models.setProvider(openaiCodexProvider());

const model = models.getModel('openai-codex', 'gpt-5.4-mini');
if (!model) throw new Error('gpt-5.4-mini is not present in the Pi catalog.');

const response = await models.completeSimple(model, {
  systemPrompt: 'Be concise.',
  messages: [
    {
      role: 'user',
      content: [{ type: 'text', text: 'Reply with exactly: direct codex auth works' }],
      timestamp: Date.now(),
    },
  ],
});

const text = response.content
  .filter((part) => part.type === 'text')
  .map((part) => part.text)
  .join('');

console.log(text);
