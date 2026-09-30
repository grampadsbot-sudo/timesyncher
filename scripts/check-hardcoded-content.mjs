import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { INVENTORY_PATTERNS } from './hardcoded-inventory-patterns.mjs';

export const BASELINE_NOTE = 'removed by Search Eng / Reply Eng deletion PR';
export const PROMPT_NAMES = ['Craig', 'Kimberly', 'Tyler', 'Lauren', 'Marcus'];
const BASELINE_REL = 'scripts/hardcoded-content-baseline.json';

const TEXT_EXT = new Set(['.mjs', '.js', '.html', '.json', '.jsonl', '.md', '.txt', '.css', '.yml', '.yaml', '.svg', '.csv', '.py']);
const CONTENT_DIRS = ['src/vacation', 'routes'];
const CONTENT_FILES = [
  'scripts/vacation-app-reply-rules.mjs',
  'scripts/vacation-public-research-worker.mjs',
  'scripts/product-gbrain-dispatch.mjs',
  'scripts/travel-source-adapter-runner.mjs',
  'vacation-app.html',
  'public/ts-timeline-icon-patch.js',
  'index.html',
  'order-test.html',
];
const BUNDLE_FILES = [
  'public/assets/index-TimeSyncherVacationLogin.js',
  'public/assets/index-0J54vUO3.js',
];
const TOKEN_DIRS = ['evidence', 'artifacts', 'features/proof', 'qa', 'qa-output', 'qa-outputs'];

