import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadAppScreenSpecText } from './shepherd-staging-smoke-ui-spec.mjs';

export const VISUAL_JUDGE_MODEL = 'qwen/qwen2.5-vl-72b-instruct';
export const VISUAL_RUBRIC_VERSION = 'shepherd-visual-rubric-v6-qwen25-vl-composer-send-8204';

const LOGO_DISTINCTION = `Logo policy (VISUAL only; separate LOGO smoke gate is unchanged):
- Craig's spec applies to the APP SHELL: header, composer row, and site/chat slider divider area.
- FAIL any APP or BRAND chrome logo in or around that shell: TimeSyncher pill, TimeSyncher wordmark in the header, TimeSyncher footer or logo appearing as in-app site chrome, tab/nav bars, deploy stamps, Open navigation/Settings, or other non-spec chrome.
- ALLOWED in vacation SITE CONTENT ROWS (e.g. Hotels, Cars list rows): vendor/brand logos such as Hyatt, Westin, Hertz. These are trip content, not app chrome. They should look centered in their rows; do NOT fail rubric 1 solely for those vendor marks.`;

const VISUAL_RUBRIC_ITEMS = [
  { id: '1', text: 'App shell matches the canonical spec (header, composer row, slider when site exists). No extra chrome: app/brand logos (TimeSyncher pill, in-app site chrome logos, nav bars, stamps, Settings/Open navigation). Vendor logos inside Hotels/Cars/content rows are allowed and must not be treated as violations of item 1.' },
  { id: '2', text: 'The composer is visible at the bottom with the textarea, file-add button, speak button, and a visible send button (required at 390px and 1280px). FAIL if send is missing or not visibly rendered.' },
  { id: '3', text: 'When fewer than 2 vacations, the header is fully hidden (zero height / not visible). When 2+ vacations, the header holds only the vacation dropdown.' },
  { id: '4', text: 'When the vacation site has content, it is on top with a resizable divider/slider between site and chat, and a full-screen control in the site area.' },
  { id: '5', text: 'Nothing is cut off or overflowing horizontally.' },
  { id: '6', text: 'No internal or placeholder text (GBrain, workflow, Coming soon, TODO, lorem, undefined, null, deploy stamps like commit shas in chrome).' },
  { id: '7', text: 'It looks like a finished consumer app (shell). Vendor row logos on content tabs may appear; judge shell polish separately from row icons.' },
];

export function buildVisualJudgePrompt({
  screenLabel, pageKind, stateId, tabLabel, viewport, screenSpecText, specSource, layoutDomFacts,
}) {
  const rubricBlock = VISUAL_RUBRIC_ITEMS.map((r) => `${r.id}. ${r.text}`).join('\n');
  const specBlock = `\n\nCanonical UI spec (${specSource}):\n${screenSpecText}\n`;
  const layoutBlock = layoutDomFacts
    ? `\n\n${layoutDomFacts}\nIf LAYOUT DOM ground truth is FAIL, you MUST return pass:false citing rubric item "layout_dom" with the DOM reasons.\n`
    : '';
  return `You are a strict QA visual judge for a Grok-like vacation chat app.

Viewport: ${viewport.width}x${viewport.height}
Customer state: ${stateId || 'unknown'}
Screen: ${screenLabel}
Page kind: ${pageKind}${tabLabel ? `\nSite section/tab: ${tabLabel}` : ''}
${specBlock}${layoutBlock}
${LOGO_DISTINCTION}

Rubric — fail if ANY item is clearly violated. Item 1 is about app shell chrome only, not vendor logos inside Hotels/Cars/content list rows.

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
