import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_NOTE, classify, scanText } from './check-hardcoded-content.mjs';

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

function entry(file, symbol) {
  return { file, symbol_or_pattern: symbol, inventory_id: 'A0', note: NOTE };
}

const placeFile = 'src/vacation/place-list.mjs';
const placeText = readFixture('place-list.mjs');
assert.deepEqual(symbols(placeFile, placeText), [['HC-PLACE-LIST', 'EXTRA_LIST_FILL']]);
assert.equal(classify(scanText(placeFile, placeText), []).fail.length, 1);
assert.equal(classify(scanText(placeFile, placeText), []).report.length, 0);
const placeClosed = classify(scanText(placeFile, placeText), [entry(placeFile, 'EXTRA_LIST_FILL')]);
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
  entry(coordFile, '{lat:21.111,lng:-157.222}'),
  entry(coordFile, '[21.111,-157.222]'),
]);
assert.equal(coordClosed.fail.length, 0);
assert.equal(coordClosed.report.length, 2);

const thingFile = 'src/vacation/thing.mjs';
const thingText = readFixture('thing.mjs');
assert.deepEqual(symbols(thingFile, thingText), [["HC-THING", "category_name:'Car',name:'Aloha Shuttle'"]]);
assert.equal(classify(scanText(thingFile, thingText), []).fail.length, 1);
assert.equal(classify(scanText(thingFile, thingText), [entry(thingFile, "category_name:'Car',name:'Aloha Shuttle'")]).fail.length, 0);

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
  entry(dialogFile, 'ONBOARDING_OPENER_NEW'),
  entry(dialogFile, 'Welcome aboard'),
  entry(dialogFile, 'Include these sentences'),
  entry(dialogFile, 'must say'),
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
  const silenced = classify(findings, [entry(file, symbol)]);
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
assert.match(openRun.stderr, /FAIL\tHC-PLACE-LIST\tsrc\/vacation\/place-list\.mjs:1\tEXTRA_LIST_FILL/);
assert.match(openRun.stderr, /FAIL\tHC-COORD\tsrc\/vacation\/coords\.mjs:1\t\{lat:21\.111,lng:-157\.222\}/);
assert.match(openRun.stderr, /FAIL\tHC-COORD\tsrc\/vacation\/coords\.mjs:2\t\[21\.111,-157\.222\]/);
assert.match(openRun.stderr, /FAIL\tHC-THING\tsrc\/vacation\/thing\.mjs:1\tcategory_name:'Car',name:'Aloha Shuttle'/);
assert.match(openRun.stderr, /FAIL\tHC-DIALOG\tsrc\/vacation\/dialog\.mjs:1\tONBOARDING_OPENER_NEW/);
assert.match(openRun.stderr, /FAIL\tHC-DIALOG\tsrc\/vacation\/dialog\.mjs:1\tWelcome aboard/);
assert.match(openRun.stderr, /FAIL\tHC-DIALOG\tsrc\/vacation\/dialog\.mjs:2\tInclude these sentences/);
assert.match(openRun.stderr, /FAIL\tHC-DIALOG\tsrc\/vacation\/dialog\.mjs:3\tmust say/);
assert.match(openRun.stderr, /FAIL\tTOKEN-EVIDENCE\tevidence\/bearer\.txt:1\tBearer/);

const closedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hardcode-closed-'));
writeTree(closedDir, {
  'src/vacation/place-list.mjs': placeText,
  'src/vacation/coords.mjs': coordText,
  'src/vacation/thing.mjs': thingText,
  'src/vacation/dialog.mjs': dialogText,
}, [
  entry(placeFile, 'EXTRA_LIST_FILL'),
  entry(coordFile, '{lat:21.111,lng:-157.222}'),
  entry(coordFile, '[21.111,-157.222]'),
  entry(thingFile, "category_name:'Car',name:'Aloha Shuttle'"),
  entry(dialogFile, 'ONBOARDING_OPENER_NEW'),
  entry(dialogFile, 'Welcome aboard'),
  entry(dialogFile, 'Include these sentences'),
  entry(dialogFile, 'must say'),
]);
const closedRun = runGuard(closedDir);
assert.equal(closedRun.status, 0, closedRun.stderr);
assert.match(closedRun.stdout, /REPORT\tHC-PLACE-LIST\tsrc\/vacation\/place-list\.mjs:1\tEXTRA_LIST_FILL/);
assert.match(closedRun.stdout, /REPORT\tHC-COORD\tsrc\/vacation\/coords\.mjs:1\t\{lat:21\.111,lng:-157\.222\}/);
assert.match(closedRun.stdout, /REPORT\tHC-THING\tsrc\/vacation\/thing\.mjs:1\tcategory_name:'Car',name:'Aloha Shuttle'/);
assert.match(closedRun.stdout, /REPORT\tHC-DIALOG\tsrc\/vacation\/dialog\.mjs:3\tmust say/);
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
fs.writeFileSync(path.join(grown, 'scripts/hardcoded-content-baseline.json'), `${JSON.stringify([entry('src/vacation/place-list.mjs', 'EXTRA_LIST_FILL')])}\n`);
const grownRun = runGuard(grown, { BASE: 'base' });
assert.equal(grownRun.status, 1, grownRun.stdout);
assert.match(grownRun.stderr, /FAIL\tBASELINE-GROWTH\tscripts\/hardcoded-content-baseline\.json:1\t1>0/);

const same = repoWithBase([entry('src/vacation/place-list.mjs', 'EXTRA_LIST_FILL')]);
const sameRun = runGuard(same, { BASE: 'base' });
assert.equal(sameRun.status, 0, sameRun.stderr);
assert.match(sameRun.stdout, /hardcoded content check passed \(0 report, 0 fail\)/);

const seeded = repoWithBase(null);
fs.mkdirSync(path.join(seeded, 'scripts'), { recursive: true });
fs.writeFileSync(path.join(seeded, 'scripts/hardcoded-content-baseline.json'), `${JSON.stringify([entry('src/vacation/place-list.mjs', 'EXTRA_LIST_FILL')])}\n`);
const seededRun = runGuard(seeded, { BASE: 'base' });
assert.equal(seededRun.status, 0, seededRun.stderr);
assert.match(seededRun.stdout, /hardcoded content check passed \(0 report, 0 fail\)/);

const missingRef = repoWithBase([]);
const missingRefRun = runGuard(missingRef, { BASE: 'missing-ref' });
assert.equal(missingRefRun.status, 1);
assert.match(missingRefRun.stderr, /FAIL\tBASELINE-GROWTH/);

const workflow = fs.readFileSync(path.join(repo, '.github/workflows/evidence-secrets.yml'), 'utf8');
assert.match(workflow, /check-hardcoded-content\.mjs/);
assert.match(workflow, /test_check_hardcoded_content\.mjs/);

const baseline = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/hardcoded-content-baseline.json'), 'utf8'));
assert.equal(baseline.length > 0, true);
for (const row of baseline) assert.equal(row.note, BASELINE_NOTE);

const repoRun = runGuard(repo);
assert.equal(repoRun.status, 0, repoRun.stderr);
assert.match(repoRun.stdout, /REPORT\tHC-PLACE-LIST\tsrc\/vacation\/keepsake-list-minimums\.mjs:12\tKEEPSAKE_LIST_FILL/);
assert.match(repoRun.stdout, /REPORT\tHC-COORD\tsrc\/vacation\/keepsake-list-minimums\.mjs:275\tfallbackLat:19\.64,fallbackLng:-155\.996/);
assert.match(repoRun.stdout, /REPORT\tHC-THING\tsrc\/vacation\/intake-shared-trip\.mjs:325\tcategory_name:'Car',name:'SpeediShuttle'/);
assert.match(repoRun.stdout, /REPORT\tHC-DIALOG\tsrc\/vacation\/live-app-turn\.mjs:40\tCANNED_APP_REPLY/);
assert.match(repoRun.stdout, /hardcoded content check passed \(161 report, 0 fail\)/);
assert.equal(baseline.length, 161);

process.stdout.write('hardcoded content check test passed\n');