const PLACE_ID = /\b([A-Za-z_$][\w$]*LIST_FILL|[A-Za-z_$][\w$]*FILL_DETAILS|PLACE_COORDS|PRODUCT_VENUE_COORDS|PRODUCT_THING_FIELDS|LIVE_TAB_FILL|FILL_BUCKET_META|AREA_CHIP_[A-Za-z0-9_]+|SI_VEGAS_TAIL|SI_NYC_TAIL|padKeepsakeSharedPlaces|padKeepsakeListNames|catalogForShared|FILENAME_THING_HINTS|THINGS_NOT_ON_VACATION3|NAMED_THING_LOGOS|BRAND_LOGOS|SCT_VACATION3_MEDIA_PACK|VACATION3_SHARE_TOKEN)\b/g;
const VEGAS_PLACEHOLDER = /placeholder\s*=\s*(['"])Las Vegas\1/g;
const VEGAS_FLIGHT_EXCEPTION = /las vegas\|vegas/g;
const OBJECT_LAT_LNG = /[{,]\s*lat\s*:\s*(-?\d+(?:\.\d+)?)[\s\S]{0,80}?lng\s*:\s*(-?\d+(?:\.\d+)?)/g;
const OBJECT_LNG_LAT = /[{,]\s*lng\s*:\s*(-?\d+(?:\.\d+)?)[\s\S]{0,80}?lat\s*:\s*(-?\d+(?:\.\d+)?)/g;
const FALLBACK_LAT_LNG = /fallbackLat\s*:\s*(-?\d+(?:\.\d+)?)[\s\S]{0,120}?fallbackLng\s*:\s*(-?\d+(?:\.\d+)?)/g;
const ARRAY_PAIR = /\[\s*(-?\d+\.\d{3,})\s*,\s*(-\d+\.\d{3,})\b/g;
const CATEGORY_LITERAL = /category_name\s*:\s*(['"])(Car|Flight)\1/g;
const NAME_LITERAL = /name\s*:\s*(['"])([^'"]+)\1/g;
const THING_LITERAL = /(['"])(SpeediShuttle|KOA arrival|Kona arrival)\1/g;
const PRODUCT_SUMMARY = /\bproductThingSummary\b/g;

const DIALOG_PATTERNS = [
  [/\b(ONBOARDING_OPENER_[A-Z0-9_]+)\b/g, (match) => match[1]],
  [/\bCANNED_APP_REPLY\b/g, () => 'CANNED_APP_REPLY'],
  [/Welcome aboard(?:,\s*[A-Za-z]+)?/g, (match) => match[0]],
  [/Include these sentences/gi, () => 'Include these sentences'],
  [/must say/gi, () => 'must say'],
  [/\bseatWelcomeLine\b/g, () => 'seatWelcomeLine'],
  [/\bupsellLine\b/g, () => 'upsellLine'],
  [/\breplyRulesSystem\b/g, () => 'replyRulesSystem'],
  [/\bseatJoinCustomerText\b/g, () => 'seatJoinCustomerText'],
  [/\binterimFromTierOne\b/g, () => 'interimFromTierOne'],
  [/\bintakeFacts\b/g, () => 'intakeFacts'],
  [/\bINVENTED_GARDEN\b/g, () => 'INVENTED_GARDEN'],
  [/\bUNNAMED_VENUE\b/g, () => 'UNNAMED_VENUE'],
  [/\bwindBackupSentence\b/g, () => 'windBackupSentence'],
  [/Your website is not built yet/g, () => 'Your website is not built yet'],
  [/I can update this vacation from here/g, () => 'I can update this vacation from here'],
];

const TOKEN_PATTERNS = [
  [/Bearer\s+[A-Za-z0-9._-]{20,}/gi, 'Bearer'],
  [/sk-[A-Za-z0-9]{20,}/g, 'sk-'],
  [/sk_live_[A-Za-z0-9]{8,}/g, 'sk_live_'],
  [/pk_live_[A-Za-z0-9]{8,}/g, 'pk_live_'],
  [/pk_test_[A-Za-z0-9]{8,}/g, 'pk_test_'],
  [/ghp_[A-Za-z0-9]{20,}/g, 'ghp_'],
  [/gho_[A-Za-z0-9]{20,}/g, 'gho_'],
  [/github_pat_[A-Za-z0-9_]{20,}/g, 'github_pat_'],
  [/xox[abpr]-[A-Za-z0-9-]{10,}/g, 'xox'],
  [/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 'jwt'],
  [/(['"])sessionToken\1\s*:\s*(['"])(?!\[redacted\]\2)(?!redacted\2)[^'"]+\2/g, 'sessionToken'],
  [/\bsessionToken\b\s*[:=]\s*(['"])(?!\[redacted\]\1)(?!redacted\1)[^'"]+\1/g, 'sessionToken'],
  [/\b(?:api[_-]?key|secret|token|sessionToken|password)\b\s*[:=]\s*['"][A-Fa-f0-9]{32,}['"]/gi, 'hex-secret'],
  [/\b(?:api[_-]?key|secret|token|sessionToken|password)\b\s*[:=]\s*['"][A-Za-z0-9+/_-]{40,}={0,2}['"]/gi, 'base64-secret'],
];

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

function add(findings, seen, rule, file, text, index, symbol) {
  const key = `${rule}\0${file}\0${symbol}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ rule, file, line: lineNumber(text, index), symbol_or_pattern: symbol });
}

function collect(pattern, text, onMatch) {
  pattern.lastIndex = 0;
  const hits = [];
  let match = pattern.exec(text);
  while (match) {
    hits.push(onMatch(match));
    match = pattern.exec(text);
  }
  return hits;
}

function placeListFindings(file, text, findings, seen) {
  for (const match of collect(PLACE_ID, text, (item) => item)) {
    add(findings, seen, 'HC-PLACE-LIST', file, text, match.index, match[1]);
  }
  for (const match of collect(VEGAS_PLACEHOLDER, text, (item) => item)) {
    add(findings, seen, 'HC-PLACE-LIST', file, text, match.index, 'placeholder="Las Vegas"');
  }
  for (const match of collect(VEGAS_FLIGHT_EXCEPTION, text, (item) => item)) {
    add(findings, seen, 'HC-PLACE-LIST', file, text, match.index, 'las vegas|vegas');
  }
  const lines = text.split('\n');
  let offset = 0;
  for (const line of lines) {
    if (/Ulu Ocean Grill/i.test(line)) {
      add(findings, seen, 'HC-PLACE-LIST', file, text, offset, 'Ulu Ocean Grill');
    }
    if (/huggo/i.test(line) && /fish hopper/i.test(line)) {
      add(findings, seen, 'HC-PLACE-LIST', file, text, offset, "Huggo's");
      add(findings, seen, 'HC-PLACE-LIST', file, text, offset, 'Fish Hopper');
    }
    offset += line.length + 1;
  }
}

function coordFindings(file, text, findings, seen) {
  for (const match of collect(OBJECT_LAT_LNG, text, (item) => item)) {
    add(findings, seen, 'HC-COORD', file, text, match.index, `{lat:${match[1]},lng:${match[2]}}`);
  }
  for (const match of collect(OBJECT_LNG_LAT, text, (item) => item)) {
    add(findings, seen, 'HC-COORD', file, text, match.index, `{lat:${match[2]},lng:${match[1]}}`);
  }
  for (const match of collect(FALLBACK_LAT_LNG, text, (item) => item)) {
    add(findings, seen, 'HC-COORD', file, text, match.index, `fallbackLat:${match[1]},fallbackLng:${match[2]}`);
  }
  for (const match of collect(ARRAY_PAIR, text, (item) => item)) {
    add(findings, seen, 'HC-COORD', file, text, match.index, `[${match[1]},${match[2]}]`);
  }
}

function thingFindings(file, text, findings, seen) {
  for (const match of collect(CATEGORY_LITERAL, text, (item) => item)) {
    const start = Math.max(0, match.index - 500);
    const end = Math.min(text.length, match.index + 500);
    const window = text.slice(start, end);
    NAME_LITERAL.lastIndex = 0;
    let name = NAME_LITERAL.exec(window);
    let chosen = null;
    while (name) {
      if (name[2] !== 'Car' && name[2] !== 'Flight') {
        chosen = name;
        break;
      }
      name = NAME_LITERAL.exec(window);
    }
    if (!chosen) continue;
    const symbol = `category_name:'${match[2]}',name:'${chosen[2]}'`;
    add(findings, seen, 'HC-THING', file, text, start + chosen.index, symbol);
  }
  for (const match of collect(THING_LITERAL, text, (item) => item)) {
    add(findings, seen, 'HC-THING', file, text, match.index, match[2]);
  }
  for (const match of collect(PRODUCT_SUMMARY, text, (item) => item)) {
    add(findings, seen, 'HC-THING', file, text, match.index, 'productThingSummary');
  }
}

function dialogFindings(file, text, findings, seen) {
  for (const [pattern, symbolFor] of DIALOG_PATTERNS) {
    for (const match of collect(pattern, text, (item) => item)) {
      add(findings, seen, 'HC-DIALOG', file, text, match.index, symbolFor(match));
    }
  }
}

function inventoryFindings(file, text, findings, seen, { bundles = false } = {}) {
  for (const pattern of INVENTORY_PATTERNS) {
    if (bundles && !pattern.scanBundles) continue;
    pattern.re.lastIndex = 0;
    const index = text.search(pattern.re);
    if (index < 0) continue;
    add(findings, seen, pattern.rule, file, text, index, `inventory:${pattern.id}`);
  }
}

const THING_PUSH = /(?:places|things|next|candidates)\s*\.push\s*\(\s*$/;
const CANNED_TOKEN = /\b([A-Z][A-Z0-9_]*(?:LIST_FILL|FILL_DETAILS)|PLACE_COORDS|CANNED_APP_REPLY|ONBOARDING_OPENER_[A-Z0-9_]+|LIVE_TAB_FILL)\b|Welcome aboard/;
const ALLOWED_MODELS = new Set([
  'google/gemini-2.5-flash-lite',
  'qwen/qwen3-235b-a22b-2507',
  'deepseek/deepseek-v3.2',
  'qwen/qwen3-max',
  'typesafe/jev-1.13',
]);
const MODEL_VENDOR = /^(?:google|qwen|deepseek|typesafe|openai|anthropic|meta-llama|mistralai|x-ai|cohere|perplexity|groq)\//i;
const GPT_MINI = /gpt-[a-z0-9.]+-mini/ig;
const QUOTED_MODEL = /['"`]([a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*)['"`]/ig;
const GOOGLE_PLACES_PATTERNS = [
  [/GOOGLE_PLACES_API_KEY/g, 'GOOGLE_PLACES_API_KEY'],
  [/\bPLACES_API_KEY\b/g, 'PLACES_API_KEY'],
  [/maps\.googleapis\.com\/[^'"\s]*place/gi, 'maps.googleapis.com/place'],
  [/@googlemaps\/places/g, '@googlemaps/places'],
  [/@googlemaps\/google-maps-services/g, '@googlemaps/google-maps-services'],
  [/\bPlacesClient\b/g, 'PlacesClient'],
  [/google\.maps\.places/g, 'google.maps.places'],
];
const STAMP_GUARDS = [
  ['scripts/live_v7_dialog_pdf.py', /deploy_banner/, /if not banner:\n\s+raise SystemExit\("refused: dialog stamp is empty"\)/],
  ['scripts/screenshot_journey_pdf.py', /deployBanner/, /if not banner:\n\s+raise SystemExit\("refused: journey stamp is empty"\)/],
];
const FUNCTION_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.py', '.go', '.rb']);
const API_FN_CAP = 12;
const GUARD_FILES = new Set([
  'scripts/check-hardcoded-content.mjs',
  'scripts/test_check_hardcoded_content.mjs',
  'scripts/hardcoded-inventory-patterns.mjs',
  'scripts/hardcoded-content-baseline.json',
]);

function matchingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

function objectAt(text, index) {
  let depth = 0;
  let start = -1;
  for (let i = index; i >= 0; i -= 1) {
    if (text[i] === '}') depth += 1;
    else if (text[i] === '{') {
      if (depth === 0) {
        start = i;
        break;
      }
      depth -= 1;
    }
  }
  if (start < 0) return null;
  return { start, end: matchingBrace(text, start), body: '' };
}

function thingLabel(body) {
  const named = body.match(/\b(?:name|title)\s*:\s*['"]([^'"]+)['"]/);
  if (named) return named[1].slice(0, 80);
  return body.replace(/\s+/g, ' ').trim().slice(0, 48);
}

function topLevel(body) {
  let depth = 0;
  let out = '';
  for (const ch of body) {
    if (ch === '{' || ch === '[') depth += 1;
    if (depth === 1) out += ch;
    if (ch === '}' || ch === ']') depth -= 1;
  }
  return out;
}

function isBuiltThing(body, prelude) {
  if (/\bsource\s*:/.test(body) || /\brow\./.test(body)) return false;
  const top = topLevel(body);
  const nameKey = /\b(?:name|title)\s*[:,]/.test(top);
  const categoryNameKey = /\bcategory_name\s*:/.test(top);
  const categoryKey = /\bcategory\s*[:,]/.test(top);
  if (categoryNameKey && nameKey) return true;
  if (THING_PUSH.test(prelude) && nameKey && (categoryKey || categoryNameKey)) return true;
  if (/return\s+\[?\s*$/.test(prelude) && nameKey && categoryKey && /\b(?:description|summary|metadata)\s*:/.test(top)) return true;
  return false;
}

function thingSourceFindings(file, text, findings, seen) {
  const found = new Set();
  const mark = (index) => {
    const obj = objectAt(text, index);
    if (!obj || found.has(obj.start)) return;
    found.add(obj.start);
    const body = text.slice(obj.start, obj.end);
    const prelude = text.slice(Math.max(0, obj.start - 80), obj.start);
    if (!isBuiltThing(body, prelude)) return;
    add(findings, seen, 'THING-SOURCE', file, text, obj.start, `thing-without-source:${thingLabel(body)}`);
  };
  const keys = /\bcategory_name\s*:/g;
  keys.lastIndex = 0;
  let match = keys.exec(text);
  while (match) {
    mark(match.index);
    match = keys.exec(text);
  }
  const pushes = /(?:places|things|next|candidates)\s*\.push\s*\(\s*\{/g;
  pushes.lastIndex = 0;
  match = pushes.exec(text);
  while (match) {
    mark(match.index + match[0].length - 1);
    match = pushes.exec(text);
  }
  const returns = /return\s+\[?\s*\{/g;
  returns.lastIndex = 0;
  match = returns.exec(text);
  while (match) {
    mark(match.index + match[0].length - 1);
    match = returns.exec(text);
  }
  const inserts = /insert\s+into\s+trip_things\b/gi;
  inserts.lastIndex = 0;
  match = inserts.exec(text);
  while (match) {
    const slice = text.slice(match.index, match.index + 1200);
    if (!/\bsource\s*:/.test(slice)) {
      add(findings, seen, 'THING-SOURCE', file, text, match.index, 'insert trip_things');
    }
    match = inserts.exec(text);
  }
}

function cannedFallbackFindings(file, text, findings, seen) {
  const flag = (index, chunk) => {
    const token = chunk.match(CANNED_TOKEN);
    if (!token || !/\breturn\b/.test(chunk)) return;
    add(findings, seen, 'NO-CANNED-FALLBACK', file, text, index, token[0]);
  };
  const catches = /catch\s*\([^)]*\)\s*\{/g;
  let match = catches.exec(text);
  while (match) {
    const open = match.index + match[0].length - 1;
    flag(match.index, text.slice(open, matchingBrace(text, open)));
    match = catches.exec(text);
  }
  const arrows = /\.catch\s*\(\s*(?:\([^)]*\)\s*)?=>\s*([^;\n]+)/g;
  match = arrows.exec(text);
  while (match) {
    if (CANNED_TOKEN.test(match[1])) {
      add(findings, seen, 'NO-CANNED-FALLBACK', file, text, match.index, match[1].match(CANNED_TOKEN)[0]);
    }
    match = arrows.exec(text);
  }
  const missing = /if\s*\(\s*(?:![\w$.]+(?:\.length)?|[\w$.]+\s*===\s*(?:null|undefined)|[\w$.]+\s*==\s*null)\s*\)\s*(?:\{[\s\S]{0,500}?return|return)\s+([^;}]{0,200})/g;
  match = missing.exec(text);
  while (match) {
    const token = match[1].match(CANNED_TOKEN);
    if (token) add(findings, seen, 'NO-CANNED-FALLBACK', file, text, match.index, token[0]);
    match = missing.exec(text);
  }
}

const BARE_MODEL = /['"`]((?:grok|gpt|claude|gemini|qwen|deepseek|mistral|mixtral|llama)\d*-(?:mini|flash|pro|sonnet|opus|haiku|turbo|max|large|small|nano|preview|v\d|\d)[a-z0-9._-]*)['"`]/gi;
const ALLOWED_BARE = new Set([...ALLOWED_MODELS].map((id) => id.split('/').slice(1).join('/').toLowerCase()));

function modelAllowlistFindings(file, text, findings, seen) {
  GPT_MINI.lastIndex = 0;
  let match = GPT_MINI.exec(text);
  while (match) {
    add(findings, seen, 'MODEL-ALLOWLIST', file, text, match.index, match[0]);
    match = GPT_MINI.exec(text);
  }
  QUOTED_MODEL.lastIndex = 0;
  match = QUOTED_MODEL.exec(text);
  while (match) {
    if (MODEL_VENDOR.test(match[1]) && !ALLOWED_MODELS.has(match[1])) {
      add(findings, seen, 'MODEL-ALLOWLIST', file, text, match.index, match[1]);
    }
    match = QUOTED_MODEL.exec(text);
  }
  BARE_MODEL.lastIndex = 0;
  match = BARE_MODEL.exec(text);
  while (match) {
    const id = match[1].toLowerCase();
    if (!ALLOWED_BARE.has(id) && !/^gpt-[a-z0-9.]+-mini$/.test(id)) {
      add(findings, seen, 'MODEL-BARE', file, text, match.index, match[1]);
    }
    match = BARE_MODEL.exec(text);
  }
}

function googlePlacesFindings(file, text, findings, seen) {
  for (const [pattern, symbol] of GOOGLE_PLACES_PATTERNS) {
    for (const match of collect(pattern, text, (item) => item)) {
      add(findings, seen, 'NO-GOOGLE-PLACES', file, text, match.index, symbol);
    }
  }
}

function tokenFindings(file, text, findings, seen) {
  for (const [pattern, symbol] of TOKEN_PATTERNS) {
    for (const match of collect(pattern, text, (item) => item)) {
      add(findings, seen, 'TOKEN-EVIDENCE', file, text, match.index, symbol);
    }
  }
}

function scanStringLiterals(text) {
  const out = [];
  for (let index = 0; index < text.length; index += 1) {
    const quote = text[index];
    if (quote !== "'" && quote !== '"') continue;
    let cursor = index + 1;
    let value = '';
    let closed = false;
    while (cursor < text.length) {
      if (text[cursor] === '\\' && cursor + 1 < text.length) {
        value += text[cursor + 1];
        cursor += 2;
        continue;
      }
      if (text[cursor] === quote) {
        closed = true;
        break;
      }
      value += text[cursor];
      cursor += 1;
    }
    if (closed) {
      out.push(value);
      index = cursor;
    }
  }
  return out;
}

function plainRegexBodies(text) {
  const out = [];
  const re = /\/([^/\n]{3,80})\/[a-z]*/g;
  let match = re.exec(text);
  while (match) {
    for (const part of match[1].split('|')) {
      const body = part.replace(/\\b/g, '').replace(/\\/g, '').trim();
      if (/^[A-Za-z][A-Za-z .'-]*[A-Za-z.]$/.test(body) && /\s/.test(body)) out.push(body);
    }
    match = re.exec(text);
  }
  return out;
}

function keepContent(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  if (text.length < 8 || text.length > 160) return false;
  if (!/^[A-Za-z0-9]/.test(text)) return false;
  if (/[{}()=;`\\]|\/\w+\.mjs|\.\.\./.test(text)) return false;
  if (!/[A-Za-z]{3}/.test(text)) return false;
  if (/^[A-Za-z_][\w$]*$/.test(text)) return false;
  if (!/\s/.test(text)) return false;
  if (/\b(?:return|const|function|export|category_name|share_budget|lodgingLane|insert|thingId|thingName|fallbackAddress)\b/.test(text)) return false;
  if (/^[a-z][\w$]*(?:,\s*[a-z][\w$]*)+$/.test(text)) return false;
  return true;
}

function deriveContentNeedles(inventory, patterns) {
  const needles = new Set();
  const blobs = [];
  for (const item of inventory.items || []) blobs.push(item.quote || '');
  for (const pattern of patterns) blobs.push(pattern.fixture || '', pattern.re.source);
  for (const blob of blobs) {
    for (const piece of scanStringLiterals(blob)) if (keepContent(piece)) needles.add(piece.trim().replace(/\s+/g, ' '));
    for (const piece of plainRegexBodies(blob)) {
      if (!keepContent(piece)) continue;
      if (!/[A-Z]/.test(piece) && !/\b(?:vegas|island|kona|kailua|ulu|hopper|shack|club|waikiki|kahalu|bellagio|tulum|cartagena|puna|kalapana)\b/i.test(piece)) continue;
      needles.add(piece);
    }
  }
  const raw = JSON.stringify(inventory);
  for (const match of raw.matchAll(/\/ts-thing-logos\/[a-z0-9.-]+/g)) needles.add(match[0]);
  for (const match of raw.matchAll(/\b(?:second Friday|apr 10)\b/g)) needles.add(match[0]);
  if (raw.includes('Price TBD')) needles.add('Price TBD');
  return [...needles].sort((a, b) => a.localeCompare(b));
}

const inventoryDoc = JSON.parse(fs.readFileSync(new URL('./fixtures/hardcoded-content/inventory.json', import.meta.url), 'utf8'));
export const CONTENT_NEEDLES = deriveContentNeedles(inventoryDoc, INVENTORY_PATTERNS);

export function bundleScanFindings(file, text) {
  const findings = [];
  contentMatchFindings(file, String(text || ''), findings, new Set(), CONTENT_NEEDLES, 'BUNDLE-SCAN');
  return findings;
}

function contentMatchFindings(file, text, findings, seen, needles, rule) {
  for (const needle of needles) {
    const index = text.indexOf(needle);
    if (index >= 0) add(findings, seen, rule, file, text, index, needle);
  }
}

function skipWs(text, index) {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  return cursor;
}

function readQuoted(text, index) {
  const quote = text[index];
  if (quote !== "'" && quote !== '"') return null;
  let cursor = index + 1;
  let value = '';
  while (cursor < text.length) {
    if (text[cursor] === '\\') {
      if (cursor + 1 >= text.length) return null;
      const next = text[cursor + 1];
      value += next === 'n' ? '\n' : next === 'r' ? '\r' : next === 't' ? '\t' : next;
      cursor += 2;
      continue;
    }
    if (text[cursor] === quote) return { end: cursor + 1, value };
    value += text[cursor];
    cursor += 1;
  }
  return null;
}

function readArrayJoin(text, index) {
  if (text[index] !== '[') return null;
  let cursor = skipWs(text, index + 1);
  const parts = [];
  while (cursor < text.length) {
    const lit = readQuoted(text, cursor);
    if (!lit) return null;
    parts.push(lit.value);
    cursor = skipWs(text, lit.end);
    if (text[cursor] === ',') {
      cursor = skipWs(text, cursor + 1);
      continue;
    }
    break;
  }
  if (!parts.length || text[cursor] !== ']') return null;
  cursor = skipWs(text, cursor + 1);
  if (!text.startsWith('.join', cursor)) return null;
  cursor = skipWs(text, cursor + 5);
  if (text[cursor] !== '(') return null;
  cursor = skipWs(text, cursor + 1);
  const sep = readQuoted(text, cursor);
  if (!sep) return null;
  cursor = skipWs(text, sep.end);
  if (text[cursor] !== ')') return null;
  return { end: cursor + 1, value: parts.join(sep.value) };
}

function readSplitJoin(text, index) {
  const lit = readQuoted(text, index);
  if (!lit) return null;
  let cursor = skipWs(text, lit.end);
  if (!text.startsWith('.split', cursor)) return null;
  cursor = skipWs(text, cursor + 6);
  if (text[cursor] !== '(') return null;
  cursor = skipWs(text, cursor + 1);
  const sep = readQuoted(text, cursor);
  if (!sep) return null;
  cursor = skipWs(text, sep.end);
  if (text[cursor] !== ')') return null;
  cursor = skipWs(text, cursor + 1);
  if (!text.startsWith('.join', cursor)) return null;
  cursor = skipWs(text, cursor + 5);
  if (text[cursor] !== '(') return null;
  cursor = skipWs(text, cursor + 1);
  const joiner = readQuoted(text, cursor);
  if (!joiner) return null;
  cursor = skipWs(text, joiner.end);
  if (text[cursor] !== ')') return null;
  return { end: cursor + 1, value: lit.value.split(sep.value).join(joiner.value) };
}

function readConcat(text, index) {
  const first = readQuoted(text, index);
  if (!first) return null;
  let cursor = skipWs(text, first.end);
  if (text[cursor] !== '+') return null;
  let value = first.value;
  let count = 1;
  while (text[cursor] === '+') {
    cursor = skipWs(text, cursor + 1);
    const next = readQuoted(text, cursor);
    if (!next) break;
    value += next.value;
    count += 1;
    cursor = skipWs(text, next.end);
  }
  if (count < 2) return null;
  return { end: cursor, value };
}

function readTemplate(text, index) {
  if (text[index] !== '`') return null;
  let cursor = index + 1;
  let value = '';
  let interpolated = false;
  while (cursor < text.length) {
    if (text[cursor] === '\\') {
      const next = text[cursor + 1];
      value += next === 'n' ? '\n' : next === 'r' ? '\r' : next === 't' ? '\t' : (next ?? '');
      cursor += 2;
      continue;
    }
    if (text[cursor] === '`') {
      if (!interpolated) return null;
      return { end: cursor + 1, value };
    }
    if (text[cursor] === '$' && text[cursor + 1] === '{') {
      const innerAt = skipWs(text, cursor + 2);
      const inner = readQuoted(text, innerAt);
      if (!inner) return null;
      const after = skipWs(text, inner.end);
      if (text[after] !== '}') return null;
      value += inner.value;
      interpolated = true;
      cursor = after + 1;
      continue;
    }
    value += text[cursor];
    cursor += 1;
  }
  return null;
}

function foldedStrings(text) {
  const folds = [];
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    let fold = null;
    if (ch === '[') fold = readArrayJoin(text, index);
    else if (ch === "'" || ch === '"') fold = readSplitJoin(text, index) || readConcat(text, index);
    else if (ch === '`') fold = readTemplate(text, index);
    if (!fold || fold.value.length < 4) continue;
    folds.push({ index, value: fold.value });
    index = fold.end - 1;
  }
  return folds;
}

function evasionFindings(file, text, findings, seen, needles) {
  for (const fold of foldedStrings(text)) {
    if (text.includes(fold.value)) continue;
    const matched = needles.some((needle) => fold.value.includes(needle) || (needle.includes(fold.value) && fold.value.length >= 12 && /[/\-]/.test(fold.value)));
    if (!matched) continue;
    add(findings, seen, 'EVASION', file, text, fold.index, fold.value.slice(0, 120));
  }
}

function isPromptPath(file) {
  const normalized = file.split(path.sep).join('/');
  if (normalized.includes('/fixtures/') || normalized.includes('/fixture/')) return false;
  if (/(?:^|\/)test[_-]/.test(normalized) || /\.test\./.test(normalized)) return false;
  return true;
}

function promptNameFindings(file, text, findings, seen) {
  if (!isPromptPath(file)) return;
  for (const name of PROMPT_NAMES) {
    const pattern = new RegExp(`\\b${name}\\b`);
    const index = text.search(pattern);
    if (index >= 0) add(findings, seen, 'PROMPT-NAMES', file, text, index, name);
  }
}

function isPricePath(file) {
  return /(checkout|payment-intent|seat-price|media-checkout|access-plan|pricing)/i.test(file.split(path.sep).join('/'));
}

function priceFindings(file, text, findings, seen) {
  if (!isPricePath(file)) return;
  const lines = text.split('\n');
  let offset = 0;
  for (const line of lines) {
    const direct = line.match(/\b([A-Z][A-Z0-9_]*PRICE_CENTS)\b\s*=\s*(\d+)/);
    if (direct) add(findings, seen, 'HARDCODED-PRICE', file, text, offset + direct.index, `${direct[1]}=${direct[2]}`);
    else if (/PRICE_CENTS/.test(line)) {
      const names = [...line.matchAll(/\b([A-Z][A-Z0-9_]*PRICE_CENTS)\b/g)].map((item) => item[1]);
      const name = names[names.length - 1];
      if (name) {
        for (const hit of line.matchAll(/['"](\d{2,})['"]/g)) {
          add(findings, seen, 'HARDCODED-PRICE', file, text, offset + hit.index, `${name}=${hit[1]}`);
        }
      }
    }
    const dollars = line.match(/:\s*27\s*;/);
    if (dollars) add(findings, seen, 'HARDCODED-PRICE', file, text, offset + dollars.index, ':27');
    offset += line.length + 1;
  }
}

const GENERIC_ADDRESS = new Set(['street address', 'city', 'state', 'zip', 'postal code', 'address', 'zip code']);

function tagAttr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(['"])(.*?)\\1`, 'i'));
  return match ? match[2] : '';
}

function addressField(name, tag) {
  const blob = `${name} ${tagAttr(tag, 'autocomplete')}`.toLowerCase();
  if (/zip|postal/.test(blob)) return 'zip';
  if (/state|address-level1/.test(blob)) return 'state';
  if (/city|address-level2/.test(blob)) return 'city';
  if (/street|address/.test(blob)) return 'street';
  return '';
}

function isFormPath(file) {
  const normalized = file.split(path.sep).join('/');
  return normalized.endsWith('.html') || /(order|checkout|form)/i.test(normalized);
}

function addressFindings(file, text, findings, seen) {
  if (!isFormPath(file)) return;
  const tags = /<input\b[^>]*>/gi;
  let match = tags.exec(text);
  while (match) {
    const tag = match[0];
    const field = addressField(tagAttr(tag, 'name') || tagAttr(tag, 'id'), tag);
    for (const raw of [tagAttr(tag, 'placeholder'), tagAttr(tag, 'value')]) {
      const value = raw.trim();
      if (!field || !value || GENERIC_ADDRESS.has(value.toLowerCase())) continue;
      if (field === 'state' && /^[A-Z]{2}$/.test(value)) add(findings, seen, 'FIXED-ADDRESS', file, text, match.index, `state=${value}`);
      else if (field === 'zip' && /^\d{5}(?:-\d{4})?$/.test(value)) add(findings, seen, 'FIXED-ADDRESS', file, text, match.index, `zip=${value}`);
      else if (field === 'city') add(findings, seen, 'FIXED-ADDRESS', file, text, match.index, `city=${value}`);
      else if (field === 'street' && /\d/.test(value)) add(findings, seen, 'FIXED-ADDRESS', file, text, match.index, `street=${value}`);
    }
    match = tags.exec(text);
  }
}

function isAssetBundle(file) {
  return /^public\/assets\/[^/]+\.js$/.test(file.split(path.sep).join('/'));
}

const ISO_DATE = /\b((?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))\b/g;
const MONTH_NAME = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const MONTH_DATE = new RegExp(`\\b((?:${MONTH_NAME})\\s+(?:0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?)\\b`, 'gi');
const ORDINAL_WEEKDAY = /\b((?:first|second|third|fourth|fifth|last)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi;
const RANGE_START_KEY = /^(?:start|from|begin)$/i;
const RANGE_END_KEY = /^(?:end|to|until)$/i;

function isDateText(value) {
  const text = String(value || '');
  ISO_DATE.lastIndex = 0;
  MONTH_DATE.lastIndex = 0;
  ORDINAL_WEEKDAY.lastIndex = 0;
  return ISO_DATE.test(text) || MONTH_DATE.test(text) || ORDINAL_WEEKDAY.test(text);
}

function readNumberLiteral(text, index) {
  const match = /^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i.exec(text.slice(index));
  if (!match) return null;
  return { end: index + match[0].length, value: match[0] };
}

function isIdentChar(ch) {
  return /[A-Za-z0-9_$]/.test(ch || '');
}

function readLiteralArgs(text, index) {
  if (text[index] !== '(') return null;
  let cursor = skipWs(text, index + 1);
  const args = [];
  if (text[cursor] === ')') return { end: cursor + 1, args };
  while (cursor < text.length) {
    if (text.startsWith('Date.UTC', cursor) && !isIdentChar(text[cursor - 1])) {
      const nested = readUtcCall(text, cursor);
      if (!nested) return null;
      args.push({ kind: 'utc', value: nested.symbol });
      cursor = skipWs(text, nested.end);
    } else {
      const quoted = readQuoted(text, cursor);
      if (quoted) {
        args.push({ kind: 'string', value: quoted.value });
        cursor = skipWs(text, quoted.end);
      } else {
        const number = readNumberLiteral(text, cursor);
        if (!number) return null;
        args.push({ kind: 'number', value: number.value });
        cursor = skipWs(text, number.end);
      }
    }
    if (text[cursor] === ',') {
      cursor = skipWs(text, cursor + 1);
      continue;
    }
    if (text[cursor] === ')') return { end: cursor + 1, args };
    return null;
  }
  return null;
}

function fixedNumericDate(args) {
  if (!args.length || args.some((arg) => arg.kind !== 'number')) return false;
  const year = Number(args[0].value);
  if (args.length >= 2 && year >= 1900 && year <= 2100) return true;
  return args.length === 1 && year >= 1e11;
}

function readUtcCall(text, index) {
  if (!text.startsWith('Date.UTC', index) || isIdentChar(text[index - 1])) return null;
  const args = readLiteralArgs(text, skipWs(text, index + 'Date.UTC'.length));
  if (!args || !fixedNumericDate(args.args)) return null;
  return { end: args.end, symbol: text.slice(index, args.end).replace(/\s+/g, ' ') };
}

function readNewDateCall(text, index) {
  if (!text.startsWith('new Date', index) || isIdentChar(text[index - 1])) return null;
  const args = readLiteralArgs(text, skipWs(text, index + 'new Date'.length));
  if (!args || !args.args.length) return null;
  const fixed = args.args.every((arg) => arg.kind === 'utc')
    || args.args.some((arg) => arg.kind === 'string' && isDateText(arg.value))
    || fixedNumericDate(args.args);
  if (!fixed) return null;
  return { end: args.end, symbol: text.slice(index, args.end).replace(/\s+/g, ' ') };
}

const MONTH_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_STEMS = [
  { abbrev: 'sept', full: 'september' },
  { abbrev: 'jan', full: 'january' },
  { abbrev: 'feb', full: 'february' },
  { abbrev: 'mar', full: 'march' },
  { abbrev: 'apr', full: 'april' },
  { abbrev: 'may', full: 'may' },
  { abbrev: 'jun', full: 'june' },
  { abbrev: 'jul', full: 'july' },
  { abbrev: 'aug', full: 'august' },
  { abbrev: 'sep', full: 'september' },
  { abbrev: 'oct', full: 'october' },
  { abbrev: 'nov', full: 'november' },
  { abbrev: 'dec', full: 'december' },
];
const MONTH_WORDS = new Set([...MONTH_FULL, ...MONTH_STEMS.map((stem) => stem.abbrev)]);

function regexLikely(text, index) {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(text[cursor])) cursor -= 1;
  if (cursor < 0) return true;
  const prev = text[cursor];
  if ('(,=:[!&|?{};~^'.includes(prev)) return true;
  if (!/[A-Za-z0-9_$]/.test(prev)) return false;
  let start = cursor;
  while (start >= 0 && /[A-Za-z0-9_$]/.test(text[start])) start -= 1;
  return /^(?:return|case|throw|delete|void|typeof|in|of|instanceof|yield|await|else|do)$/.test(text.slice(start + 1, cursor + 1));
}

function readRegexLiteral(text, index) {
  if (text[index] !== '/' || text[index + 1] === '/' || text[index + 1] === '*') return null;
  if (!regexLikely(text, index)) return null;
  let cursor = index + 1;
  let inClass = false;
  while (cursor < text.length) {
    if (text[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (text[cursor] === '\n') return null;
    if (text[cursor] === '[') inClass = true;
    else if (text[cursor] === ']') inClass = false;
    else if (text[cursor] === '/' && !inClass) {
      let end = cursor + 1;
      while (/[a-z]/i.test(text[end] || '')) end += 1;
      return { bodyStart: index + 1, bodyEnd: cursor, end };
    }
    cursor += 1;
  }
  return null;
}

function readGroup(text, index) {
  if (text[index] !== '(') return null;
  let depth = 0;
  let inClass = false;
  for (let cursor = index; cursor < text.length; cursor += 1) {
    const ch = text[cursor];
    if (ch === '\\') {
      cursor += 1;
      continue;
    }
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (!inClass && ch === '(') depth += 1;
    else if (!inClass && ch === ')') {
      depth -= 1;
      if (depth === 0) return { end: cursor + 1, inner: text.slice(index + 1, cursor) };
    }
  }
  return null;
}

function readNonCapture(text, index) {
  if (!text.startsWith('(?:', index)) return null;
  const group = readGroup(text, index);
  if (!group || !group.inner.startsWith('?:')) return null;
  let end = group.end;
  if (text[end] === '?') end += 1;
  return { end, inner: group.inner.slice(2) };
}

function readTemplateSpan(text, index) {
  if (text[index] !== '`') return null;
  let cursor = index + 1;
  while (cursor < text.length) {
    if (text[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (text[cursor] === '`') return { end: cursor + 1, raw: text.slice(index + 1, cursor) };
    if (text[cursor] === '$' && text[cursor + 1] === '{') {
      cursor += 2;
      let depth = 1;
      while (cursor < text.length && depth > 0) {
        if (text[cursor] === '\\') {
          cursor += 2;
          continue;
        }
        if (text[cursor] === "'" || text[cursor] === '"') {
          const lit = readQuoted(text, cursor);
          cursor = lit ? lit.end : cursor + 1;
          continue;
        }
        if (text[cursor] === '`') break;
        if (text[cursor] === '{') depth += 1;
        else if (text[cursor] === '}') depth -= 1;
        if (depth > 0) cursor += 1;
      }
      continue;
    }
    cursor += 1;
  }
  return null;
}

function monthLetters(pattern) {
  return String(pattern || '').replace(/\\.|[^A-Za-z]/g, '').toLowerCase();
}

function readMonthAtom(source, index) {
  const precededByLetter = index > 0 && /[A-Za-z]/.test(source[index - 1]) && source[index - 2] !== '\\';
  if (precededByLetter) return null;
  const slice = source.slice(index);
  if (slice[0] === '(' && slice[1] !== '?') {
    const group = readGroup(source, index);
    if (group) {
      const alts = group.inner.split('|').map((part) => part.trim()).filter(Boolean);
      if (alts.length > 1 && alts.every((alt) => /^[A-Za-z]+$/.test(alt))) {
        const letters = /^[A-Za-z]*/.exec(source.slice(group.end))[0];
        let suffix = '';
        const fits = (alt, candidate) => {
          const word = `${alt}${candidate}`.toLowerCase();
          if (MONTH_WORDS.has(word)) return true;
          const stem = MONTH_STEMS.find((item) => item.abbrev === alt.toLowerCase() || item.full === alt.toLowerCase());
          return Boolean(stem) && (candidate === '' || stem.full.endsWith(candidate.toLowerCase()));
        };
        for (let len = letters.length; len >= 0; len -= 1) {
          const candidate = letters.slice(0, len);
          if (alts.every((alt) => fits(alt, candidate))) {
            suffix = candidate;
            break;
          }
        }
        if (alts.every((alt) => fits(alt, suffix))) {
          const end = group.end + suffix.length;
          if (/[A-Za-z]/.test(source[end] || '')) return null;
          return { end, symbol: source.slice(index, end) };
        }
      }
    }
  }
  const lower = slice.toLowerCase();
  const followedByDay = (cursor) => /^\s+(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b/.test(source.slice(cursor));
  for (const name of [...MONTH_FULL].sort((left, right) => right.length - left.length)) {
    if (lower.startsWith(name) && !/[A-Za-z]/.test(slice[name.length] || '')) {
      if (followedByDay(index + name.length)) return null;
      return { end: index + name.length, symbol: source.slice(index, index + name.length) };
    }
  }
  for (const stem of [...MONTH_STEMS].sort((left, right) => right.abbrev.length - left.abbrev.length)) {
    if (!lower.startsWith(stem.abbrev)) continue;
    const next = slice[stem.abbrev.length] || '';
    if (/[A-Za-z]/.test(next)) continue;
    let cursor = index + stem.abbrev.length;
    let built = stem.abbrev.toLowerCase();
    while (source.startsWith('(?:', cursor)) {
      const group = readNonCapture(source, cursor);
      if (!group) break;
      const alts = splitMonthAlts(group.inner);
      if (!alts.length) break;
      const extended = alts.map((alt) => `${built}${monthLetters(alt)}`);
      if (!extended.every((combined) => stem.full.startsWith(combined))) break;
      built = extended.reduce((shortest, combined) => (combined.length < shortest.length ? combined : shortest));
      cursor = group.end;
    }
    if (/[A-Za-z]/.test(source[cursor] || '')) return null;
    if (followedByDay(cursor)) return null;
    return { end: cursor, symbol: source.slice(index, cursor) };
  }
  return null;
}

function splitMonthAlts(inner) {
  const parts = [];
  let current = '';
  let depth = 0;
  let inClass = false;
  for (let index = 0; index < inner.length; index += 1) {
    const ch = inner[index];
    if (ch === '\\') {
      current += ch + (inner[index + 1] || '');
      index += 1;
      continue;
    }
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (!inClass && ch === '(') depth += 1;
    else if (!inClass && ch === ')') depth = Math.max(0, depth - 1);
    else if (!inClass && depth === 0 && ch === '|') {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.filter((part) => part !== '');
}

function monthAtoms(body) {
  const hits = [];
  let inClass = false;
  for (let index = 0; index < body.length; index += 1) {
    if (body[index] === '\\') {
      index += 1;
      continue;
    }
    if (body[index] === '[') {
      inClass = true;
      continue;
    }
    if (body[index] === ']') {
      inClass = false;
      continue;
    }
    if (inClass) continue;
    const hit = readMonthAtom(body, index);
    if (!hit) continue;
    hits.push({ index, symbol: hit.symbol });
    index = hit.end - 1;
  }
  return hits;
}

function pushMonthBody(file, text, findings, seen, body, base) {
  for (const hit of monthAtoms(body)) {
    add(findings, seen, 'DATE-LITERAL', file, text, base + hit.index, hit.symbol);
  }
}

function monthRegexFindings(file, text, findings, seen) {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '/') continue;
    const literal = readRegexLiteral(text, index);
    if (!literal) continue;
    pushMonthBody(file, text, findings, seen, text.slice(literal.bodyStart, literal.bodyEnd), literal.bodyStart);
    index = literal.end - 1;
  }
  for (const match of text.matchAll(/\bRegExp\s*\(\s*/g)) {
    const at = skipWs(text, match.index + match[0].length);
    if (text[at] === "'" || text[at] === '"') {
      const quoted = readQuoted(text, at);
      if (quoted) pushMonthBody(file, text, findings, seen, text.slice(at + 1, quoted.end - 1), at + 1);
    } else if (text[at] === '`') {
      const span = readTemplateSpan(text, at);
      if (span) pushMonthBody(file, text, findings, seen, span.raw, at + 1);
    } else {
      const folded = readConcat(text, at) || readArrayJoin(text, at);
      if (folded) pushMonthBody(file, text, findings, seen, folded.value, at);
    }
  }
}

function dateLiteralFindings(file, text, findings, seen) {
  for (const pattern of [ISO_DATE, MONTH_DATE, ORDINAL_WEEKDAY]) {
    for (const match of collect(pattern, text, (item) => item)) {
      add(findings, seen, 'DATE-LITERAL', file, text, match.index, match[1]);
    }
  }
  for (let index = 0; index < text.length; index += 1) {
    const created = text.startsWith('new Date', index) ? readNewDateCall(text, index) : null;
    const utc = !created && text.startsWith('Date.UTC', index) ? readUtcCall(text, index) : null;
    const hit = created || utc;
    if (!hit) continue;
    add(findings, seen, 'DATE-LITERAL', file, text, index, hit.symbol);
    index = hit.end - 1;
  }
  const pair = /\b(start|from|begin|end|to|until)\b\s*:\s*(?:'[^'\n]*'|"[^"\n]*"|new\s+Date\s*\([^)\n]*\)|Date\.UTC\s*\([^)\n]*\))/gi;
  const keys = [];
  let match = pair.exec(text);
  while (match) {
    const valueAt = skipWs(text, match.index + match[0].indexOf(':') + 1);
    const quoted = readQuoted(text, valueAt);
    const created = quoted ? null : readNewDateCall(text, valueAt);
    const utc = quoted || created ? null : readUtcCall(text, valueAt);
    const value = quoted ? quoted.value : created ? created.symbol : utc ? utc.symbol : '';
    const date = quoted ? isDateText(quoted.value) : Boolean(created || utc);
    if (date) keys.push({ index: match.index, key: match[1], value, end: match.index + match[0].length });
    match = pair.exec(text);
  }
  const used = new Set();
  for (let left = 0; left < keys.length; left += 1) {
    for (let right = left + 1; right < keys.length; right += 1) {
      const a = keys[left];
      const b = keys[right];
      if (b.index - a.index > 240) break;
      const start = RANGE_START_KEY.test(a.key) ? a : RANGE_START_KEY.test(b.key) ? b : null;
      const end = RANGE_END_KEY.test(a.key) ? a : RANGE_END_KEY.test(b.key) ? b : null;
      if (!start || !end || start === end) continue;
      const between = text.slice(a.end, b.index);
      if (/\}/.test(between) && /\{/.test(between)) continue;
      const symbol = `{${start.key}:'${start.value}',${end.key}:'${end.value}'}`;
      if (used.has(symbol)) continue;
      used.add(symbol);
      add(findings, seen, 'DATE-LITERAL', file, text, start.index, symbol);
    }
  }
  monthRegexFindings(file, text, findings, seen);
}

function isRemoteAsset(ref) {
  const value = String(ref || '').trim();
  return value === '' || /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value) || /^(?:data|blob|mailto):/i.test(value);
}

function scriptAssetRefs(text) {
  const refs = [];
  const push = (index, raw) => {
    const value = String(raw || '').trim();
    if (!value || isRemoteAsset(value)) return;
    refs.push({ index, ref: value });
  };
  for (const match of text.matchAll(/<script\b[^>]*?\bsrc\s*=\s*(['"])(.*?)\1/gi)) push(match.index, match[2]);
  for (const match of text.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\brel\s*=\s*(['"])modulepreload\1/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*(['"])(.*?)\1/i);
    if (href) push(match.index, href[2]);
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*(['"])(.*?)\1\s*\)/g)) push(match.index, match[2]);
  for (const match of text.matchAll(/\.src\s*=\s*(['"])(.*?)\1/g)) push(match.index, match[2]);
  return refs;
}

function localScriptCandidates(htmlFile, ref) {
  const clean = String(ref || '').split(/[?#]/)[0];
  const base = clean.split('/').pop() || '';
  const ext = path.posix.extname(base).toLowerCase();
  if (!['.js', '.mjs', '.cjs'].includes(ext)) return [];
  const paths = clean.startsWith('/')
    ? [clean.replace(/^\/+/, ''), `public/${clean.replace(/^\/+/, '')}`]
    : [path.posix.normalize(path.posix.join(path.posix.dirname(htmlFile.split(path.sep).join('/')), clean))];
  return paths.filter((rel) => rel && !rel.startsWith('..') && !rel.includes('/../'));
}

function gitTracked(cwd, rel) {
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf8' });
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') return fs.existsSync(path.join(cwd, rel));
  const listed = spawnSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd, encoding: 'utf8' });
  return listed.status === 0;
}

export function fetchedBundleNames(cwd = process.cwd()) {
  const writer = path.join(cwd, 'scripts/write-shared-assets.mjs');
  if (!fs.existsSync(writer)) return [];
  const text = fs.readFileSync(writer, 'utf8');
  if (!/\bfetch\s*\(/.test(text) || !/https?:\/\//.test(text)) return [];
  return [...text.matchAll(/['"`](index-[A-Za-z0-9._-]+\.js)['"`]/g)].map((match) => match[1]);
}

export function offlineBuildProduces(cwd, repoRelativePath) {
  const base = path.posix.basename(String(repoRelativePath || '').split(path.sep).join('/'));
  if (!base || fetchedBundleNames(cwd).includes(base)) return false;
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  let build = '';
  try {
    build = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts?.build || '';
  } catch {
    return false;
  }
  if (!/\bvite\b/.test(build)) return false;
  // Vite writes hashed files under dist/. It does not create a missing public
  // asset, under the path the HTML references, from a local source module.
  return false;
}

export function explainSharedBundle(cwd = process.cwd()) {
  const writerText = fs.existsSync(path.join(cwd, 'scripts/write-shared-assets.mjs'))
    ? fs.readFileSync(path.join(cwd, 'scripts/write-shared-assets.mjs'), 'utf8')
    : '';
  const viteText = fs.existsSync(path.join(cwd, 'vite.config.mjs'))
    ? fs.readFileSync(path.join(cwd, 'vite.config.mjs'), 'utf8')
    : '';
  const name = (writerText.match(/const\s+JS_NAME\s*=\s*['"]([^'"]+)['"]/) || ['', 'index-BKun7ofk.js'])[1];
  const url = writerText.includes('https://travel.timesyncher.com/assets/')
    ? `https://travel.timesyncher.com/assets/${name}`
    : '';
  const hooked = /writeSharedAssets/.test(viteText) && /buildStart/.test(viteText);
  const message = [
    `shared-app.html loads /assets/${name} by assigning script.src.`,
    `public/assets/${name} is gitignored and not committed.`,
    hooked
      ? 'vite.config.mjs plugin timesyncher-shared-assets calls scripts/write-shared-assets.mjs at buildStart.'
      : 'The vite config does not call write-shared-assets.mjs.',
    url
      ? `${url} is downloaded there. No local source directory produces this file.`
      : 'No local source directory produces this file.',
    'An offline build does not produce it.',
  ].join(' ');
  return { message, offlineBuildProduct: false, url };
}

function committedHtmlFiles(cwd) {
  const listed = spawnSync('git', ['ls-files', '-z', '--', '*.html'], { cwd, encoding: 'utf8' });
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf8' });
  if (inside.status === 0 && inside.stdout.trim() === 'true' && listed.status === 0) {
    return listed.stdout.split('\0').filter(Boolean);
  }
  const files = [];
  const walkHtml = (abs) => {
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const next = path.join(abs, entry.name);
      if (entry.isDirectory()) walkHtml(next);
      else if (entry.name.endsWith('.html')) files.push(path.relative(cwd, next).split(path.sep).join('/'));
    }
  };
  walkHtml(cwd);
  return files;
}

export function htmlRefsProducedByBuild(cwd = process.cwd()) {
  const produced = [];
  for (const file of committedHtmlFiles(cwd)) {
    const text = fs.readFileSync(path.join(cwd, file), 'utf8');
    for (const ref of scriptAssetRefs(text)) {
      const candidates = localScriptCandidates(file, ref.ref);
      if (!candidates.length || candidates.some((repoPath) => gitTracked(cwd, repoPath))) continue;
      const repoPath = candidates[candidates.length - 1];
      if (offlineBuildProduces(cwd, repoPath)) produced.push({ file, ref: ref.ref, repoPath });
    }
  }
  return produced;
}

function servedBundleFindings(cwd) {
  const findings = [];
  for (const file of committedHtmlFiles(cwd)) {
    const abs = path.join(cwd, file);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    const seen = new Set();
    for (const ref of scriptAssetRefs(text)) {
      const candidates = localScriptCandidates(file, ref.ref);
      if (!candidates.length || candidates.some((repoPath) => gitTracked(cwd, repoPath))) continue;
      if (candidates.some((repoPath) => offlineBuildProduces(cwd, repoPath))) continue;
      add(findings, seen, 'SERVED-BUNDLE', file, text, ref.index, `${ref.ref} is not in the repo and the build does not produce it`);
    }
  }
  return findings;
}

export function scanText(file, text, { tokens = false, inventoryOnly = false } = {}) {
  const value = String(text || '');
  const findings = [];
  const seen = new Set();
  if (inventoryOnly) {
    inventoryFindings(file, value, findings, seen, { bundles: true });
    return findings;
  }
  if (tokens || isTokenPath(file)) tokenFindings(file, value, findings, seen);
  if (!tokens && !isTokenPath(file)) {
    placeListFindings(file, value, findings, seen);
    coordFindings(file, value, findings, seen);
    thingFindings(file, value, findings, seen);
    dialogFindings(file, value, findings, seen);
    inventoryFindings(file, value, findings, seen);
    thingSourceFindings(file, value, findings, seen);
    cannedFallbackFindings(file, value, findings, seen);
    if (isAssetBundle(file)) contentMatchFindings(file, value, findings, seen, CONTENT_NEEDLES, 'BUNDLE-SCAN');
    else {
      contentMatchFindings(file, value, findings, seen, CONTENT_NEEDLES, 'CONTENT-MATCH');
      evasionFindings(file, value, findings, seen, CONTENT_NEEDLES);
      dateLiteralFindings(file, value, findings, seen);
      promptNameFindings(file, value, findings, seen);
      priceFindings(file, value, findings, seen);
      addressFindings(file, value, findings, seen);
    }
  }
  return findings;
}

function isTokenPath(file) {
  const normalized = file.split(path.sep).join('/');
  if (TOKEN_DIRS.some((root) => normalized === root || normalized.startsWith(`${root}/`))) return true;
  return normalized.startsWith('public/keepsake-handoff-');
}

function contentPaths(cwd) {
  const files = [];
  for (const root of CONTENT_DIRS) walk(path.join(cwd, root), cwd, files, false);
  for (const file of CONTENT_FILES) {
    if (fs.existsSync(path.join(cwd, file))) files.push(file);
  }
  return files;
}

function tokenPaths(cwd) {
  const files = [];
  for (const root of TOKEN_DIRS) walk(path.join(cwd, root), cwd, files, true);
  const pub = path.join(cwd, 'public');
  if (!fs.existsSync(pub)) return files;
  for (const name of fs.readdirSync(pub)) {
    if (name.startsWith('keepsake-handoff-')) walk(path.join(pub, name), cwd, files, true);
  }
  return files;
}

function walk(abs, cwd, files, tokens) {
  if (!fs.existsSync(abs)) return;
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    const ext = path.extname(abs).toLowerCase();
    if (tokens ? ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg' && ext !== '.gif' && ext !== '.webp' && ext !== '.ico' : TEXT_EXT.has(ext)) {
      files.push(path.relative(cwd, abs));
    }
    return;
  }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    walk(path.join(abs, entry.name), cwd, files, tokens);
  }
}

function readScanned(abs) {
  const ext = path.extname(abs).toLowerCase();
  if (ext === '.pdf') {
    const extracted = spawnSync('pdftotext', ['-layout', abs, '-'], { encoding: 'utf8' });
    const text = extracted.status === 0 ? extracted.stdout || '' : '';
    return `${text}\n${fs.readFileSync(abs).toString('latin1')}`;
  }
  return fs.readFileSync(abs, 'utf8');
}

function bundlePaths(cwd) {
  return BUNDLE_FILES.filter((file) => fs.existsSync(path.join(cwd, file)));
}

// Direct children of public/assets only. The one raw pulled input,
// public/assets/upstream/index-BKun7ofk.js, still contains the canned strings
// and is not a direct child, so this scan skips it. The stripped file the build
// writes, public/assets/index-BKun7ofk.js, is a direct child and is scanned when present.
function assetBundlePaths(cwd) {
  const dir = path.join(cwd, 'public/assets');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.js')).map((name) => `public/assets/${name}`).sort();
}

function guardExempt(file) {
  const normalized = file.split(path.sep).join('/');
  if (GUARD_FILES.has(normalized)) return true;
  return normalized.startsWith('scripts/fixtures/hardcoded-content/');
}

function repoTextFiles(cwd) {
  const files = [];
  walk(cwd, cwd, files, false);
  // public/assets/ stays out of the repo-text walk. That existing skip is what
  // leaves the one raw pulled file, public/assets/upstream/index-BKun7ofk.js, unscanned.
  return files.filter((file) => !guardExempt(file) && !file.split(path.sep).join('/').startsWith('evidence/') && !file.split(path.sep).join('/').startsWith('public/assets/') && !file.split(path.sep).join('/').startsWith('artifacts/'));
}

function extraScriptPaths(cwd) {
  const dir = path.join(cwd, 'scripts');
  if (!fs.existsSync(dir)) return [];
  const covered = new Set(contentPaths(cwd));
  const files = [];
  for (const name of fs.readdirSync(dir)) {
    if (!/\.(mjs|js|py)$/.test(name) || /^test[_-]/.test(name)) continue;
    const rel = `scripts/${name}`;
    if (covered.has(rel) || guardExempt(rel)) continue;
    files.push(rel);
  }
  return files;
}

function apiFunctionFiles(cwd) {
  const root = path.join(cwd, 'api');
  const files = [];
  const visit = (abs) => {
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const next = path.join(abs, entry.name);
      if (entry.isDirectory()) {
        visit(next);
        continue;
      }
      if (entry.name.startsWith('_') || entry.name.endsWith('.d.ts')) continue;
      if (FUNCTION_EXT.has(path.extname(entry.name))) files.push(path.relative(cwd, next));
    }
  };
  visit(root);
  return files;
}

export function scanRoots(cwd = process.cwd()) {
  const findings = [];
  for (const file of contentPaths(cwd)) {
    findings.push(...scanText(file, fs.readFileSync(path.join(cwd, file), 'utf8')));
  }
  for (const file of extraScriptPaths(cwd)) {
    const text = fs.readFileSync(path.join(cwd, file), 'utf8');
    const seen = new Set();
    const extra = [];
    thingSourceFindings(file, text, extra, seen);
    cannedFallbackFindings(file, text, extra, seen);
    findings.push(...extra);
  }
  for (const file of repoTextFiles(cwd)) {
    const text = fs.readFileSync(path.join(cwd, file), 'utf8');
    const seen = new Set();
    const extra = [];
    modelAllowlistFindings(file, text, extra, seen);
    googlePlacesFindings(file, text, extra, seen);
    findings.push(...extra);
  }
  for (const file of bundlePaths(cwd)) {
    findings.push(...scanText(file, fs.readFileSync(path.join(cwd, file), 'utf8'), { inventoryOnly: true }));
  }
  for (const file of assetBundlePaths(cwd)) {
    const extra = [];
    contentMatchFindings(file, fs.readFileSync(path.join(cwd, file), 'utf8'), extra, new Set(), CONTENT_NEEDLES, 'BUNDLE-SCAN');
    findings.push(...extra);
  }
  const functions = apiFunctionFiles(cwd);
  if (functions.length > API_FN_CAP) {
    findings.push({
      rule: 'API-FN-CAP',
      file: 'api',
      line: 1,
      symbol_or_pattern: `${functions.length}>${API_FN_CAP}`,
    });
  }
  for (const [file, reads, throws] of STAMP_GUARDS) {
    const abs = path.join(cwd, file);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, 'utf8');
    if (!reads.test(text) || !throws.test(text)) {
      findings.push({ rule: 'BUILD-STAMP', file, line: 1, symbol_or_pattern: 'empty-stamp' });
    }
  }
  for (const file of tokenPaths(cwd)) {
    findings.push(...scanText(file, readScanned(path.join(cwd, file)), { tokens: true }));
  }
  findings.push(...servedBundleFindings(cwd));
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule) || a.symbol_or_pattern.localeCompare(b.symbol_or_pattern));
  return findings;
}

export function contentIdentity(entry) {
  return `${entry.rule}\0${entry.file}\0${entry.symbol_or_pattern ?? entry.symbol}`;
}

export function classify(findings, baseline) {
  const keys = new Set((baseline || []).map(contentIdentity));
  const report = [];
  const fail = [];
  for (const finding of findings) {
    if (finding.rule === 'TOKEN-EVIDENCE' || finding.rule === 'NO-GOOGLE-PLACES' || finding.rule === 'API-FN-CAP' || !keys.has(contentIdentity(finding))) fail.push(finding);
    else report.push(finding);
  }
  return { report, fail };
}

export function loadBaselineFile(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('baseline must be an array');
  for (const entry of parsed) {
    for (const key of ['file', 'rule', 'symbol_or_pattern', 'inventory_id', 'note']) {
      if (!entry || typeof entry[key] !== 'string' || !entry[key]) throw new Error(`baseline entry missing ${key}`);
    }
  }
  return parsed;
}

function baselineRuleId(row) {
  return row.rule || row.inventory_id;
}

function baselineRowKey(row) {
  return `${row.file}\0${row.symbol_or_pattern}\0${row.inventory_id}`;
}

export function baselineGrowthAllowed(current, baseRows) {
  if (current.length <= baseRows.length) return true;
  if (baseRows.length === 0) return false;
  const baseKeys = new Set(baseRows.map(baselineRowKey));
  const added = current.filter((row) => !baseKeys.has(baselineRowKey(row)));
  if (added.length !== current.length - baseRows.length) return false;
  const baseRules = new Set(baseRows.map(baselineRuleId));
  return added.every((row) => !baseRules.has(baselineRuleId(row)));
}

export function baselineRemoteRef(ref) {
  const name = String(ref || '').trim();
  if (!name) return '';
  return name.startsWith('origin/') ? name : `origin/${name}`;
}

export function baseBaselineCount(cwd = process.cwd()) {
  const ref = process.env.BASE || process.env.GITHUB_BASE_REF || '';
  if (!ref) return { status: 'skip' };
  const shown = spawnSync('git', ['show', `${baselineRemoteRef(ref)}:scripts/hardcoded-content-baseline.json`], {
    cwd,
    encoding: 'utf8',
  });
  if (shown.status !== 0) {
    const err = shown.stderr || '';
    if (/does not exist|exists on disk, but not in/i.test(err)) return { status: 'missing' };
    return { status: 'error', error: err.trim() || 'baseline ceiling unavailable' };
  }
  const parsed = JSON.parse(shown.stdout);
  if (!Array.isArray(parsed)) return { status: 'error', error: 'base baseline is not an array' };
  return { status: 'ok', count: parsed.length, rows: parsed };
}

export function evaluate(cwd = process.cwd()) {
  const baselinePath = path.join(cwd, BASELINE_REL);
  const baseline = fs.existsSync(baselinePath) ? loadBaselineFile(baselinePath) : [];
  const findings = scanRoots(cwd);
  const { report, fail } = classify(findings, baseline);
  const ceiling = baseBaselineCount(cwd);
  if (ceiling.status === 'error') {
    fail.push({
      rule: 'BASELINE-GROWTH',
      file: BASELINE_REL,
      line: 1,
      symbol_or_pattern: ceiling.error,
    });
  } else if (ceiling.status === 'ok' && baseline.length > ceiling.count && !baselineGrowthAllowed(baseline, ceiling.rows)) {
    fail.push({
      rule: 'BASELINE-GROWTH',
      file: BASELINE_REL,
      line: 1,
      symbol_or_pattern: `${baseline.length}>${ceiling.count}`,
    });
  }
  return { report, fail, baselineCount: baseline.length, ceiling };
}

function main() {
  const { report, fail } = evaluate(process.cwd());
  for (const finding of report) {
    process.stdout.write(`REPORT\t${finding.rule}\t${finding.file}:${finding.line}\t${finding.symbol_or_pattern}\n`);
  }
  for (const finding of fail) {
    process.stderr.write(`FAIL\t${finding.rule}\t${finding.file}:${finding.line}\t${finding.symbol_or_pattern}\n`);
  }
  const summary = `hardcoded content check ${fail.length ? 'failed' : 'passed'} (${report.length} report, ${fail.length} fail)\n`;
  (fail.length ? process.stderr : process.stdout).write(summary);
  if (fail.length) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
