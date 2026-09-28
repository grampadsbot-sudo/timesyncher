import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { INVENTORY_PATTERNS } from './hardcoded-inventory-patterns.mjs';

export const BASELINE_NOTE = 'removed by Search Eng / Reply Eng deletion PR';
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

function guardExempt(file) {
  const normalized = file.split(path.sep).join('/');
  if (GUARD_FILES.has(normalized)) return true;
  return normalized.startsWith('scripts/fixtures/hardcoded-content/');
}

function repoTextFiles(cwd) {
  const files = [];
  walk(cwd, cwd, files, false);
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

export function baseBaselineCount(cwd = process.cwd()) {
  const ref = process.env.BASE || process.env.GITHUB_BASE_REF || '';
  if (!ref) return { status: 'skip' };
  const shown = spawnSync('git', ['show', `origin/${ref}:scripts/hardcoded-content-baseline.json`], {
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
  return { status: 'ok', count: parsed.length };
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
  } else if (ceiling.status === 'ok' && baseline.length > ceiling.count) {
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
