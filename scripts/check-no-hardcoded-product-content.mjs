import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PLACE = 'bellagio|las vegas|big island|kailua-kona';
const PLACE_RE = new RegExp(PLACE, 'i');

/**
 * Seeded catalogs and activity pins owned by other inventory items.
 * Name→coord/summary hits in these files are not G2. Price TBD, thingId 8869,
 * and the G2 tag regexes are still checked.
 */
export const NAME_MAP_OWNED_ELSEWHERE = new Set([
  'src/vacation/keepsake-list-minimums.mjs',
  'src/vacation/intake-shared-trip.mjs',
]);

const THING_ID_8869 = /\bthingId\s*:\s*8869\b/;
const PRICE_TBD = /Price TBD/;
const ULU_TAG = /\/ulu ocean\/i/;
const HUGGO_OR_HOPPER_TAG = /\/(?:huggo|fish hopper)\/i/;
const LODGING_HINT = /\/bellagio\|lodging\|hotel\|fountain\/i/;
const NAME_REGEX_COORDS = new RegExp(
  `\\/(?:[^/\\n]*?(?:${PLACE})[^/\\n]*?)\\/[gimsuy]*\\s*,\\s*\\[\\s*-?\\d`,
  'i',
);
const KEY_COORDS = new RegExp(
  `['"][^'"]*(?:${PLACE})[^'"]*['"]\\s*:\\s*(?:\\[\\s*-?\\d|\\{\\s*lat\\s*:)`,
  'i',
);
const KEY_SUMMARY = new RegExp(
  `['"][^'"]*(?:${PLACE})[^'"]*['"]\\s*:\\s*\\{[^}]{0,240}summary\\s*:`,
  'i',
);

function lineNumber(text, index) {
  return text.slice(0, index).split('\n').length;
}

function push(hits, rule, text, index) {
  hits.push({ rule, line: lineNumber(text, index) });
}

export function findHardcodedProductContent(text, file = 'src/file.mjs') {
  const value = String(text || '');
  const hits = [];
  const rel = String(file || '').replaceAll('\\', '/');
  const thingId = THING_ID_8869.exec(value);
  if (thingId) push(hits, 'thing-id-8869', value, thingId.index);
  const price = PRICE_TBD.exec(value);
  if (price) push(hits, 'price-tbd', value, price.index);
  const ulu = ULU_TAG.exec(value);
  if (ulu) push(hits, 'a11-restaurant-tag', value, ulu.index);
  const huggo = HUGGO_OR_HOPPER_TAG.exec(value);
  if (huggo) push(hits, 'a11-restaurant-tag', value, huggo.index);
  const lodging = LODGING_HINT.exec(value);
  if (lodging) push(hits, 'a17-filename-hint', value, lodging.index);

  if (!NAME_MAP_OWNED_ELSEWHERE.has(rel)) {
    const lines = value.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const previous = i > 0 ? lines[i - 1] : '';
      const summaryLine = /summary\s*:/.test(line) && PLACE_RE.test(line) && /match\s*:/.test(`${previous}\n${line}`);
      if (NAME_REGEX_COORDS.test(line) || KEY_COORDS.test(line) || KEY_SUMMARY.test(line) || summaryLine) {
        hits.push({ rule: 'name-coord-or-summary-map', line: i + 1 });
      }
    }
  }
  return hits;
}

function walk(dir, files) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(mjs|js)$/.test(entry.name)) files.push(full);
  }
}

export function scanSrc(cwd = process.cwd()) {
  const root = path.join(cwd, 'src');
  const files = [];
  walk(root, files);
  const findings = [];
  for (const file of files) {
    const rel = path.relative(cwd, file).replaceAll('\\', '/');
    const text = fs.readFileSync(file, 'utf8');
    for (const hit of findHardcodedProductContent(text, rel)) {
      findings.push({ file: rel, ...hit });
    }
  }
  return findings;
}

function main() {
  const findings = scanSrc();
  if (findings.length) {
    for (const hit of findings) {
      process.stderr.write(`${hit.file}:${hit.line} ${hit.rule}\n`);
    }
    process.stderr.write(`hardcoded product content: ${findings.length} hit(s)\n`);
    process.exit(1);
  }
  process.stdout.write('hardcoded product content check passed\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
