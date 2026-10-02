import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASELINE_NOTE,
  MODEL_CLIENT,
  SEARCH_MODULES,
  classify,
  lineCount,
  scanRoots,
  scanText,
} from './check-code-ratchet.mjs';

const script = fileURLToPath(new URL('./check-code-ratchet.mjs', import.meta.url));
const repo = fileURLToPath(new URL('..', import.meta.url));
const fixtures = fileURLToPath(new URL('./fixtures/code-ratchet/', import.meta.url));

function readFixture(name) {
  return fs.readFileSync(path.join(fixtures, name), 'utf8');
}

function symbols(file, text) {
  return scanText(file, text).map((finding) => [finding.rule, finding.symbol]);
}

function entry(rule, file, symbol) {
  return { rule, file, symbol, note: BASELINE_NOTE };
}

function cases(name) {
  return readFixture(name).split('\n---\n').map((part) => {
    const lines = part.split('\n');
    const header = lines.find((line) => line.startsWith('// expect '));
    return {
      expect: header.slice('// expect '.length).trim(),
      body: lines.filter((line) => line !== header).join('\n'),
    };
  });
}

const modelFile = 'src/vacation/rogue-model.mjs';
const modelText = readFixture('model-client.mjs');
assert.deepEqual(symbols(modelFile, modelText), [
  ['MODEL-CLIENT-ONLY', 'openrouter.ai'],
  ['MODEL-CLIENT-ONLY', 'api.x.ai'],
  ['MODEL-CLIENT-ONLY', 'api.openai.com'],
]);
assert.equal(classify(scanText(modelFile, modelText), []).fail.length, 3);
assert.equal(classify(scanText(MODEL_CLIENT, modelText), []).fail.length, 0);
const modelClosed = classify(scanText(modelFile, modelText), [
  entry('MODEL-CLIENT-ONLY', modelFile, 'api.openai.com'),
  entry('MODEL-CLIENT-ONLY', modelFile, 'api.x.ai'),
  entry('MODEL-CLIENT-ONLY', modelFile, 'openrouter.ai'),
]);
assert.equal(modelClosed.fail.length, 0);
assert.equal(modelClosed.report.length, 3);

const searchFile = 'src/vacation/rogue-search.mjs';
const searchText = readFixture('search.mjs');
assert.deepEqual(symbols(searchFile, searchText), [
  ['SEARCH-MODULE-ONLY', 'brave'],
  ['SEARCH-MODULE-ONLY', 'nominatim'],
  ['SEARCH-MODULE-ONLY', 'tavily'],
]);
assert.equal(classify(scanText(searchFile, searchText), []).fail.length, 3);
assert.equal(scanText(SEARCH_MODULES[0], searchText).some((finding) => finding.rule === 'SEARCH-MODULE-ONLY'), false);

for (const sample of cases('empty-catch.mjs')) {
  const got = scanText('src/vacation/catch.mjs', sample.body)
    .filter((finding) => finding.rule === 'NO-EMPTY-CATCH')
    .map((finding) => finding.symbol);
  assert.deepEqual(got, sample.expect === 'none' ? [] : [sample.expect], sample.body);
}

for (const sample of cases('floating.mjs')) {
  const got = scanText('src/vacation/float.mjs', sample.body)
    .filter((finding) => finding.rule === 'NO-FLOATING-PROMISE')
    .map((finding) => finding.symbol);
  assert.deepEqual(got, sample.expect === 'none' ? [] : [sample.expect], sample.body);
}

for (const sample of cases('workaround.mjs')) {
  const got = scanText('src/vacation/note.mjs', sample.body)
    .filter((finding) => finding.rule === 'NO-WORKAROUND-COMMENTS')
    .map((finding) => finding.symbol);
  assert.deepEqual(got, sample.expect === 'none' ? [] : [sample.expect], sample.body);
}

const tripText = readFixture('test-trip.mjs');
assert.deepEqual(symbols('src/vacation/new-trip.mjs', tripText), [
  ['TEST-TRIP-LITERALS', 'Kimberly'],
  ['TEST-TRIP-LITERALS', 'las-vegas-vacation-3'],
]);
assert.deepEqual(scanText('scripts/fixtures/trips/sample.mjs', tripText), []);

