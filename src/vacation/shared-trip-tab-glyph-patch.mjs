import { readFileSync } from 'node:fs';

const GLYPH_RUNTIME = readFileSync(new URL('./shared-trip-tab-glyph-runtime.source.js', import.meta.url), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .join('');

const TAB_GLYPH_FN_START = 'function tsPaintTabEmoji(';

function endOfFunction(text, start) {
  const open = text.indexOf('{', start);
  if (open < 0) return -1;
  let depth = 0;
  let quote = '';
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

export function servedSharedTripTabGlyphRuntime() {
  return GLYPH_RUNTIME;
}

export function patchSharedTripTabGlyph(source = '') {
  let js = String(source || '');
  const start = js.indexOf(TAB_GLYPH_FN_START);
  if (start < 0) {
    throw new Error('served trek bundle missing tsPaintTabEmoji for tab glyph patch');
  }
  const end = endOfFunction(js, start);
  if (end < 0) {
    throw new Error('served trek bundle tsPaintTabEmoji function did not parse');
  }
  js = `${js.slice(0, start)}${GLYPH_RUNTIME}${js.slice(end)}`;
  if (!js.includes('function tsBlitCenteredEmoji(') || !js.includes('function tsScreenshotInkOffsetY(')) {
    throw new Error('shared trip tab glyph centroid blit runtime did not apply');
  }
  if (!/tsBlitCenteredEmoji\(node,\s*emoji,\s*cssSize\)/.test(js)) {
    throw new Error('shared trip tab glyph paint must use centroid blit for every category tab');
  }
  return js;
}
