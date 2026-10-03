import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAppScreenSpecText } from './shepherd-staging-smoke-ui-spec.mjs';

export const VISUAL_JUDGE_MODEL = 'google/gemini-2.5-flash-lite';
export const VISUAL_RUBRIC_VERSION = 'shepherd-visual-rubric-v2-grok0926';

const VISUAL_RUBRIC_ITEMS = [
  { id: '1', text: 'Everything matches the canonical app spec; nothing else is visible (no logos, pills, nav bars, stamps, empty boxes, Open navigation/Settings, or extra buttons).' },
  { id: '2', text: 'The composer is visible at the bottom with only the textarea, file-add button, and speak button.' },
  { id: '3', text: 'The header is empty, or holds only the vacation dropdown when there are 2+ vacations.' },
  { id: '4', text: 'When the vacation site has content, it is on top with a resizable divider/slider between site and chat.' },
  { id: '5', text: 'Nothing is cut off or overflowing horizontally.' },
  { id: '6', text: 'No internal or placeholder text (GBrain, workflow, Coming soon, TODO, lorem, undefined, null, deploy stamps).' },
  { id: '7', text: 'It looks like a finished consumer app.' },
];

export function buildVisualJudgePrompt({ screenLabel, pageKind, stateId, tabLabel, viewport, screenSpecText, specSource }) {
  const rubricBlock = VISUAL_RUBRIC_ITEMS.map((r) => `${r.id}. ${r.text}`).join('\n');
  const specBlock = `\n\nCanonical UI spec (${specSource}):\n${screenSpecText}\n`;
  return `You are a strict QA visual judge for a Grok-like vacation chat app.

Viewport: ${viewport.width}x${viewport.height}
Customer state: ${stateId || 'unknown'}
Screen: ${screenLabel}
Page kind: ${pageKind}${tabLabel ? `\nSite section/tab: ${tabLabel}` : ''}
${specBlock}
Rubric — fail if ANY item is clearly violated.

${rubricBlock}

Return ONLY strict JSON with no markdown:
{"pass":boolean,"failures":[{"rubricItem":"1-7","reason":"short"}]}
If pass is true, failures must be [].`;
}

export function loadVisualScreenSpec() {
  return loadAppScreenSpecText();
}

export function loadScreenSpecForLabel(_screenLabel) {
  const path = join(process.cwd(), 'features', 'screens', 'app.md');
  if (existsSync(path)) return readFileSync(path, 'utf8');
  return loadAppScreenSpecText().text;
}