const oversize = readFixture('oversize.mjs');
assert.equal(lineCount(oversize), 501);
const overFile = 'src/vacation/new-oversize.mjs';
const overFindings = scanText(overFile, oversize);
assert.deepEqual(overFindings.map((finding) => [finding.rule, finding.symbol]), [['FILE-SIZE-500', 'lines:501']]);
assert.equal(classify(overFindings, []).fail[0].symbol, 'lines:501>500');
const overClosed = classify(overFindings, [entry('FILE-SIZE-500', overFile, 'lines:501')]);
assert.equal(overClosed.fail.length, 0);
assert.equal(overClosed.report[0].symbol, 'lines:501');
const grown = `${oversize}export const extra = 1;\n`;
const grownFindings = scanText(overFile, grown);
assert.equal(classify(grownFindings, [entry('FILE-SIZE-500', overFile, 'lines:501')]).fail[0].symbol, 'lines:502>501');
const raised = classify(
  grownFindings,
  [entry('FILE-SIZE-500', overFile, 'lines:502')],
  [entry('FILE-SIZE-500', overFile, 'lines:501')],
);
assert.equal(raised.fail[0].symbol, 'lines:502>501');
assert.equal(scanText('src/vacation/small.mjs', 'export const n = 1;\n').some((finding) => finding.rule === 'FILE-SIZE-500'), false);

function copyDead(dir) {
  const root = path.join(fixtures, 'dead');
  const visit = (abs, rel) => {
    for (const entryName of fs.readdirSync(abs)) {
      const from = path.join(abs, entryName);
      const next = rel ? `${rel}/${entryName}` : entryName;
      if (fs.statSync(from).isDirectory()) {
        visit(from, next);
        continue;
      }
      const dest = path.join(dir, next);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(from, dest);
    }
  };
  visit(root, '');
}

const deadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-ratchet-dead-'));
copyDead(deadDir);
const deadFindings = scanRoots(deadDir).filter((finding) => finding.rule === 'DEAD-CODE');
assert.deepEqual(deadFindings.map((finding) => [finding.file, finding.symbol]), [
  ['src/lib.mjs', 'export:unusedExport'],
  ['src/orphan.mjs', 'export:orphan'],
  ['src/orphan.mjs', 'file'],
]);
assert.equal(classify(deadFindings, []).fail.length, 3);
assert.equal(classify(deadFindings, deadFindings.map((finding) => entry(finding.rule, finding.file, finding.symbol))).fail.length, 0);

function runGuard(cwd, env = {}, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
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
  const baselinePath = path.join(dir, 'scripts/code-ratchet-baseline.json');
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
}

const cliModel = 'scripts/rogue-model.mjs';
const openDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-ratchet-open-'));
writeTree(openDir, { [cliModel]: modelText }, []);
const openRun = runGuard(openDir);
assert.equal(openRun.status, 1, openRun.stdout);
assert.match(openRun.stderr, /FAIL\tMODEL-CLIENT-ONLY\tscripts\/rogue-model\.mjs:\d+\tapi\.x\.ai/);
assert.match(openRun.stderr, /code ratchet check failed \(0 report, 3 fail\)/);

const closedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-ratchet-closed-'));
writeTree(closedDir, { [cliModel]: modelText }, [
  entry('MODEL-CLIENT-ONLY', cliModel, 'api.openai.com'),
  entry('MODEL-CLIENT-ONLY', cliModel, 'api.x.ai'),
  entry('MODEL-CLIENT-ONLY', cliModel, 'openrouter.ai'),
]);
const closedRun = runGuard(closedDir);
assert.equal(closedRun.status, 0, closedRun.stderr);
assert.match(closedRun.stdout, /REPORT\tMODEL-CLIENT-ONLY\tscripts\/rogue-model\.mjs:\d+\tapi\.x\.ai/);
assert.match(closedRun.stdout, /code ratchet check passed \(3 report, 0 fail\)/);
assert.match(closedRun.stdout, /model client scripts\/vacation-app-reply-rules\.mjs/);
assert.match(closedRun.stdout, /search modules src\/vacation\/poi-search\.mjs/);

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
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'code-ratchet-origin-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'code-ratchet-work-'));
  git(origin, ['init', '--bare']);
  git(work, ['init', '-b', 'base']);
  git(work, ['remote', 'add', 'origin', origin]);
  fs.mkdirSync(path.join(work, 'scripts'), { recursive: true });
  if (baseWritten != null) {
    fs.writeFileSync(path.join(work, 'scripts/code-ratchet-baseline.json'), `${JSON.stringify(baseWritten)}\n`);
  } else {
    fs.writeFileSync(path.join(work, 'scripts/keep.txt'), 'base\n');
  }
  git(work, ['add', '.']);
  git(work, ['commit', '-m', 'base']);
  git(work, ['push', '-u', 'origin', 'base']);
  return work;
}

