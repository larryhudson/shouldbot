import { invoke } from '@flue/runtime';
import { flue } from '@flue/runtime/routing';
import { Cron } from 'croner';
import { Hono } from 'hono';

import { MemoryArtifactNotFoundError } from './github/memory-repository-reader.js';
import { parseDailyArtifact, parsePromptsArtifact } from './memory/generated-artifacts.js';
import { getServices } from './runtime/services.js';
import { LONDON_TIME_ZONE, londonDate } from './time/london.js';
import dailyWorkflow from './workflows/daily.js';
import promptsWorkflow from './workflows/prompts.js';

const app = new Hono();

app.post('/prompts', async (context) => {
  const receipt = await invoke(promptsWorkflow, { input: {} });
  return context.json(receipt, 202);
});

app.get('/prompts', async (context) => {
  try {
    const document = await (await getServices()).memoryReader.readLatestPrompts();
    context.header('cache-control', 'no-store');
    return context.json({
      ...parsePromptsArtifact(document.content, document.path),
      path: document.path,
      blobSha: document.blobSha,
    });
  } catch (error) {
    if (error instanceof MemoryArtifactNotFoundError) {
      return context.json({ error: 'prompts_not_ready' }, 404);
    }
    throw error;
  }
});

app.get('/daily', async (context) => {
  const localDate = londonDate(new Date());
  try {
    const document = await (await getServices()).memoryReader.readDaily(localDate);
    context.header('cache-control', 'no-store');
    return context.json({
      ...parseDailyArtifact(document.content, document.path),
      path: document.path,
      blobSha: document.blobSha,
    });
  } catch (error) {
    if (error instanceof MemoryArtifactNotFoundError) {
      return context.json({ error: 'daily_not_ready', localDate }, 404);
    }
    throw error;
  }
});

app.route('/', flue());

new Cron(
  '30 6 * * *',
  {
    name: 'shouldbot-daily',
    timezone: LONDON_TIME_ZONE,
    protect: true,
    unref: true,
    catch: (error) => console.error('Scheduled daily workflow admission failed.', error),
  },
  async () => {
    await invoke(dailyWorkflow, { input: {} });
  },
);

export default app;
