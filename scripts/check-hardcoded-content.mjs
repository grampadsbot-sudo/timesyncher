import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { INVENTORY_PATTERNS } from './hardcoded-inventory-patterns.mjs';

export const BASELINE_NOTE = 'removed by Search Eng / Reply Eng deletion PR';
const BASELINE_REL = 'scripts/hardcoded-content-baseline.json';

const TEXT_EXT = new Set(['.mjs', '.js', '.html', '.json', '.jsonl', '.md', '.txt', '.css', '.yml', '.yaml', '.svg', '.csv']);
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

export function scanRoots(cwd = process.cwd()) {
  const findings = [];
  for (const file of contentPaths(cwd)) {
    findings.push(...scanText(file, fs.readFileSync(path.join(cwd, file), 'utf8')));
  }
  for (const file of bundlePaths(cwd)) {
    findings.push(...scanText(file, fs.readFileSync(path.join(cwd, file), 'utf8'), { inventoryOnly: true }));
  }
  for (const file of tokenPaths(cwd)) {
    findings.push(...scanText(file, readScanned(path.join(cwd, file)), { tokens: true }));
  }
  findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule) || a.symbol_or_pattern.localeCompare(b.symbol_or_pattern));
  return findings;
}

export function classify(findings, baseline) {
  const keys = new Set((baseline || []).map((entry) => `${entry.file}\0${entry.symbol_or_pattern}`));
  const report = [];
  const fail = [];
  for (const finding of findings) {
    if (finding.rule === 'TOKEN-EVIDENCE' || !keys.has(`${finding.file}\0${finding.symbol_or_pattern}`)) fail.push(finding);
    else report.push(finding);
  }
  return { report, fail };
}

export function loadBaselineFile(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('baseline must be an array');
  for (const entry of parsed) {
    for (const key of ['file', 'symbol_or_pattern', 'inventory_id', 'note']) {
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