const grownBase = repoWithBase([]);
fs.writeFileSync(path.join(grownBase, 'scripts/code-ratchet-baseline.json'), `${JSON.stringify([entry('NO-EMPTY-CATCH', 'src/vacation/catch.mjs', 'empty-catch')])}\n`);
const grownRun = runGuard(grownBase, { BASE: 'base' });
assert.equal(grownRun.status, 1, grownRun.stdout);
assert.match(grownRun.stderr, /FAIL\tBASELINE-GROWTH\tscripts\/code-ratchet-baseline\.json:1\tsrc\/vacation\/catch\.mjs\|NO-EMPTY-CATCH\|empty-catch\|/);

const swapped = repoWithBase([entry('NO-EMPTY-CATCH', 'src/vacation/catch.mjs', 'empty-catch')]);
fs.writeFileSync(path.join(swapped, 'scripts/code-ratchet-baseline.json'), `${JSON.stringify([entry('NO-EMPTY-CATCH', 'src/vacation/catch.mjs', 'other')])}\n`);
const swappedRun = runGuard(swapped, { BASE: 'base' });
assert.equal(swappedRun.status, 1, swappedRun.stdout);
assert.match(swappedRun.stderr, /FAIL\tBASELINE-GROWTH\tscripts\/code-ratchet-baseline\.json:1\tsrc\/vacation\/catch\.mjs\|NO-EMPTY-CATCH\|other\|/);
assert.doesNotMatch(swappedRun.stderr, /\|empty-catch\|/);

const shrunk = repoWithBase([
  entry('NO-EMPTY-CATCH', 'src/vacation/catch.mjs', 'empty-catch'),
  entry('NO-EMPTY-CATCH', 'src/vacation/other.mjs', 'empty-catch'),
]);
fs.writeFileSync(path.join(shrunk, 'scripts/code-ratchet-baseline.json'), `${JSON.stringify([entry('NO-EMPTY-CATCH', 'src/vacation/catch.mjs', 'empty-catch')])}\n`);
const shrunkRun = runGuard(shrunk, { BASE: 'base' });
assert.equal(shrunkRun.status, 0, shrunkRun.stderr);

const same = repoWithBase([entry('NO-EMPTY-CATCH', 'src/vacation/catch.mjs', 'empty-catch')]);
const sameRun = runGuard(same, { BASE: 'base' });
assert.equal(sameRun.status, 0, sameRun.stderr);
assert.match(sameRun.stdout, /code ratchet check passed \(0 report, 0 fail\)/);

const addedRule = repoWithBase([entry('NO-EMPTY-CATCH', 'src/vacation/catch.mjs', 'empty-catch')]);
fs.writeFileSync(path.join(addedRule, 'scripts/code-ratchet-baseline.json'), `${JSON.stringify([
  entry('NO-EMPTY-CATCH', 'src/vacation/catch.mjs', 'empty-catch'),
  entry('NO-WORKAROUND-COMMENTS', 'src/vacation/catch.mjs', 'TODO'),
])}\n`);
const addedRuleRun = runGuard(addedRule, { BASE: 'base' });
assert.equal(addedRuleRun.status, 0, addedRuleRun.stderr);

const oldRule = repoWithBase([entry('NO-EMPTY-CATCH', 'src/vacation/catch.mjs', 'empty-catch')]);
fs.writeFileSync(path.join(oldRule, 'scripts/code-ratchet-baseline.json'), `${JSON.stringify([
  entry('NO-EMPTY-CATCH', 'src/vacation/catch.mjs', 'empty-catch'),
  entry('NO-EMPTY-CATCH', 'src/vacation/other.mjs', 'empty-catch'),
])}\n`);
const oldRuleRun = runGuard(oldRule, { BASE: 'base' });
assert.equal(oldRuleRun.status, 1, oldRuleRun.stdout);
assert.match(oldRuleRun.stderr, /FAIL\tBASELINE-GROWTH\tscripts\/code-ratchet-baseline\.json:1\tsrc\/vacation\/other\.mjs\|NO-EMPTY-CATCH\|empty-catch\|/);

