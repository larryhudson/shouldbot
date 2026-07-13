import { stringify } from 'yaml';

import { parseMemoryDocument } from './memory-workspace.js';
import { LONDON_TIME_ZONE, londonDate, utcTimestampFilename } from '../time/london.js';

export interface DailyArtifact {
  kind: 'daily';
  generatedAt: string;
  localDate: string;
  message: string;
}

export interface PromptsArtifact {
  kind: 'prompts';
  generatedAt: string;
  localDate: string;
  prompts: string[];
  invitation: string;
}

export function dailyArtifactPath(date: Date): string {
  return `daily/${londonDate(date)}.md`;
}

export function promptsArtifactPath(date: Date): string {
  return `prompts/${utcTimestampFilename(date)}.md`;
}

export function renderDailyArtifact(message: string, generatedAt: Date): string {
  const artifact: DailyArtifact = {
    kind: 'daily',
    generatedAt: generatedAt.toISOString(),
    localDate: londonDate(generatedAt),
    message: requireText(message, 'Daily message'),
  };
  return renderFrontmatter({
    description: `Good morning message for ${artifact.localDate}`,
    ...artifact,
    timeZone: LONDON_TIME_ZONE,
  }, `# Good morning\n\n${artifact.message}\n`);
}

export function renderPromptsArtifact(
  prompts: string[],
  invitation: string,
  generatedAt: Date,
): string {
  if (prompts.length < 3 || prompts.length > 5) {
    throw new GeneratedArtifactError('A prompts artifact must contain 3 to 5 prompts.');
  }
  const artifact: PromptsArtifact = {
    kind: 'prompts',
    generatedAt: generatedAt.toISOString(),
    localDate: londonDate(generatedAt),
    prompts: prompts.map((prompt) => requireText(prompt, 'Prompt')),
    invitation: requireText(invitation, 'Invitation'),
  };
  const body = [
    '# Reflection prompts',
    '',
    ...artifact.prompts.map((prompt) => `- ${prompt}`),
    '',
    artifact.invitation,
    '',
  ].join('\n');
  return renderFrontmatter({
    description: `Reflection prompts generated on ${artifact.localDate}`,
    ...artifact,
    timeZone: LONDON_TIME_ZONE,
  }, body);
}

export function parseDailyArtifact(content: string, path = 'daily.md'): DailyArtifact {
  const frontmatter = parseMemoryDocument(content, path).frontmatter;
  if (frontmatter.kind !== 'daily') throw new GeneratedArtifactError(`${path} is not a daily artifact.`);
  return {
    kind: 'daily',
    generatedAt: requireIsoDate(frontmatter.generatedAt, path),
    localDate: requireLocalDate(frontmatter.localDate, path),
    message: requireText(frontmatter.message, `${path} message`),
  };
}

export function parsePromptsArtifact(content: string, path = 'prompts.md'): PromptsArtifact {
  const frontmatter = parseMemoryDocument(content, path).frontmatter;
  if (frontmatter.kind !== 'prompts') throw new GeneratedArtifactError(`${path} is not a prompts artifact.`);
  if (!Array.isArray(frontmatter.prompts) || frontmatter.prompts.length < 3 || frontmatter.prompts.length > 5) {
    throw new GeneratedArtifactError(`${path} must contain 3 to 5 prompts.`);
  }
  return {
    kind: 'prompts',
    generatedAt: requireIsoDate(frontmatter.generatedAt, path),
    localDate: requireLocalDate(frontmatter.localDate, path),
    prompts: frontmatter.prompts.map((prompt) => requireText(prompt, `${path} prompt`)),
    invitation: requireText(frontmatter.invitation, `${path} invitation`),
  };
}

function renderFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  return `---\n${stringify(frontmatter).trimEnd()}\n---\n\n${body}`;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new GeneratedArtifactError(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function requireIsoDate(value: unknown, path: string): string {
  const text = requireText(value, `${path} generatedAt`);
  if (Number.isNaN(Date.parse(text))) throw new GeneratedArtifactError(`${path} has an invalid generatedAt.`);
  return text;
}

function requireLocalDate(value: unknown, path: string): string {
  const text = requireText(value, `${path} localDate`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new GeneratedArtifactError(`${path} has an invalid localDate.`);
  }
  return text;
}

export class GeneratedArtifactError extends Error {
  readonly code = 'generated_artifact_invalid';

  constructor(message: string) {
    super(message);
    this.name = 'GeneratedArtifactError';
  }
}
