import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractFailModes, markdownBody } from './dream-pass-fail-modes.mjs';
import { fixtureJobs, fixtureRows, negativeRows } from './fixtures/dream-pass-fail-modes.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dream-pass-'));
const since = '2026-10-27T00:00:00Z';
function writeJob(name, files) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir);
  for (const [file, text] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, file), text);
    fs.utimesSync(path.join(dir, file), new Date('2026-10-27T17:00:00Z'), new Date('2026-10-27T17:00:00Z'));
  }
  return dir;
}
try {
  const dirs = Object.entries(fixtureJobs).map(([name, files]) => writeJob(name, files));
  const report = extractFailModes([...dirs, dirs[0]], since);
  assert.equal(report.stats.jobs, 2);
  assert.equal(report.failModes.length, 7);
  for (const mode of report.failModes) {
    assert.equal(mode.rowEvidenceCount, 2, mode.id);
    assert.equal(mode.jobCount, 2, mode.id);
    assert.equal(mode.firstSeen, '2026-10-27T12:00:00.000Z', mode.id);
    assert.ok(mode.examples.some((entry) => entry.rowId !== null));
    const first = mode.evidence.find((entry) => entry.job === 'job-a' && entry.evidenceKind === 'row');
    assert.equal(first.lastSeen, '2026-10-27T13:00:00.000Z', mode.id);
    assert.equal(first.sources.length, 2, mode.id);
  }
  assert.equal(report.stats.malformedFiles, 2);
  assert.equal(report.stats.malformedRecords, 3);
  assert.equal(report.stats.unknownFiles, 2);
  assert.ok(report.stats.duplicateEvidence >= fixtureRows.length);
  assert.equal(report.failModes.find((mode) => mode.id === 'gather_no_pages').mentionCount, 1);
  assert.equal(report.failModes.find((mode) => mode.id === 'per_row_timeout').mentionCount, 1);
  assert.equal(report.failModes.find((mode) => mode.id === 'presented_fields_not_ok').mentionCount, 1);
  const named = writeJob('named-markers', { 'fill-calls.jsonl': report.failModes.map((mode, i) => JSON.stringify({ t: since, rowId: 100 + i, error: mode.id })).join('\n') });
  const namedReport = extractFailModes([named], since);
  for (const mode of namedReport.failModes) assert.equal(mode.count, 1, mode.id);
  const md = markdownBody(report);
  for (const mode of report.failModes) assert.ok(md.includes(`${mode.id} → ${mode.constraint}`));
  assert.ok(md.includes('Mentions are not measured failures'));
  assert.equal(extractFailModes([root], since).stats.jobs, 3);
  assert.deepEqual(extractFailModes([path.join(root, 'job-?')], since).failModes, report.failModes);
  const filtered = extractFailModes(dirs, '2026-10-27T15:30:00Z');
  for (const mode of filtered.failModes) assert.equal(mode.rowEvidenceCount, 1, mode.id);
  const negatives = writeJob('negatives', { 'fill-calls.jsonl': negativeRows.map((row) => JSON.stringify(row)).join('\n') });
  assert.ok(extractFailModes([negatives], since).failModes.every((mode) => mode.count === 0));
  const numericBudget = writeJob('numeric-budget', { 'RESULT.json': JSON.stringify({ results: [{ rowId: 30, timeoutMs: 45000, checkpoint: 'done', pageCount: 4 }] }) });
  assert.ok(extractFailModes([numericBudget], since).failModes.every((mode) => mode.count === 0));
  const mixedIds = writeJob('mixed-ids', { 'fill-calls.jsonl': `${JSON.stringify({ rowId: 41, error: 'gather_no_pages' })}\n${JSON.stringify({ rowId: '41', error: 'gather_no_pages' })}` });
  assert.equal(extractFailModes([mixedIds], since).failModes.find((mode) => mode.id === 'gather_no_pages').count, 1);
  const correlation = writeJob('correlation', {
    'fill-calls.jsonl': JSON.stringify({ t: '2026-10-27T12:00:00Z', placeId: 81, resp: "{'results': [{'rowId': 81, 'checkpoint': 'done', 'pageCount': 9}], 'batch': {'" }),
    'metrics-end.json': JSON.stringify({ as_of: '2026-10-27T13:00:00Z', inventory: { byType: { flight: 2, car: 1 } }, fillTargets: [{ placeId: 81, type: 'flight', needsFill: true }, { placeId: 82, type: 'flight', needsFill: false }] }),
  });
  const correlated = extractFailModes([correlation], since);
  assert.equal(correlated.failModes.find((mode) => mode.id === 'silent_done').rowEvidenceCount, 1);
  assert.equal(correlated.failModes.find((mode) => mode.id === 'flight_car_path_gap').count, 2);
  const healthy = writeJob('healthy-metrics', {
    'metrics-end.json': JSON.stringify({ inventory: { byType: { flight: 1, car: 1 } }, fillTargets: [{ rowId: 91, type: 'flight', needsFill: false }, { rowId: 92, type: 'car', needsFill: false }] }),
  });
  assert.ok(extractFailModes([healthy], since).failModes.every((mode) => mode.count === 0));
  const badMetrics = writeJob('bad-metrics', {
    'metrics-end.json': JSON.stringify({ fillTargets: [null, 42, {}, { rowId: 93, type: 'car', needsFill: true }] }),
    'metrics-start.json': JSON.stringify({ fillTargets: 'invalid' }),
  });
  const tolerated = extractFailModes([badMetrics], since);
  assert.equal(tolerated.stats.malformedFiles, 2);
  assert.equal(tolerated.stats.malformedRecords, 4);
  assert.equal(tolerated.failModes.find((mode) => mode.id === 'flight_car_path_gap').rowEvidenceCount, 1);
  assert.equal(extractFailModes([path.join(root, 'missing')], since).diagnostics.length, 1);
  assert.equal(extractFailModes([path.join(root, 'no-match-*')], since).diagnostics.length, 1);
  fs.symlinkSync(dirs[0], path.join(root, 'linked-job'));
  assert.equal(extractFailModes([path.join(root, 'linked-job')], since).stats.jobs, 0);
  assert.throws(() => extractFailModes(dirs, 'yesterday'), /ISO/);
  const json = path.join(root, 'output.json');
  const markdown = path.join(root, 'output.md');
  const run = spawnSync(process.execPath, ['scripts/dream-pass-fail-modes.mjs', '--root', path.join(root, 'job-*'), '--since', since, '--json', json, '--markdown', markdown], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(json, 'utf8')).failModes, report.failModes);
  assert.equal(fs.readFileSync(markdown, 'utf8'), md);
  const overwrite = spawnSync(process.execPath, ['scripts/dream-pass-fail-modes.mjs', dirs[0], '--since', since, '--json', path.join(dirs[0], 'RESULT.json'), '--markdown', markdown], { encoding: 'utf8' });
  assert.equal(overwrite.status, 1);
  assert.match(overwrite.stderr, /input artifact/);
  assert.equal(fs.readFileSync(path.join(dirs[0], 'RESULT.json'), 'utf8'), fixtureJobs['job-a']['RESULT.json']);
  const invalid = spawnSync(process.execPath, ['scripts/dream-pass-fail-modes.mjs', '--since'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Missing value/);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log('dream pass fail modes: all offline fixtures ok');