const sizeDown = repoWithBase([entry('FILE-SIZE-500', 'src/vacation/live-app-turn.mjs', 'lines:2587')]);
fs.writeFileSync(path.join(sizeDown, 'scripts/code-ratchet-baseline.json'), `${JSON.stringify([entry('FILE-SIZE-500', 'src/vacation/live-app-turn.mjs', 'lines:2413')])}\n`);
const sizeDownRun = runGuard(sizeDown, { BASE: 'base' });
assert.equal(sizeDownRun.status, 0, sizeDownRun.stderr);
assert.doesNotMatch(sizeDownRun.stderr, /BASELINE-GROWTH/);

const sizeUp = repoWithBase([entry('FILE-SIZE-500', 'src/vacation/live-app-turn.mjs', 'lines:2413')]);
fs.writeFileSync(path.join(sizeUp, 'scripts/code-ratchet-baseline.json'), `${JSON.stringify([entry('FILE-SIZE-500', 'src/vacation/live-app-turn.mjs', 'lines:2587')])}\n`);
const sizeUpRun = runGuard(sizeUp, { BASE: 'base' });
assert.equal(sizeUpRun.status, 1, sizeUpRun.stdout);
assert.match(sizeUpRun.stderr, /FAIL\tBASELINE-GROWTH\tscripts\/code-ratchet-baseline\.json:1\tsrc\/vacation\/live-app-turn\.mjs\|FILE-SIZE-500\|lines:2587\|/);

const sizeNew = repoWithBase([entry('FILE-SIZE-500', 'src/vacation/live-app-turn.mjs', 'lines:2413')]);
fs.writeFileSync(path.join(sizeNew, 'scripts/code-ratchet-baseline.json'), `${JSON.stringify([
  entry('FILE-SIZE-500', 'src/vacation/live-app-turn.mjs', 'lines:2413'),
  entry('FILE-SIZE-500', 'src/vacation/other.mjs', 'lines:100'),
])}\n`);
const sizeNewRun = runGuard(sizeNew, { BASE: 'base' });
assert.equal(sizeNewRun.status, 1, sizeNewRun.stdout);
assert.match(sizeNewRun.stderr, /FAIL\tBASELINE-GROWTH\tscripts\/code-ratchet-baseline\.json:1\tsrc\/vacation\/other\.mjs\|FILE-SIZE-500\|lines:100\|/);

const seeded = repoWithBase(null);
fs.mkdirSync(path.join(seeded, 'scripts'), { recursive: true });
fs.writeFileSync(path.join(seeded, 'scripts/code-ratchet-baseline.json'), `${JSON.stringify([entry('NO-EMPTY-CATCH', 'src/vacation/catch.mjs', 'empty-catch')])}\n`);
const seededRun = runGuard(seeded, { BASE: 'base' });
assert.equal(seededRun.status, 0, seededRun.stderr);

const missingRef = repoWithBase([]);
const missingRefRun = runGuard(missingRef, { BASE: 'missing-ref' });
assert.equal(missingRefRun.status, 1);
assert.match(missingRefRun.stderr, /FAIL\tBASELINE-GROWTH/);

const pruneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-ratchet-prune-'));
const big = `${Array.from({ length: 501 }, (_, i) => `export const n${i} = ${i};`).join('\n')}\n`;
writeTree(pruneDir, {
  'scripts/b-keep.mjs': 'try { return 1; } catch {}\n',
  'scripts/a-keep.mjs': 'try { return 1; } catch {}\n// TODO leave\n',
  'scripts/big.mjs': big,
  'scripts/small.mjs': 'export const ok = 1;\n',
}, [
  entry('NO-EMPTY-CATCH', 'scripts/b-keep.mjs', 'empty-catch'),
  entry('NO-EMPTY-CATCH', 'scripts/a-keep.mjs', 'GONE'),
  entry('FILE-SIZE-500', 'scripts/big.mjs', 'lines:600'),
  entry('FILE-SIZE-500', 'scripts/small.mjs', 'lines:900'),
  entry('NO-EMPTY-CATCH', 'scripts/a-keep.mjs', 'empty-catch'),
]);
const pruneRun = runGuard(pruneDir, {}, ['--prune']);
assert.equal(pruneRun.status, 0, pruneRun.stderr);
assert.match(pruneRun.stdout, /STALE\tNO-EMPTY-CATCH\tscripts\/a-keep\.mjs\tGONE\t/);
assert.match(pruneRun.stdout, /STALE\tFILE-SIZE-500\tscripts\/small\.mjs\tlines:900\t/);
assert.doesNotMatch(pruneRun.stdout, /TODO/);
const pruned = JSON.parse(fs.readFileSync(path.join(pruneDir, 'scripts/code-ratchet-baseline.json'), 'utf8'));
assert.deepEqual(pruned.map((row) => [row.file, row.rule, row.symbol]), [
  ['scripts/a-keep.mjs', 'NO-EMPTY-CATCH', 'empty-catch'],
  ['scripts/b-keep.mjs', 'NO-EMPTY-CATCH', 'empty-catch'],
  ['scripts/big.mjs', 'FILE-SIZE-500', 'lines:600'],
]);

