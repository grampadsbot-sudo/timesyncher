import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_NOTE, SHARE_TOKEN_SHA256, baselineRemoteRef, bundleLeakFindings, classify, contentIdentity, crossOriginBundleFindings, explainSharedBundle, htmlRefsProducedByBuild, scanRoots, scanText, whitespacePadFindings } from './check-hardcoded-content.mjs';
import { INVENTORY_PATTERNS, UNMATCHED } from './hardcoded-inventory-patterns.mjs';

const script = fileURLToPath(new URL('./check-hardcoded-content.mjs', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/hardcoded-content/', import.meta.url));
const NOTE = 'removed by Search Eng / Reply Eng deletion PR';

function readFixture(name) {
  return fs.readFileSync(path.join(fixtures, name), 'utf8');
}

function symbols(file, text) {
  return scanText(file, text).map((finding) => [finding.rule, finding.symbol_or_pattern]);
}

function entry(file, symbol, rule) {
  return { file, rule, symbol_or_pattern: symbol, inventory_id: 'A0', note: NOTE };
}

function identities(text) {
  const rows = [];
  for (const line of String(text || '').split('\n')) {
    const match = line.match(/^(REPORT|FAIL)\t([^\t]+)\t(.*):(\d+)\t(.*)$/);
    if (!match) continue;
    rows.push({
      kind: match[1],
      rule: match[2],
      file: match[3],
      line: Number(match[4]),
      symbol: match[5],
    });
  }
  return rows;
}

function assertHit(text, kind, rule, file, symbol) {
  const expected = contentIdentity({ rule, file, symbol });
  const found = identities(text).some((row) => row.kind === kind && contentIdentity(row) === expected);
  assert.equal(found, true, `${kind}\t${rule}\t${file}\t${symbol}\n${text}`);
}

const placeFile = 'src/vacation/place-list.mjs';
const placeText = readFixture('place-list.mjs');
assert.deepEqual(symbols(placeFile, placeText), [['HC-PLACE-LIST', 'EXTRA_LIST_FILL']]);
assert.equal(classify(scanText(placeFile, placeText), []).fail.length, 1);
assert.equal(classify(scanText(placeFile, placeText), []).report.length, 0);
const placeClosed = classify(scanText(placeFile, placeText), [entry(placeFile, 'EXTRA_LIST_FILL', 'HC-PLACE-LIST')]);
assert.equal(classify(scanText(placeFile, placeText), [entry(placeFile, 'EXTRA_LIST_FILL', 'HC-DIALOG')]).fail.length, 1);
assert.equal(placeClosed.fail.length, 0);
assert.deepEqual(placeClosed.report.map((finding) => finding.symbol_or_pattern), ['EXTRA_LIST_FILL']);

const coordFile = 'src/vacation/coords.mjs';
const coordText = readFixture('coords.mjs');
assert.deepEqual(symbols(coordFile, coordText), [
  ['HC-COORD', '{lat:21.111,lng:-157.222}'],
  ['HC-COORD', '[21.111,-157.222]'],
]);
assert.equal(classify(scanText(coordFile, coordText), []).fail.length, 2);
const coordClosed = classify(scanText(coordFile, coordText), [
  entry(coordFile, '{lat:21.111,lng:-157.222}', 'HC-COORD'),
  entry(coordFile, '[21.111,-157.222]', 'HC-COORD'),
]);
assert.equal(coordClosed.fail.length, 0);
assert.equal(coordClosed.report.length, 2);

const thingFile = 'src/vacation/thing.mjs';
const thingText = readFixture('thing.mjs');
assert.deepEqual(symbols(thingFile, thingText), [["HC-THING", "category_name:'Car',name:'Aloha Shuttle'"]]);
assert.equal(classify(scanText(thingFile, thingText), []).fail.length, 1);
assert.equal(classify(scanText(thingFile, thingText), [entry(thingFile, "category_name:'Car',name:'Aloha Shuttle'", 'HC-THING')]).fail.length, 0);

const dialogFile = 'src/vacation/dialog.mjs';
const dialogText = readFixture('dialog.mjs');
assert.deepEqual(symbols(dialogFile, dialogText), [
  ['HC-DIALOG', 'ONBOARDING_OPENER_NEW'],
  ['HC-DIALOG', 'Welcome aboard'],
  ['HC-DIALOG', 'Include these sentences'],
  ['HC-DIALOG', 'must say'],
]);
assert.equal(classify(scanText(dialogFile, dialogText), []).fail.length, 4);
const dialogClosed = classify(scanText(dialogFile, dialogText), [
  entry(dialogFile, 'ONBOARDING_OPENER_NEW', 'HC-DIALOG'),
  entry(dialogFile, 'Welcome aboard', 'HC-DIALOG'),
  entry(dialogFile, 'Include these sentences', 'HC-DIALOG'),
  entry(dialogFile, 'must say', 'HC-DIALOG'),
]);
assert.equal(dialogClosed.fail.length, 0);
assert.equal(dialogClosed.report.length, 4);

const tokenShapes = [
  ['tokens/bearer.txt', 'evidence/bearer.txt', 'Bearer'],
  ['tokens/sk-hyphen.txt', 'evidence/sk-hyphen.txt', 'sk-'],
  ['tokens/sk-live.txt', 'evidence/sk-live.txt', 'sk_live_'],
  ['tokens/pk-live.txt', 'evidence/pk-live.txt', 'pk_live_'],
  ['tokens/pk-test.txt', 'evidence/pk-test.txt', 'pk_test_'],
  ['tokens/ghp.txt', 'evidence/ghp.txt', 'ghp_'],
  ['tokens/gho.txt', 'evidence/gho.txt', 'gho_'],
  ['tokens/github-pat.txt', 'evidence/github-pat.txt', 'github_pat_'],
  ['tokens/slack.txt', 'evidence/slack.txt', 'xox'],
  ['tokens/jwt.txt', 'evidence/jwt.txt', 'jwt'],
  ['tokens/session.txt', 'evidence/session.txt', 'sessionToken'],
  ['tokens/hex.txt', 'evidence/hex.txt', 'hex-secret'],
  ['tokens/base64.txt', 'evidence/base64.txt', 'base64-secret'],
];
for (const [fixture, file, symbol] of tokenShapes) {
  const findings = scanText(file, readFixture(fixture));
  assert.deepEqual(findings.map((finding) => [finding.rule, finding.symbol_or_pattern]), [['TOKEN-EVIDENCE', symbol]]);
  const silenced = classify(findings, [entry(file, symbol, 'TOKEN-EVIDENCE')]);
  assert.equal(silenced.report.length, 0);
  assert.equal(silenced.fail.length, 1);
}
assert.deepEqual(symbols('evidence/clean.txt', readFixture('tokens/clean.txt')), []);

function runGuard(cwd, env = {}) {
  return spawnSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, BASE: '', GITHUB_BASE_REF: '', ...env },
  });
}

function writeTree(dir, files, baseline) {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
  const baselinePath = path.join(dir, 'scripts/hardcoded-content-baseline.json');
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
}

const openDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-open-'));
writeTree(openDir, {
  'src/vacation/place-list.mjs': placeText,
  'src/vacation/coords.mjs': coordText,
  'src/vacation/thing.mjs': thingText,
  'src/vacation/dialog.mjs': dialogText,
  'evidence/bearer.txt': readFixture('tokens/bearer.txt'),
}, []);
const openRun = runGuard(openDir);
assert.equal(openRun.status, 1, openRun.stdout);
assertHit(openRun.stderr, 'FAIL', 'HC-PLACE-LIST', placeFile, 'EXTRA_LIST_FILL');
assertHit(openRun.stderr, 'FAIL', 'HC-COORD', coordFile, '{lat:21.111,lng:-157.222}');
assertHit(openRun.stderr, 'FAIL', 'HC-COORD', coordFile, '[21.111,-157.222]');
assertHit(openRun.stderr, 'FAIL', 'HC-THING', thingFile, "category_name:'Car',name:'Aloha Shuttle'");
assertHit(openRun.stderr, 'FAIL', 'HC-DIALOG', dialogFile, 'ONBOARDING_OPENER_NEW');
assertHit(openRun.stderr, 'FAIL', 'HC-DIALOG', dialogFile, 'Welcome aboard');
assertHit(openRun.stderr, 'FAIL', 'HC-DIALOG', dialogFile, 'Include these sentences');
assertHit(openRun.stderr, 'FAIL', 'HC-DIALOG', dialogFile, 'must say');
assertHit(openRun.stderr, 'FAIL', 'TOKEN-EVIDENCE', 'evidence/bearer.txt', 'Bearer');

const closedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-closed-'));
writeTree(closedDir, {
  'src/vacation/place-list.mjs': placeText,
  'src/vacation/coords.mjs': coordText,
  'src/vacation/thing.mjs': thingText,
  'src/vacation/dialog.mjs': dialogText,
}, [
  entry(placeFile, 'EXTRA_LIST_FILL', 'HC-PLACE-LIST'),
  entry(coordFile, '{lat:21.111,lng:-157.222}', 'HC-COORD'),
  entry(coordFile, '[21.111,-157.222]', 'HC-COORD'),
  entry(thingFile, "category_name:'Car',name:'Aloha Shuttle'", 'HC-THING'),
  entry(dialogFile, 'ONBOARDING_OPENER_NEW', 'HC-DIALOG'),
  entry(dialogFile, 'Welcome aboard', 'HC-DIALOG'),
  entry(dialogFile, 'Include these sentences', 'HC-DIALOG'),
  entry(dialogFile, 'must say', 'HC-DIALOG'),
]);
const closedRun = runGuard(closedDir);
assert.equal(closedRun.status, 0, closedRun.stderr);
assertHit(closedRun.stdout, 'REPORT', 'HC-PLACE-LIST', placeFile, 'EXTRA_LIST_FILL');
assertHit(closedRun.stdout, 'REPORT', 'HC-COORD', coordFile, '{lat:21.111,lng:-157.222}');
assertHit(closedRun.stdout, 'REPORT', 'HC-THING', thingFile, "category_name:'Car',name:'Aloha Shuttle'");
assertHit(closedRun.stdout, 'REPORT', 'HC-DIALOG', dialogFile, 'must say');
assert.match(closedRun.stdout, /hardcoded content check passed \(8 report, 0 fail\)/);
assert.equal(closedRun.stderr, '');

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}`);
}

function repoWithBase(baseWritten) {
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-origin-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-work-'));
  git(origin, ['init', '--bare']);
  git(work, ['init', '-b', 'base']);
  git(work, ['remote', 'add', 'origin', origin]);
  fs.mkdirSync(path.join(work, 'scripts'), { recursive: true });
  if (baseWritten != null) {
    fs.writeFileSync(path.join(work, 'scripts/hardcoded-content-baseline.json'), `${JSON.stringify(baseWritten)}\n`);
  } else {
    fs.writeFileSync(path.join(work, 'scripts/keep.txt'), 'base\n');
  }
  git(work, ['add', '.']);
  git(work, ['commit', '-m', 'base']);
  git(work, ['push', '-u', 'origin', 'base']);
  return work;
}

const grown = repoWithBase([]);
fs.writeFileSync(path.join(grown, 'scripts/hardcoded-content-baseline.json'), `${JSON.stringify([entry('src/vacation/place-list.mjs', 'EXTRA_LIST_FILL', 'HC-PLACE-LIST')])}\n`);
const grownRun = runGuard(grown, { BASE: 'base' });
assert.equal(grownRun.status, 1, grownRun.stdout);
assertHit(grownRun.stderr, 'FAIL', 'BASELINE-GROWTH', 'scripts/hardcoded-content-baseline.json', '1>0');

const same = repoWithBase([entry('src/vacation/place-list.mjs', 'EXTRA_LIST_FILL', 'HC-PLACE-LIST')]);
const sameRun = runGuard(same, { BASE: 'base' });
assert.equal(sameRun.status, 0, sameRun.stderr);
assert.match(sameRun.stdout, /hardcoded content check passed \(0 report, 0 fail\)/);

const seeded = repoWithBase(null);
fs.mkdirSync(path.join(seeded, 'scripts'), { recursive: true });
fs.writeFileSync(path.join(seeded, 'scripts/hardcoded-content-baseline.json'), `${JSON.stringify([entry('src/vacation/place-list.mjs', 'EXTRA_LIST_FILL', 'HC-PLACE-LIST')])}\n`);
const seededRun = runGuard(seeded, { BASE: 'base' });
assert.equal(seededRun.status, 0, seededRun.stderr);
assert.match(seededRun.stdout, /hardcoded content check passed \(0 report, 0 fail\)/);

const missingRef = repoWithBase([]);
const missingRefRun = runGuard(missingRef, { BASE: 'missing-ref' });
assert.equal(missingRefRun.status, 1);
assert.match(missingRefRun.stderr, /FAIL\tBASELINE-GROWTH/);

assert.equal(baselineRemoteRef('main'), 'origin/main');
assert.equal(baselineRemoteRef('origin/main'), 'origin/main');
assert.equal(baselineRemoteRef('cursor/x'), 'origin/cursor/x');
const prefixed = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-prefix-origin-'));
const prefixedWork = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-prefix-work-'));
git(prefixed, ['init', '--bare']);
git(prefixedWork, ['init', '-b', 'main']);
git(prefixedWork, ['remote', 'add', 'origin', prefixed]);
fs.mkdirSync(path.join(prefixedWork, 'scripts'), { recursive: true });
const prefixRow = entry('src/vacation/place-list.mjs', 'EXTRA_LIST_FILL', 'HC-PLACE-LIST');
fs.writeFileSync(path.join(prefixedWork, 'scripts/hardcoded-content-baseline.json'), '[]\n');
git(prefixedWork, ['add', '.']);
git(prefixedWork, ['commit', '-m', 'empty baseline']);
git(prefixedWork, ['push', '-u', 'origin', 'main']);
fs.writeFileSync(path.join(prefixedWork, 'scripts/hardcoded-content-baseline.json'), `${JSON.stringify([prefixRow])}\n`);
git(prefixedWork, ['add', '.']);
git(prefixedWork, ['commit', '-m', 'one old-rule row']);
git(prefixedWork, ['push', 'origin', 'HEAD:cursor/x']);
for (const base of ['main', 'origin/main']) {
  const prefixRun = runGuard(prefixedWork, { BASE: base });
  assert.equal(prefixRun.status, 1, `${base}\n${prefixRun.stdout}\n${prefixRun.stderr}`);
  assertHit(prefixRun.stderr, 'FAIL', 'BASELINE-GROWTH', 'scripts/hardcoded-content-baseline.json', '1>0');
}
const prefixedSame = runGuard(prefixedWork, { BASE: 'cursor/x' });
assert.equal(prefixedSame.status, 0, prefixedSame.stderr);
assert.match(prefixedSame.stdout, /hardcoded content check passed \(0 report, 0 fail\)/);

const workflow = fs.readFileSync(path.join(repo, '.github/workflows/evidence-secrets.yml'), 'utf8');
assert.match(workflow, /check-hardcoded-content\.mjs/);
assert.match(workflow, /test_check_hardcoded_content\.mjs/);

const baseline = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/hardcoded-content-baseline.json'), 'utf8'));
assert.equal(baseline.length > 0, true);
for (const row of baseline) assert.equal(row.note, BASELINE_NOTE);

const repoRun = runGuard(repo);
assert.equal(repoRun.status, 0, `${repoRun.stdout}\n${repoRun.stderr}`);
const liveSummary = `${repoRun.stdout}\n${repoRun.stderr}`.match(/hardcoded content check passed \((\d+) report, (\d+) fail\)/);
assert.ok(liveSummary, `${repoRun.stdout}\n${repoRun.stderr}`);
const liveReport = Number(liveSummary[1]);
const liveFail = Number(liveSummary[2]);
const failRows = identities(repoRun.stderr);
assert.equal(failRows.length, liveFail);
// The travel download is gone and the served bundle is stripped. A live
// NO-CROSS-ORIGIN-BUNDLE, BUNDLE-LEAK, or EVASION hit still fails the run.
assert.deepEqual(failRows.filter((row) => row.rule === 'NO-CROSS-ORIGIN-BUNDLE'), []);
for (const row of failRows) assert.equal(row.rule === 'NO-CROSS-ORIGIN-BUNDLE' || row.rule === 'BUNDLE-LEAK' || row.rule === 'EVASION', true, row.rule);
assert.equal(failRows.some((row) => row.file === 'shared-app.html'), false);
assert.equal(baseline.some((row) => row.rule === 'NO-CROSS-ORIGIN-BUNDLE' || row.inventory_id === 'NO-CROSS-ORIGIN-BUNDLE'), false);
assert.equal(baseline.some((row) => row.rule === 'BUNDLE-LEAK' || row.inventory_id === 'BUNDLE-LEAK'), false);
for (const row of failRows) {
  for (const match of row.symbol.matchAll(/(?<![A-Za-z0-9])[A-Za-z0-9]{32}(?![A-Za-z0-9])/g)) {
    assert.notEqual(createHash('sha256').update(match[0]).digest('hex'), SHARE_TOKEN_SHA256);
  }
}
assert.equal(liveReport <= baseline.length, true);
const judged = classify(scanRoots(repo), baseline);
assert.equal(judged.fail.length, liveFail);
assert.equal(judged.report.length, liveReport);
assert.ok(judged.fail.every((finding) => finding.rule === 'NO-CROSS-ORIGIN-BUNDLE' || finding.rule === 'BUNDLE-LEAK' || finding.rule === 'EVASION'));
const liveRows = identities(repoRun.stdout);
assert.deepEqual(
  liveRows.map(contentIdentity).sort(),
  judged.report.map(contentIdentity).sort(),
);
for (const row of liveRows) {
  assert.equal(baseline.some((entry) => contentIdentity(entry) === contentIdentity(row)), true, contentIdentity(row));
}
assert.doesNotMatch(repoRun.stdout, /inventory:E4/);
assert.doesNotMatch(repoRun.stderr, /inventory:E4/);

const inventory = JSON.parse(fs.readFileSync(path.join(fixtures, 'inventory.json'), 'utf8'));
const inventoryIds = inventory.items.map((item) => item.id);
assert.equal(inventoryIds.length, 79);
assert.equal(new Set(inventoryIds).size, 79);
const patternIds = new Set(INVENTORY_PATTERNS.map((pattern) => pattern.id));
const unmatchedIds = Object.keys(UNMATCHED);
for (const id of unmatchedIds) {
  assert.equal(typeof UNMATCHED[id], 'string');
  assert.equal(UNMATCHED[id].length > 0, true);
  assert.equal(patternIds.has(id), false);
  assert.equal(baseline.some((row) => row.inventory_id === id), false);
}
let covered = 0;
const openFiles = {};
for (const id of inventoryIds) {
  const baselined = baseline.some((row) => row.inventory_id === id);
  const fixturePath = path.join(fixtures, 'by-id', `${id}.txt`);
  const fixtureExists = fs.existsSync(fixturePath);
  if (unmatchedIds.includes(id)) {
    assert.equal(baselined, false, id);
    assert.equal(fixtureExists, false, id);
    continue;
  }
  const liveInventory = [...liveRows, ...failRows].some((row) => row.symbol === `inventory:${id}`);
  if (liveInventory) assert.equal(baselined, true, id);
  assert.equal(fixtureExists, true, id);
  assert.equal(patternIds.has(id), true, id);
  const pattern = INVENTORY_PATTERNS.find((item) => item.id === id);
  const file = `src/vacation/new-${id}.mjs`;
  const text = fs.readFileSync(fixturePath, 'utf8');
  const findings = scanText(file, text);
  const siblings = findings.filter((finding) => finding.symbol_or_pattern !== `inventory:${id}`);
  const opened = classify(findings, siblings.map((finding) => entry(file, finding.symbol_or_pattern, finding.rule)));
  assert.deepEqual(opened.fail.map((finding) => [finding.rule, finding.symbol_or_pattern]), [[pattern.rule, `inventory:${id}`]]);
  assert.equal(opened.report.length, siblings.length);
  openFiles[file] = text;
  covered += 1;
}
assert.equal(covered, 78);
assert.equal(covered + unmatchedIds.length, inventoryIds.length);
assert.deepEqual([...patternIds].sort(), inventoryIds.filter((id) => !unmatchedIds.includes(id)).sort());

const inventoryOpen = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-inventory-'));
writeTree(inventoryOpen, openFiles, []);
const inventoryOpenRun = runGuard(inventoryOpen);
assert.equal(inventoryOpenRun.status, 1, inventoryOpenRun.stdout);
for (const id of inventoryIds) {
  if (unmatchedIds.includes(id)) continue;
  const pattern = INVENTORY_PATTERNS.find((item) => item.id === id);
  assertHit(inventoryOpenRun.stderr, 'FAIL', pattern.rule, `src/vacation/new-${id}.mjs`, `inventory:${id}`);
}

const thingSourceFile = 'src/vacation/thing-source.mjs';
const thingSourceText = readFixture('thing-source.mjs');
const thingSourceHits = scanText(thingSourceFile, thingSourceText).filter((finding) => finding.rule === 'THING-SOURCE');
assert.deepEqual(thingSourceHits.map((finding) => finding.symbol_or_pattern), ['thing-without-source:New Pier']);
assert.equal(classify(scanText(thingSourceFile, thingSourceText), []).fail.some((finding) => finding.rule === 'THING-SOURCE'), true);
assert.equal(scanText('src/vacation/sourced.mjs', "places.push({ name: 'New Pier', category_name: 'Attraction', source: 'live' });").some((finding) => finding.rule === 'THING-SOURCE'), false);

const googleFile = 'src/vacation/google-places.mjs';
const googleText = readFixture('google-places.mjs');
const modelFile = 'src/vacation/model-allowlist.mjs';
const modelText = readFixture('model-allowlist.mjs');

const cannedFile = 'src/vacation/canned-fallback.mjs';
const cannedText = readFixture('canned-fallback.mjs');
const cannedHits = scanText(cannedFile, cannedText).filter((finding) => finding.rule === 'NO-CANNED-FALLBACK');
assert.deepEqual(cannedHits.map((finding) => finding.symbol_or_pattern).sort(), ['KEEPSAKE_LIST_FILL', 'Welcome aboard']);
assert.equal(classify(cannedHits, []).fail.length, 2);
assert.equal(scanText('src/vacation/empty-fallback.mjs', 'try { load(); } catch (error) { throw error; }\nif (!results) return [];').some((finding) => finding.rule === 'NO-CANNED-FALLBACK'), false);

const ruleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-rules-'));
writeTree(ruleDir, {
  'src/vacation/thing-source.mjs': thingSourceText,
  'src/vacation/google-places.mjs': googleText,
  'src/vacation/model-allowlist.mjs': modelText,
  'src/vacation/canned-fallback.mjs': cannedText,
  'scripts/live_v7_dialog_pdf.py': readFixture('dialog-stamp.py'),
}, []);
for (let index = 0; index < 13; index += 1) {
  const abs = path.join(ruleDir, 'api', `fn${index}.mjs`);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, 'export default function handler() {}\n');
}
const ruleRun = runGuard(ruleDir);
assert.equal(ruleRun.status, 1, ruleRun.stdout);
assert.deepEqual(identities(ruleRun.stderr).filter((row) => row.rule === 'NO-GOOGLE-PLACES').map((row) => row.symbol).sort(), [
  'GOOGLE_PLACES_API_KEY',
  'PLACES_API_KEY',
  'PlacesClient',
  '@googlemaps/places',
  'google.maps.places',
  'maps.googleapis.com/place',
].sort());
assertHit(ruleRun.stderr, 'FAIL', 'THING-SOURCE', thingSourceFile, 'thing-without-source:New Pier');
assertHit(ruleRun.stderr, 'FAIL', 'NO-GOOGLE-PLACES', googleFile, 'GOOGLE_PLACES_API_KEY');
assertHit(ruleRun.stderr, 'FAIL', 'MODEL-ALLOWLIST', modelFile, 'gpt-4o-mini');
assertHit(ruleRun.stderr, 'FAIL', 'MODEL-ALLOWLIST', modelFile, 'openai/gpt-4.1');
assertHit(ruleRun.stderr, 'FAIL', 'NO-CANNED-FALLBACK', cannedFile, 'KEEPSAKE_LIST_FILL');
assertHit(ruleRun.stderr, 'FAIL', 'BUILD-STAMP', 'scripts/live_v7_dialog_pdf.py', 'empty-stamp');
assertHit(ruleRun.stderr, 'FAIL', 'API-FN-CAP', 'api', '13>12');
fs.writeFileSync(path.join(ruleDir, 'scripts/hardcoded-content-baseline.json'), `${JSON.stringify([
  entry(googleFile, 'GOOGLE_PLACES_API_KEY', 'NO-GOOGLE-PLACES'),
  entry(modelFile, 'gpt-4o-mini', 'MODEL-ALLOWLIST'),
  entry(modelFile, 'openai/gpt-4.1', 'MODEL-ALLOWLIST'),
  entry('api', '13>12', 'API-FN-CAP'),
], null, 2)}\n`);
const stillFail = runGuard(ruleDir);
assertHit(stillFail.stderr, 'FAIL', 'NO-GOOGLE-PLACES', googleFile, 'GOOGLE_PLACES_API_KEY');
assertHit(stillFail.stderr, 'FAIL', 'API-FN-CAP', 'api', '13>12');
assertHit(stillFail.stdout, 'REPORT', 'MODEL-ALLOWLIST', modelFile, 'gpt-4o-mini');
assertHit(stillFail.stdout, 'REPORT', 'MODEL-ALLOWLIST', modelFile, 'openai/gpt-4.1');
assert.doesNotMatch(`${stillFail.stdout}\n${stillFail.stderr}`, /typesafe\/jev-1\.13/);

const underCap = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-api-'));
writeTree(underCap, {
  'scripts/live_v7_dialog_pdf.py': 'def build(pack):\n    banner = str(pack.get("deploy_banner") or "").strip()\n    if not banner:\n        raise SystemExit("refused: dialog stamp is empty")\n',
  'scripts/screenshot_journey_pdf.py': 'def build(manifest):\n    banner = str(manifest.get("deployBanner") or "").strip()\n    if not banner:\n        raise SystemExit("refused: journey stamp is empty")\n',
}, []);
for (let index = 0; index < 12; index += 1) {
  const abs = path.join(underCap, 'api', `fn${index}.mjs`);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, 'export default function handler() {}\n');
}
const underRun = runGuard(underCap);
assert.equal(underRun.status, 0, underRun.stderr);
assert.doesNotMatch(underRun.stdout, /API-FN-CAP/);
assert.doesNotMatch(underRun.stdout, /BUILD-STAMP/);

const shiftSource = 'src/vacation/thing-logo-capture.mjs';
const shiftOriginal = fs.readFileSync(path.join(repo, shiftSource), 'utf8');
const originalHits = scanText(shiftSource, shiftOriginal);
const shiftBaseline = baseline.filter((row) => row.file === shiftSource);
assert.equal(shiftBaseline.length >= 2, true);
const removed = shiftBaseline.find((row) => row.rule === 'HC-PLACE-LIST' && row.symbol_or_pattern === 'BRAND_LOGOS');
assert.ok(removed);
const keptHit = originalHits.find((finding) => contentIdentity(finding) !== contentIdentity(removed) && shiftOriginal.includes(finding.symbol_or_pattern));
assert.ok(keptHit);
const shifted = `${'// line shift\n'.repeat(6)}${shiftOriginal.split(removed.symbol_or_pattern).join('forecastSentence')}`;
assert.equal(shifted.includes(removed.symbol_or_pattern), false);
const shiftDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-shift-'));
writeTree(shiftDir, { [shiftSource]: shifted }, shiftBaseline);
const shiftRun = runGuard(shiftDir);
assert.equal(shiftRun.status, 0, shiftRun.stderr);
const shiftSummary = shiftRun.stdout.match(/hardcoded content check passed \((\d+) report, (\d+) fail\)/);
assert.ok(shiftSummary, shiftRun.stdout);
assert.equal(Number(shiftSummary[2]), 0);
assert.equal(Number(shiftSummary[1]) < shiftBaseline.length, true);
const shiftRows = identities(shiftRun.stdout);
assert.equal(shiftRows.some((row) => contentIdentity(row) === contentIdentity(removed)), false);
const keptRow = shiftRows.find((row) => contentIdentity(row) === contentIdentity(keptHit));
assert.ok(keptRow, shiftRun.stdout);
assert.notEqual(keptRow.line, keptHit.line);
for (const row of shiftRows) {
  assert.equal(row.kind, 'REPORT');
  assert.equal(shiftBaseline.some((entry) => contentIdentity(entry) === contentIdentity(row)), true, contentIdentity(row));
}
writeTree(shiftDir, { [shiftSource]: `${shifted}\nconst EXTRA_LIST_FILL = ['Added Venue'];\n` }, shiftBaseline);
const addedRun = runGuard(shiftDir);
assert.equal(addedRun.status, 1, addedRun.stdout);
assertHit(addedRun.stderr, 'FAIL', 'HC-PLACE-LIST', shiftSource, 'EXTRA_LIST_FILL');

function fails(file, fixture) {
  return classify(scanText(file, readFixture(fixture)), []).fail;
}

const joinFail = fails('src/vacation/evasion-join.mjs', 'evasion-join.mjs');
assert.deepEqual(joinFail.map((finding) => [finding.rule, finding.symbol_or_pattern]), [['EVASION', 'Price TBD']]);
const splitFail = fails('src/vacation/evasion-split.mjs', 'evasion-split.mjs');
assert.deepEqual(splitFail.map((finding) => [finding.rule, finding.symbol_or_pattern]), [['EVASION', 'Price TBD']]);
const concatFail = fails('src/vacation/evasion-concat.mjs', 'evasion-concat.mjs');
assert.deepEqual(concatFail.map((finding) => [finding.rule, finding.symbol_or_pattern]), [['EVASION', 'Price TBD']]);
const logoFail = fails('src/vacation/evasion-logo.mjs', 'evasion-logo.mjs');
assert.deepEqual(logoFail.map((finding) => [finding.rule, finding.symbol_or_pattern]), [['EVASION', '/ts-thing-logos/']]);

const renamed = scanText('src/vacation/content-rename.mjs', readFixture('content-rename.mjs'));
assert.equal(renamed.some((finding) => finding.symbol_or_pattern === 'RANGE_END' || finding.symbol_or_pattern === 'inventory:B12'), false);
assert.deepEqual(classify(renamed, []).fail.map((finding) => [finding.rule, finding.symbol_or_pattern]), [
  ['CONTENT-MATCH', 'say the swim is saved on the second Friday of the trip'],
  ['CONTENT-MATCH', 'second Friday'],
  ['DATE-LITERAL', 'second Friday'],
  ['DATE-LITERAL', 'apr(?:il)?'],
]);

const named = fails('src/vacation/prompt-names.mjs', 'prompt-names.mjs');
assert.deepEqual(named.map((finding) => finding.symbol_or_pattern), ['Craig', 'Kimberly', 'Tyler', 'Lauren', 'Marcus']);
assert.equal(named.every((finding) => finding.rule === 'PROMPT-NAMES'), true);

const priced = fails('src/vacation/checkout-pricing.mjs', 'hardcoded-price.mjs');
assert.deepEqual(priced.map((finding) => [finding.rule, finding.symbol_or_pattern]), [['HARDCODED-PRICE', 'DEFAULT_ORDER_BUMP_PRICE_CENTS=2700']]);

const addressed = fails('index.html', 'fixed-address.html').filter((finding) => finding.rule === 'FIXED-ADDRESS');
assert.deepEqual(addressed.map((finding) => finding.symbol_or_pattern), ['state=NV', 'zip=89101', 'city=Las Vegas']);

const bundled = fails('public/assets/bundle-scan.js', 'bundle-scan.js').filter((finding) => finding.rule === 'BUNDLE-SCAN');
assert.deepEqual(bundled.map((finding) => finding.symbol_or_pattern), ['Price TBD']);

const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-bare-'));
writeTree(bareDir, { 'src/vacation/model-bare.mjs': readFixture('model-bare.mjs') }, []);
const bareRun = runGuard(bareDir);
assert.equal(bareRun.status, 1, bareRun.stdout);
for (const id of ['grok-4', 'grok-3-mini', 'gpt-4o', 'claude-3-5-sonnet', 'gemini-2.0-flash']) {
  assert.match(bareRun.stderr, new RegExp(`FAIL\\tMODEL-BARE\\tsrc/vacation/model-bare\\.mjs:\\d+\\t${id}`));
}
assert.doesNotMatch(`${bareRun.stdout}\n${bareRun.stderr}`, /gemini-2\.5-flash-lite/);
assert.doesNotMatch(`${bareRun.stdout}\n${bareRun.stderr}`, /qwen3-235b-a22b-2507/);
assert.doesNotMatch(`${bareRun.stdout}\n${bareRun.stderr}`, /deepseek-v3\.2/);
assert.doesNotMatch(`${bareRun.stdout}\n${bareRun.stderr}`, /qwen3-max/);

const newRuleBase = [entry('src/vacation/kept.mjs', 'KEEP', 'HC-PLACE-LIST')];
const allowedGrowth = repoWithBase(newRuleBase);
writeTree(allowedGrowth, {
  'src/vacation/names.mjs': readFixture('prompt-names.mjs'),
}, [
  ...newRuleBase,
  { file: 'src/vacation/names.mjs', rule: 'PROMPT-NAMES', symbol_or_pattern: 'Craig', inventory_id: 'PROMPT-NAMES', note: NOTE },
  { file: 'src/vacation/names.mjs', rule: 'PROMPT-NAMES', symbol_or_pattern: 'Kimberly', inventory_id: 'PROMPT-NAMES', note: NOTE },
  { file: 'src/vacation/names.mjs', rule: 'PROMPT-NAMES', symbol_or_pattern: 'Tyler', inventory_id: 'PROMPT-NAMES', note: NOTE },
  { file: 'src/vacation/names.mjs', rule: 'PROMPT-NAMES', symbol_or_pattern: 'Lauren', inventory_id: 'PROMPT-NAMES', note: NOTE },
  { file: 'src/vacation/names.mjs', rule: 'PROMPT-NAMES', symbol_or_pattern: 'Marcus', inventory_id: 'PROMPT-NAMES', note: NOTE },
]);
const allowedRun = runGuard(allowedGrowth, { BASE: 'base' });
assert.equal(allowedRun.status, 0, allowedRun.stderr);

const oldRuleGrowth = repoWithBase(newRuleBase);
writeTree(oldRuleGrowth, {}, [...newRuleBase, entry('src/vacation/other.mjs', 'ALSO', 'HC-PLACE-LIST')]);
const oldRuleRun = runGuard(oldRuleGrowth, { BASE: 'base' });
assert.equal(oldRuleRun.status, 1, oldRuleRun.stdout);
assert.match(oldRuleRun.stderr, /FAIL\tBASELINE-GROWTH\tscripts\/hardcoded-content-baseline\.json:1\t2>1/);

const dateFile = 'src/vacation/date-range-rename.mjs';
const dateText = readFixture('date-range-rename.mjs');
const dateHits = scanText(dateFile, dateText).filter((finding) => finding.rule === 'DATE-LITERAL');
assert.deepEqual(dateHits.map((finding) => finding.symbol_or_pattern), [
  '2026-04-03',
  '2026-04-10',
  'April 10th',
  'Apr 10',
  'last Monday',
  'new Date(\'2026-04-10\')',
  'new Date(2026, 3, 10)',
  'Date.UTC(2026, 3, 10)',
  '{start:\'2026-04-03\',end:\'2026-04-10\'}',
]);
assert.equal(scanText(dateFile, dateText).some((finding) => finding.rule === 'CONTENT-MATCH' || finding.symbol_or_pattern === 'RANGE_END' || finding.symbol_or_pattern === 'inventory:B12'), false);
assert.deepEqual(
  scanText('src/vacation/ordinal.mjs', 'const when = "second Friday";').filter((finding) => finding.rule === 'DATE-LITERAL').map((finding) => finding.symbol_or_pattern),
  ['second Friday'],
);
const dateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-date-'));
writeTree(dateDir, { [dateFile]: dateText }, []);
const dateRun = runGuard(dateDir);
assert.equal(dateRun.status, 1, dateRun.stdout);
assertHit(dateRun.stderr, 'FAIL', 'DATE-LITERAL', dateFile, '{start:\'2026-04-03\',end:\'2026-04-10\'}');
assert.doesNotMatch(dateRun.stderr, /CONTENT-MATCH/);
assert.doesNotMatch(dateRun.stderr, /RANGE_END/);

const monthFile = 'src/vacation/date-month-regex.mjs';
const monthText = readFixture('date-month-regex.mjs');
const monthSymbols = [
  'April 10',
  'apr(?:il)?',
  'april',
  'sep(?:t(?:ember)?)?',
  'sep(?:t|tember)?',
  '(jan|feb)uary',
];
const monthHits = scanText(monthFile, monthText).filter((finding) => finding.rule === 'DATE-LITERAL');
assert.deepEqual(monthHits.map((finding) => finding.symbol_or_pattern), monthSymbols);
assert.equal(scanText(monthFile, monthText).some((finding) => finding.rule !== 'DATE-LITERAL'), false);
assert.deepEqual(
  scanText('src/vacation/month-prose.mjs', "const note = 'april showers';").filter((finding) => finding.rule === 'DATE-LITERAL'),
  [],
);
const monthDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-month-'));
writeTree(monthDir, { [monthFile]: monthText }, []);
const monthRun = runGuard(monthDir);
assert.equal(monthRun.status, 1, monthRun.stdout);
for (const symbol of monthSymbols) assertHit(monthRun.stderr, 'FAIL', 'DATE-LITERAL', monthFile, symbol);
assert.doesNotMatch(monthRun.stderr, /maybe|display|marching|april showers|aprilCount/);

const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-bundle-'));
const bundleSymbol = '/assets/index-BKun7ofk.js is not in the repo and the build does not produce it';
writeTree(bundleDir, {
  'shared-app.html': '<script>trek.src = \'/assets/index-BKun7ofk.js\';</script>\n',
  'extra.html': '<script src="/assets/other-bundle.js"></script>\n<link rel="modulepreload" href="/assets/preload.js">\n<script type="module">import(\'/assets/imported.js\');</script>\n<script src="https://js.stripe.com/v3/"></script>\n',
  'src/onboarding/eula-page.mjs': 'export const page = true;\n',
  'kept.html': '<script type="module" src="/src/onboarding/eula-page.mjs"></script>\n<script src="/assets/kept.js"></script>\n',
  'public/assets/kept.js': 'console.log("kept");\n',
}, [{
  file: 'shared-app.html',
  rule: 'SERVED-BUNDLE',
  symbol_or_pattern: bundleSymbol,
  inventory_id: 'SERVED-BUNDLE',
  note: NOTE,
}]);
const bundleRun = runGuard(bundleDir);
assert.equal(bundleRun.status, 1, bundleRun.stdout);
assertHit(bundleRun.stdout, 'REPORT', 'SERVED-BUNDLE', 'shared-app.html', bundleSymbol);
for (const symbol of [
  '/assets/other-bundle.js is not in the repo and the build does not produce it',
  '/assets/preload.js is not in the repo and the build does not produce it',
  '/assets/imported.js is not in the repo and the build does not produce it',
]) {
  assertHit(bundleRun.stderr, 'FAIL', 'SERVED-BUNDLE', 'extra.html', symbol);
}
assert.doesNotMatch(`${bundleRun.stdout}\n${bundleRun.stderr}`, /js\.stripe\.com/);
assert.doesNotMatch(`${bundleRun.stdout}\n${bundleRun.stderr}`, /eula-page/);
assert.doesNotMatch(`${bundleRun.stdout}\n${bundleRun.stderr}`, /kept\.js/);

// Dual-state shared-bundle check.
// While public/assets/index-BKun7ofk.js is not committed, explainSharedBundle.url
// must be the travel.timesyncher.com asset. Once that served file is committed
// and public/assets/upstream/index-BKun7ofk.js is absent, url must be ''.
// A travel.timesyncher.com fetch or URL then fails the test when it shows up
// in explainSharedBundle or in the build/runtime files this guard already
// reads: scripts/write-shared-assets.mjs, vite.config.mjs, and the committed
// HTML the served-bundle scan reads.
const SERVED_BUNDLE = 'public/assets/index-BKun7ofk.js';
const UPSTREAM_BUNDLE = 'public/assets/upstream/index-BKun7ofk.js';
const TRAVEL_HOST = /travel\.timesyncher\.com/;

function sharedBundleSources(cwd) {
  const files = ['scripts/write-shared-assets.mjs', 'vite.config.mjs'].filter((rel) => fs.existsSync(path.join(cwd, rel)));
  const html = [];
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf8' });
  if (inside.status === 0 && inside.stdout.trim() === 'true') {
    const listed = spawnSync('git', ['ls-files', '-z', '--', '*.html'], { cwd, encoding: 'utf8' });
    if (listed.status === 0) html.push(...listed.stdout.split('\0').filter(Boolean));
  } else {
    const walk = (abs) => {
      if (!fs.existsSync(abs)) return;
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
        const next = path.join(abs, entry.name);
        if (entry.isDirectory()) walk(next);
        else if (entry.name.endsWith('.html')) html.push(path.relative(cwd, next).split(path.sep).join('/'));
      }
    };
    walk(cwd);
  }
  for (const file of html) {
    const normalized = file.split(path.sep).join('/');
    if (normalized.startsWith('scripts/fixtures/hardcoded-content/')) continue;
    files.push(normalized);
  }
  return [...new Set(files)];
}

function filePresent(cwd, rel) {
  const abs = path.join(cwd, rel);
  if (!fs.existsSync(abs)) return false;
  const stat = fs.statSync(abs);
  return stat.isFile() && stat.size > 0;
}

function gitTracks(cwd, rel) {
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf8' });
  if (inside.status === 0 && inside.stdout.trim() === 'true') {
    const listed = spawnSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd, encoding: 'utf8' });
    return listed.status === 0;
  }
  return filePresent(cwd, rel);
}

function servedBundleCommitted(cwd) {
  return gitTracks(cwd, SERVED_BUNDLE) && !filePresent(cwd, UPSTREAM_BUNDLE);
}

function assertSharedBundleSource(cwd) {
  const explained = explainSharedBundle(cwd);
  assert.equal(explained.offlineBuildProduct, false);
  assert.match(explained.message, /write-shared-assets\.mjs/);
  assert.match(explained.message, /buildStart/);
  assert.match(explained.message, /No local source directory/);
  if (!servedBundleCommitted(cwd)) {
    assert.match(explained.url, /^https:\/\/travel\.timesyncher\.com\/assets\/index-BKun7ofk\.js$/);
    return explained;
  }
  assert.equal(explained.url, '');
  assert.equal(filePresent(cwd, UPSTREAM_BUNDLE), false);
  assert.ok(!TRAVEL_HOST.test(explained.url), 'explainSharedBundle url still has a travel.timesyncher.com URL');
  assert.ok(!TRAVEL_HOST.test(explained.message), 'explainSharedBundle message still has a travel.timesyncher.com URL');
  for (const rel of sharedBundleSources(cwd)) {
    const text = fs.readFileSync(path.join(cwd, rel), 'utf8');
    assert.ok(!TRAVEL_HOST.test(text), `${rel} still has a travel.timesyncher.com fetch or URL`);
  }
  return explained;
}

assertSharedBundleSource(repo);
assert.deepEqual(htmlRefsProducedByBuild(repo), []);
const built = spawnSync(process.execPath, ['scripts/scan-built-bundles.mjs'], { cwd: repo, encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr);
assert.match(built.stdout, /no HTML reference is produced by an offline build/);
assert.match(workflow, /scan-built-bundles\.mjs/);

const localVite = 'export default { plugins: [{ name: "timesyncher-shared-assets", async buildStart() { await writeSharedAssets(); } }] };\n';
const localWriter = [
  "const JS_NAME = 'index-BKun7ofk.js';",
  "const assetsDir = join(here, '..', 'public', 'assets');",
  'await readFile(join(assetsDir, JS_NAME));',
  '',
].join('\n');
const localBundle = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-local-bundle-'));
writeTree(localBundle, {
  [SERVED_BUNDLE]: '/* served bundle */\n',
  'scripts/write-shared-assets.mjs': localWriter,
  'vite.config.mjs': localVite,
  'shared-app.html': '<script>trek.src = \'/assets/index-BKun7ofk.js\';</script>\n',
}, []);
const localExplained = assertSharedBundleSource(localBundle);
assert.equal(localExplained.url, '');
assert.equal(filePresent(localBundle, UPSTREAM_BUNDLE), false);

const fetchedBundle = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-fetched-bundle-'));
writeTree(fetchedBundle, {
  [SERVED_BUNDLE]: '/* served bundle */\n',
  'scripts/write-shared-assets.mjs': `${localWriter}await fetch('https://travel.timesyncher.com/assets/' + JS_NAME);\n`,
  'vite.config.mjs': localVite,
  'shared-app.html': '<script>trek.src = \'/assets/index-BKun7ofk.js\';</script>\n',
}, []);
assert.throws(() => assertSharedBundleSource(fetchedBundle), /travel\.timesyncher\.com/);

const linkedBundle = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-linked-bundle-'));
writeTree(linkedBundle, {
  [SERVED_BUNDLE]: '/* served bundle */\n',
  'scripts/write-shared-assets.mjs': localWriter,
  'vite.config.mjs': `${localVite}await fetch('https://travel.timesyncher.com/assets/index-BKun7ofk.js');\n`,
  'shared-app.html': '<script src="https://travel.timesyncher.com/assets/index-BKun7ofk.js"></script>\n',
}, []);
assert.throws(() => assertSharedBundleSource(linkedBundle), /travel\.timesyncher\.com/);

const crossFile = 'scripts/cross-origin-bundle.mjs';
const crossText = readFixture('cross-origin-bundle.mjs');
const crossHits = crossOriginBundleFindings(crossFile, crossText, { downloads: true, scripts: true });
assert.deepEqual(crossHits.map((finding) => finding.symbol_or_pattern).sort(), [
  "https://${'travel.timesyncher.com'}/assets/templated.js",
  'https://travel.timesyncher.com/assets/axios.js',
  'https://travel.timesyncher.com/assets/copied.js',
  'https://travel.timesyncher.com/assets/curled.js',
  'https://travel.timesyncher.com/assets/https-get.js',
  'https://travel.timesyncher.com/assets/joined.js',
  'https://travel.timesyncher.com/assets/static.js',
]);
const crossSilenced = classify(crossHits, [entry(crossFile, 'https://travel.timesyncher.com/assets/copied.js', 'NO-CROSS-ORIGIN-BUNDLE')]);
assert.equal(crossSilenced.report.length, 0);
assert.equal(crossSilenced.fail.length, crossHits.length);
assert.deepEqual(
  crossOriginBundleFindings('cross-origin-bundle.html', readFixture('cross-origin-bundle.html'), { scripts: true }).map((finding) => finding.symbol_or_pattern).sort(),
  [
    'https://cdn.timesyncher.com/assets/pre.js',
    'https://static.timesyncher.com/assets/dynamic.js',
    'https://travel.timesyncher.com/assets/assigned.js',
    'https://travel.timesyncher.com/assets/page.js',
    'https://www.timesyncher.com/widget.js',
  ],
);
assert.deepEqual(crossOriginBundleFindings('same-origin-bundle.html', readFixture('same-origin-bundle.html'), { downloads: true, scripts: true }), []);

const originDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-origin-bundle-'));
writeTree(originDir, {
  'scripts/cross-origin-bundle.mjs': crossText,
  'cross-origin-bundle.html': readFixture('cross-origin-bundle.html'),
  'public/assets/index-BKun7ofk.js': 'console.log(1)\n',
  'relative.js': 'export {}\n',
  'package.json': `${JSON.stringify({ scripts: { prebuild: 'curl -fsSL https://travel.timesyncher.com/assets/pkg.js -o pkg.js' } })}\n`,
  'vercel.json': `${JSON.stringify({ installCommand: 'wget -q https://travel.timesyncher.com/assets/install.js' })}\n`,
  'vite.config.mjs': "import { writeSharedAssets } from './scripts/write-shared-assets.mjs';\nexport default { plugins: [{ async buildStart() { await writeSharedAssets(); } }] };\n",
  'scripts/write-shared-assets.mjs': "const JS_URL = `https://travel.timesyncher.com/assets/${'index-new.js'}`;\nexport async function writeSharedAssets() { return fetch(JS_URL); }\n",
}, [entry(crossFile, 'https://travel.timesyncher.com/assets/copied.js', 'NO-CROSS-ORIGIN-BUNDLE')]);
const originRun = runGuard(originDir);
assert.equal(originRun.status, 1, originRun.stdout);
assert.equal(identities(originRun.stderr).every((row) => row.rule === 'NO-CROSS-ORIGIN-BUNDLE'), true, originRun.stderr);
assertHit(originRun.stderr, 'FAIL', 'NO-CROSS-ORIGIN-BUNDLE', crossFile, 'https://travel.timesyncher.com/assets/copied.js');
assert.doesNotMatch(originRun.stdout, /NO-CROSS-ORIGIN-BUNDLE/);
assertHit(originRun.stderr, 'FAIL', 'NO-CROSS-ORIGIN-BUNDLE', 'package.json', 'https://travel.timesyncher.com/assets/pkg.js');
assertHit(originRun.stderr, 'FAIL', 'NO-CROSS-ORIGIN-BUNDLE', 'vercel.json', 'https://travel.timesyncher.com/assets/install.js');
assertHit(originRun.stderr, 'FAIL', 'NO-CROSS-ORIGIN-BUNDLE', 'vite.config.mjs', 'writeSharedAssets()');
assert.doesNotMatch(`${originRun.stdout}\n${originRun.stderr}`, /index-BKun7ofk\.js is not in the repo/);

const relativeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-relative-bundle-'));
writeTree(relativeDir, {
  'same-origin-bundle.html': readFixture('same-origin-bundle.html'),
  'public/assets/kept.js': 'console.log(1)\n',
  'kept.js': 'console.log(1)\n',
}, []);
const relativeRun = runGuard(relativeDir);
assert.equal(relativeRun.status, 0, `${relativeRun.stdout}\n${relativeRun.stderr}`);
assert.doesNotMatch(`${relativeRun.stdout}\n${relativeRun.stderr}`, /NO-CROSS-ORIGIN-BUNDLE/);

const leakText = readFixture('bundle-leak.js');
const leakSymbols = bundleLeakFindings('public/assets/bundle-leak.js', leakText).map((finding) => finding.symbol_or_pattern);
assert.deepEqual([...new Set(leakSymbols)].sort(), [
  '100.127.255.254',
  '100.64.0.1',
  '100.66.47.62',
  '10.1.2.3',
  '172.16.0.5',
  '172.31.9.9',
  '192.168.1.15',
  '192.168.50.2',
  '32-alnum near /s/',
  '32-alnum near share',
  '32-alnum near token',
  'Arrive TBD',
  'Craig_Kim_NYC_June_2026',
  'Depart TBD',
  'Price TBD',
  'craig+kim+nyc',
].sort());
for (const absent of ['8.8.8.8', '172.15.0.1', '100.63.0.1', '100.128.0.1', '11.1.1.1', 'abcdefghijklmnopqrstuvwxyz012345']) {
  assert.equal(leakSymbols.includes(absent), false, absent);
}
const invented = `HashFixtureAa${'0'.repeat(19)}`;
assert.equal(invented.length, 32);
const inventedHash = createHash('sha256').update(invented).digest('hex');
assert.notEqual(inventedHash, SHARE_TOKEN_SHA256);
const hashed = bundleLeakFindings('public/assets/hash-fixture.js', `'${invented.slice(0, 8)}' + '${invented.slice(8)}'`, { hashes: [inventedHash] });
assert.equal(hashed.some((finding) => finding.symbol_or_pattern === `sha256:${inventedHash}`), true);
assert.equal(hashed.some((finding) => finding.symbol_or_pattern.includes(invented)), false);
const plain = bundleLeakFindings('public/assets/hash-fixture.js', `'${invented.slice(0, 8)}' + '${invented.slice(8)}'`);
assert.equal(plain.some((finding) => finding.symbol_or_pattern.startsWith('sha256:')), false);
const leakFile = 'public/assets/bundle-leak.js';
const silenced = classify(bundleLeakFindings(leakFile, leakText), [entry(leakFile, 'Price TBD', 'BUNDLE-LEAK')]);
assert.equal(silenced.report.length, 0);
assert.equal(silenced.fail.length > 0, true);
assert.equal(silenced.fail.every((finding) => finding.rule === 'BUNDLE-LEAK'), true);
const leakDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-bundle-leak-'));
writeTree(leakDir, { [leakFile]: leakText }, [entry(leakFile, 'Price TBD', 'BUNDLE-LEAK')]);
const leakRun = runGuard(leakDir);
assert.equal(leakRun.status, 1, leakRun.stdout);
assertHit(leakRun.stderr, 'FAIL', 'BUNDLE-LEAK', leakFile, 'Price TBD');
assertHit(leakRun.stderr, 'FAIL', 'BUNDLE-LEAK', leakFile, 'Craig_Kim_NYC_June_2026');
assert.doesNotMatch(leakRun.stderr, /AbcdefGhijklmnopQrstuvwxyz012345/);
for (const watched of [script, fileURLToPath(import.meta.url), path.join(fixtures, 'bundle-leak.js')]) {
  const watchedText = fs.readFileSync(watched, 'utf8');
  for (const match of watchedText.matchAll(/(?<![A-Za-z0-9])[A-Za-z0-9]{32}(?![A-Za-z0-9])/g)) {
    assert.notEqual(createHash('sha256').update(match[0]).digest('hex'), SHARE_TOKEN_SHA256, watched);
  }
}
const iconPair = 'const LucideScissorsSquareDashedBottom = LucideScreenShare;';
const iconHits = bundleLeakFindings('public/assets/icons.js', iconPair);
assert.equal(iconHits.some((finding) => finding.symbol_or_pattern === '32-alnum near share'), false);
assert.equal(iconHits.length, 0);
const shaped = 'Ab9defGhijklmnopQrstuvwxyz012345';
assert.equal(shaped.length, 32);
assert.equal(/[A-Z]/.test(shaped) && /[a-z]/.test(shaped) && /[0-9]/.test(shaped), true);
const shapedHits = bundleLeakFindings('public/assets/shaped.js', `share ${shaped} token /s/${shaped}`);
for (const symbol of ['32-alnum near share', '32-alnum near token', '32-alnum near /s/']) {
  assert.equal(shapedHits.some((finding) => finding.symbol_or_pattern === symbol), true, symbol);
}
const noDigit = 'AbcdefGhijklmnopQrstuvwxyzABCDEF';
assert.equal(noDigit.length, 32);
assert.equal(bundleLeakFindings('public/assets/nodigit.js', `share ${noDigit}`).some((finding) => finding.symbol_or_pattern === '32-alnum near share'), false);

