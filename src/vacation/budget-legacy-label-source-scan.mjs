import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const VACATION_SRC_ROOT = fileURLToPath(new URL('.', import.meta.url));
const BUDGET_UNIT_TEST = join(REPO_ROOT, 'apps/vacation-client/test/budget.unit.mjs');

const ADJACENT_LITERAL_CONCAT_RE =
  /(['"])(?:\\.|(?!\1)[^\\])*\1\s*\+\s*(['"])(?:\\.|(?!\2)[^\\])*\2/g;

const STRING_LITERAL_ARRAY_JOIN_RE =
  /\[([\s\S]*?)\]\s*\.join\s*\(\s*(['"])(?:\\.|(?!\2)[^\\])*\2\s*\)/g;

const STRING_LITERAL_RE = /(['"])(?:\\.|(?!\1)[^\\])*\1/g;

function unquoteLiteral(literal) {
  const quote = literal[0];
  const body = literal.slice(1, -1);
  return body.replace(new RegExp(`\\\\${quote}|\\\\.`, 'g'), (esc) => (esc.length === 2 ? esc[1] : esc));
}

function mergeAdjacentStringLiterals(source = '') {
  let text = String(source);
  for (let pass = 0; pass < 32; pass++) {
    const next = text.replace(ADJACENT_LITERAL_CONCAT_RE, (segment) => {
      const parts = segment.match(/(['"])(?:\\.|(?!\1)[^\\])*\1/g);
      if (!parts || parts.length < 2) return segment;
      const quote = parts[0][0];
      const merged = parts.map(unquoteLiteral).join('');
      const escaped = merged.replace(new RegExp(`\\\\|${quote}`, 'g'), (ch) => `\\${ch}`);
      return `${quote}${escaped}${quote}`;
    });
    if (next === text) break;
    text = next;
  }
  return text;
}

function mergeStringLiteralArrayJoins(source = '') {
  let text = String(source);
  for (let pass = 0; pass < 32; pass++) {
    const next = text.replace(STRING_LITERAL_ARRAY_JOIN_RE, (segment, arrayBody) => {
      const literals = arrayBody.match(STRING_LITERAL_RE);
      if (!literals || literals.length < 2) return segment;
      const sepMatch = segment.match(/\.join\s*\(\s*((['"])(?:\\.|(?!\2)[^\\])*\2)\s*\)$/);
      if (!sepMatch) return segment;
      const sep = unquoteLiteral(sepMatch[1]);
      const quote = literals[0][0];
      const merged = literals.map(unquoteLiteral).join(sep);
      const escaped = merged.replace(new RegExp(`\\\\|${quote}`, 'g'), (ch) => `\\${ch}`);
      return `${quote}${escaped}${quote}`;
    });
    if (next === text) break;
    text = next;
  }
  return text;
}

function normalizeSourceForLegacyLabelScan(source = '') {
  let text = String(source);
  for (let pass = 0; pass < 32; pass++) {
    const next = mergeStringLiteralArrayJoins(mergeAdjacentStringLiterals(text));
    if (next === text) break;
    text = next;
  }
  return text;
}

function walkMjsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walkMjsFiles(path, out);
      continue;
    }
    if (name.endsWith('.mjs')) out.push(path);
  }
  return out;
}

function legacyLabelScanFiles() {
  const files = walkMjsFiles(VACATION_SRC_ROOT);
  if (existsSync(BUDGET_UNIT_TEST)) files.push(BUDGET_UNIT_TEST);
  return files;
}

function relativeScanPath(absPath) {
  const rel = absPath.startsWith(REPO_ROOT) ? absPath.slice(REPO_ROOT.length + 1) : absPath;
  return rel.replace(/\\/g, '/');
}

function assertBudgetLegacyLabelSourceScanProbes(legacyLabel) {
  const label = String(legacyLabel ?? '').trim();
  assert.ok(label, 'legacy label probes require upstream misc bucket label');
  const spaceIdx = label.indexOf(' ');
  assert.ok(spaceIdx > 0, 'legacy label probes require a spaced upstream misc bucket label');
  const left = label.slice(0, spaceIdx);
  const right = label.slice(spaceIdx + 1);
  const esc = (part) => part.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const concatProbe = normalizeSourceForLegacyLabelScan(`'${esc(left)}' + ' ${esc(right)}'`);
  assert.equal(
    concatProbe.includes(label),
    true,
    'legacy label scan must detect adjacent string-literal concat reconstructions',
  );

  const joinProbe = normalizeSourceForLegacyLabelScan(`['${esc(left)}', '${esc(right)}'].join(' ')`);
  assert.equal(
    joinProbe.includes(label),
    true,
    'legacy label scan must detect string-literal array.join reconstructions',
  );

  const dataDerivedProbe = normalizeSourceForLegacyLabelScan(
    'const key = `overall:${upstreamMiscBucketLabel}`;',
  );
  assert.equal(
    dataDerivedProbe.includes(label),
    false,
    'legacy label scan must not treat upstream-derived template keys as literal reconstruction',
  );
}

export function findLegacyMiscBucketLabelInVacationSource(legacyLabel, options = {}) {
  const label = String(legacyLabel ?? '').trim();
  if (options.assertScanProbes) assertBudgetLegacyLabelSourceScanProbes(label);
  if (!label) return [];
  const hits = [];
  for (const file of legacyLabelScanFiles()) {
    const raw = readFileSync(file, 'utf8');
    const normalized = normalizeSourceForLegacyLabelScan(raw);
    if (normalized.includes(label)) {
      hits.push(relativeScanPath(file));
    }
  }
  return hits;
}