const workflow = fs.readFileSync(path.join(repo, '.github/workflows/evidence-secrets.yml'), 'utf8');
assert.match(workflow, /check-code-ratchet\.mjs/);
assert.match(workflow, /test_check_code_ratchet\.mjs/);

const baseline = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/code-ratchet-baseline.json'), 'utf8'));
assert.equal(baseline.length > 0, true);
for (const row of baseline) assert.equal(row.note, BASELINE_NOTE);
const liveLines = lineCount(fs.readFileSync(path.join(repo, 'src/vacation/live-app-turn.mjs'), 'utf8'));
const liveRow = baseline.find((row) => row.rule === 'FILE-SIZE-500' && row.file === 'src/vacation/live-app-turn.mjs');
assert.equal(liveRow.symbol, `lines:${liveLines}`);

const repoRun = runGuard(repo);
assert.equal(repoRun.status, 0, repoRun.stderr);
assert.match(repoRun.stdout, /RULE\tMODEL-CLIENT-ONLY\treport=\d+\tfail=0\t/);
assert.match(repoRun.stdout, /RULE\tSEARCH-MODULE-ONLY\treport=\d+\tfail=0\t/);
assert.match(repoRun.stdout, /RULE\tNO-EMPTY-CATCH\treport=\d+\tfail=0\t/);
assert.match(repoRun.stdout, /RULE\tNO-FLOATING-PROMISE\treport=\d+\tfail=0\t/);
assert.match(repoRun.stdout, /RULE\tNO-WORKAROUND-COMMENTS\treport=0\tfail=0\t/);
assert.match(repoRun.stdout, /RULE\tFILE-SIZE-500\treport=\d+\tfail=0\t/);
assert.match(repoRun.stdout, /RULE\tTEST-TRIP-LITERALS\treport=\d+\tfail=0\t/);
assert.match(repoRun.stdout, /RULE\tDEAD-CODE\treport=\d+\tfail=0\t/);
assert.match(repoRun.stdout, /REPORT\tMODEL-CLIENT-ONLY\tsrc\/vacation\/poi-search\.mjs:\d+\topenrouter\.ai/);
assert.match(repoRun.stdout, /REPORT\tSEARCH-MODULE-ONLY\tscripts\/trek-itinerary-edit\.mjs:\d+\tnominatim/);
assert.match(repoRun.stdout, /REPORT\tNO-EMPTY-CATCH\tsrc\/vacation\/web-access\.mjs:\d+\tempty-catch/);
assert.match(repoRun.stdout, /REPORT\tNO-FLOATING-PROMISE\tscripts\/void-stale-build\.mjs:\d+\tmain/);
assert.match(repoRun.stdout, new RegExp(`REPORT\\tFILE-SIZE-500\\tsrc/vacation/live-app-turn\\.mjs:1\\tlines:${liveLines}\\tflagged-to-split-by-feature`));
assert.match(repoRun.stdout, /REPORT\tTEST-TRIP-LITERALS\tscripts\/live-transcript-dialog-pdf\.mjs:\d+\tKimberly/);
assert.match(repoRun.stdout, /REPORT\tDEAD-CODE\tscripts\/vacation-app-reply-rules\.mjs:\d+\texport:assertBakeoffMap/);
assert.match(repoRun.stdout, /model client scripts\/vacation-app-reply-rules\.mjs/);
assert.match(repoRun.stdout, /search modules src\/vacation\/poi-search\.mjs/);
assert.match(repoRun.stdout, /code ratchet check passed \(\d+ report, 0 fail\)/);
assert.equal(repoRun.stderr, '');

process.stdout.write('code ratchet check test passed\n');
