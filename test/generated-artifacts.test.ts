import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dailyArtifactPath,
  parseDailyArtifact,
  parsePromptsArtifact,
  promptsArtifactPath,
  renderDailyArtifact,
  renderPromptsArtifact,
} from '../src/memory/generated-artifacts.js';
import { londonDate, utcTimestampFilename } from '../src/time/london.js';

test('uses the London calendar date for one canonical daily artifact', () => {
  const instant = new Date('2026-07-13T23:30:00.000Z');
  assert.equal(londonDate(instant), '2026-07-14');
  assert.equal(dailyArtifactPath(instant), 'daily/2026-07-14.md');
});

test('uses sortable UTC timestamps for prompts artifacts', () => {
  const instant = new Date('2026-07-13T05:30:09.000Z');
  assert.equal(utcTimestampFilename(instant), '2026-07-13T053009Z');
  assert.equal(promptsArtifactPath(instant), 'prompts/2026-07-13T053009Z.md');
});

test('round trips a daily message through readable Markdown', () => {
  const instant = new Date('2026-07-13T05:30:00.000Z');
  const content = renderDailyArtifact('Start with a short walk before work.', instant);
  assert.match(content, /# Good morning/);
  assert.deepEqual(parseDailyArtifact(content), {
    kind: 'daily',
    generatedAt: instant.toISOString(),
    localDate: '2026-07-13',
    message: 'Start with a short walk before work.',
  });
});

test('round trips prompts and invitation through readable Markdown', () => {
  const instant = new Date('2026-07-13T14:27:18.000Z');
  const prompts = ['What changed?', 'What helped?', 'What is new?'];
  const content = renderPromptsArtifact(prompts, 'Use any of these, or go elsewhere.', instant);
  assert.match(content, /- What changed\?/);
  assert.deepEqual(parsePromptsArtifact(content), {
    kind: 'prompts',
    generatedAt: instant.toISOString(),
    localDate: '2026-07-13',
    prompts,
    invitation: 'Use any of these, or go elsewhere.',
  });
});

test('rejects an invalid number of prompts', () => {
  assert.throws(
    () => renderPromptsArtifact(['One', 'Two'], 'Invitation', new Date()),
    /3 to 5 prompts/,
  );
});
