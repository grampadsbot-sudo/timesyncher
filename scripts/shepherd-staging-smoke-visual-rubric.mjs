import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const VISUAL_JUDGE_MODEL = 'google/gemini-2.5-flash-lite';
export const VISUAL_RUBRIC_VERSION = 'shepherd-visual-rubric-v1';

const VISUAL_RUBRIC_ITEMS = [
  { id: '1', key: 'composer_visible', text: 'The composer is visible at the bottom (chat pages only; N/A on shared trip tabs — mark pass if not applicable).' },
  { id: '2', key: 'horizontal_overflow', text: 'Nothing is cut off or overflowing horizontally.' },
  { id: '3', key: 'no_empty_placeholders', text: 'There are no stray empty boxes or placeholder cards.' },
  { id: '4', key: 'logo_in_header', text: 'The logo is in the header (or brand bar on shared pages).' },
  { id: '5', key: 'no_internal_placeholder_text', text: 'No internal or placeholder text (GBrain, workflow, Coming soon, TODO, lorem, undefined, null).' },
  { id: '6', key: 'icon_alignment', text: 'Icons and logos are aligned and vertically centered in their rows.' },
  { id: '7', key: 'consumer_ready', text: 'It looks like a finished consumer app.' },
];

export function buildVisualJudgePrompt({ screenLabel, pageKind, tabLabel, viewport, screenSpecText }) {
  const rubricBlock = VISUAL_RUBRIC_ITEMS.map((r) => `${r.id}. ${r.text}`).join('\n');
  const specBlock = screenSpecText
    ? `\n\nScreen spec (from repo):\n${screenSpecText}\n`
    : '\n\n(No features/screens/*.md spec file matched this screen — judge from the rubric and screenshot only.)\n';
  return `You are a strict QA visual judge for a consumer vacation planning web app.

Viewport: ${viewport.width}x${viewport.height}
Screen: ${screenLabel}
Page kind: ${pageKind}${tabLabel ? `\nShared tab: ${tabLabel}` : ''}
${specBlock}
Rubric — fail the screenshot if ANY item is clearly violated. For chat-only items on shared pages, treat N/A as pass.

${rubricBlock}

Return ONLY strict JSON with no markdown:
{"pass":boolean,"failures":[{"rubricItem":"1-7 or key","reason":"short"}]}
If pass is true, failures must be [].`;
}

export function loadScreenSpecForLabel(screenLabel) {
  const label = String(screenLabel || '').toLowerCase();
  if (label.startsWith('shared') || label.includes('hotels') || label.includes('budget')) {
    const path = join(process.cwd(), 'features', 'itinerary-surfaces.md');
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }
  return null;
}