const padFile = 'public/assets/pad.js';
const twenty = `${' '.repeat(20)}`;
const padHits = whitespacePadFindings(padFile, `const x = "${twenty}";\n`);
assert.equal(padHits.length, 1);
assert.match(padHits[0].symbol_or_pattern, /^spaces:20@/);
assert.equal(whitespacePadFindings(padFile, ' '.repeat(19)).length, 0);
assert.match(whitespacePadFindings(padFile, '\t'.repeat(20))[0].symbol_or_pattern, /^tabs:20@/);
assert.equal(whitespacePadFindings(padFile, '\n'.repeat(40)).length, 0);
assert.equal(whitespacePadFindings(padFile, `\`${' '.repeat(80)}\``).length, 1);
const padSilenced = classify(padHits, [entry(padFile, padHits[0].symbol_or_pattern, 'EVASION')]);
assert.equal(padSilenced.report.length, 0);
assert.equal(padSilenced.fail.length, 1);
const padDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-pad-'));
writeTree(padDir, { [padFile]: `const x = "${twenty}";\n` }, []);
const padRun = runGuard(padDir);
assert.equal(padRun.status, 1, padRun.stdout);
assertHit(padRun.stderr, 'FAIL', 'EVASION', padFile, padHits[0].symbol_or_pattern);
assert.equal(baseline.some((row) => row.rule === 'EVASION' || row.inventory_id === 'EVASION'), false);
assert.equal(baseline.some((row) => row.file === 'public/assets/index-0J54vUO3.js' || row.file === 'public/assets/index-TimeSyncherVacationLogin.js'), false);
assert.equal(failRows.length, 0);

process.stdout.write('hardcoded content check test passed\n');
