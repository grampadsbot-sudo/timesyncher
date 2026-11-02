import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runDossierFetchTask } from '../src/vacation/dossier-fetch-process.mjs';
import { topUpDossierFields } from '../src/vacation/dossier-fetch-tasks.mjs';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { computeDossierFieldHashes } from '../src/vacation/thing-dossier-fields.mjs';
import { dossierEmptyGatherReason } from '../src/vacation/xai-dossier-fill-state.mjs';
import { target, page, field, summary, description, judge } from './lib/dossier-round4-test-support.mjs';

const workerUrl = new URL('./fixtures/dossier-fetch-worker.mjs', import.meta.url);
const place = (workerFault) => ({ ...target, category: 'car', sourceRecord: { workerFault } });
const fetchTaskImpl = (operation, thing, options) => runDossierFetchTask(operation, thing, options, { workerUrl, timeoutMs: 1500 });
const store = () => ({
  rows: new Map(),
  async getDossier(key) { return structuredClone(this.rows.get(key) || null); },
  async putDossier(key, dossier) {
    const { hashes, sources } = computeDossierFieldHashes(dossier);
    this.rows.set(key, structuredClone({ ...dossier, fieldHashes: hashes, fieldSources: sources }));
  },
});

test('default worker runs the existing gather without provider keys', async () => {
  const result = await runDossierFetchTask('gather', { title: 'Offline car', category: 'car' }, { env: {}, deadline: Date.now() + 5000 });
  assert.deepEqual(result.pages, []);
  assert.ok(result.attempts.some((row) => row.status === 'missing_key'));
  assert.equal(result.attempts.some((row) => row.kind === 'fetch_worker'), false);
  const topped = await runDossierFetchTask('topUp', place('ok'), { env: {}, dossier: { pages: [page()], attempts: [] }, onlyFields: [] });
  assert.equal(topped.pages[0].sha256, page().sha256);
  assert.equal(topped.attempts.some((row) => row.kind === 'fetch_worker'), false);
});

for (const fault of ['search-crash', 'dns-crash', 'extract-crash', 'page-timeout', 'throw']) {
  test(`${fault} records a hard empty source and the fill loop visits the next row`, async () => {
    const storeImpl = store();
    let built = 0;
    const run = await runThingEvidenceDossierStagingTargets([
      { ...place(fault), placeId: `failed-${fault}` },
      { ...place('ok'), placeId: `next-${fault}` },
    ], {
      env: { XAI_API_KEY: 'parent-only' }, storeImpl, operatorFill: true, fetchTaskImpl,
      buildImpl: async () => { built += 1; return { findings: { summary: field(summary), description: field(description) } }; },
      judgeImpl: judge,
    });
    assert.equal(run.results.length, 2);
    const failed = run.results[0];
    const code = fault === 'page-timeout' ? 'fetch_worker_timeout' : fault === 'throw' ? 'fetch_worker_task_failed' : 'fetch_worker_exit';
    assert.equal(failed.failed, true);
    assert.equal(failed.emptySource, code);
    assert.equal(failed.error, code);
    const saved = await storeImpl.getDossier(failed.dossierKey);
    assert.equal(saved.emptySource, code);
    assert.notEqual(saved.captureCheckpoint, 'done');
    const attempt = saved.attempts.findLast((row) => row.kind === 'fetch_worker');
    assert.equal(attempt.error, code);
    if (code === 'fetch_worker_exit') assert.equal(attempt.exitCode, 23);
    assert.throws(() => process.kill(attempt.workerPid, 0), { code: 'ESRCH' });
    const next = await storeImpl.getDossier(run.results[1].dossierKey);
    assert.equal(run.results[1].pageCount, 1);
    assert.equal(run.results[1].failed, false);
    assert.equal(next.captureCheckpoint, 'done');
    assert.ok(next.attempts.some((row) => row.workerPid && row.workerPid !== process.pid));
    assert.equal(built, 1);
    assert.equal(JSON.stringify(saved).includes('test-only private detail'), false);
  });
}

test('anti-bot failure returns ordinary attempts through the child boundary', async () => {
  const dossier = await fetchTaskImpl('gather', place('blocked'), { env: {} });
  assert.deepEqual(dossier.pages, []);
  assert.ok(dossier.attempts.some((row) => row.error === 'evidence_page_http_403'));
  assert.equal(dossier.attempts.some((row) => row.kind === 'fetch_worker'), false);
  assert.ok(dossierEmptyGatherReason(dossier));
  assert.equal(dossierEmptyGatherReason({ attempts: [
    { kind: 'fetch_worker', status: 'failed', error: 'fetch_worker_exit' },
    { kind: 'brave', step: 'web_search', status: 'ok', results: 0 },
  ] }), 'brave_zero_hits');
});

test('a child crash retains acknowledged pages and the cumulative top-up ledger', async () => {
  const progress = [];
  const gathered = await fetchTaskImpl('gather', place('progress-crash'), { env: {}, onProgress: async (dossier) => progress.push(structuredClone(dossier)) });
  assert.equal(progress.length, 1);
  assert.equal(gathered.pages[0].sha256, page().sha256);
  assert.equal(gathered.emptySource, undefined);
  assert.equal(gathered.attempts.at(-1).error, 'fetch_worker_exit');
  const initial = { pages: [page()], attempts: [{ kind: 'gap_top_up', field: 'summary', attempt: 2, status: 'started' }] };
  const topped = await topUpDossierFields(initial, place('progress-crash'), { env: {}, fetchTaskImpl, onProgress: async () => {} });
  assert.equal(topped.pages[0].sha256, page().sha256);
  assert.deepEqual(topped.attempts[0], initial.attempts[0]);
  assert.equal(topped.attempts.at(-1).error, 'fetch_worker_exit');
  assert.equal(initial.attempts.length, 1);
});

test('deadline, launch and protocol failures stay named', async () => {
  const expired = await runDossierFetchTask('gather', place('ok'), { env: {}, deadline: Date.now() - 1 });
  assert.equal(expired.emptySource, 'fetch_worker_timeout');
  const missing = await runDossierFetchTask('gather', place('ok'), { env: {} }, { workerUrl: new URL('./fixtures/absent-worker.mjs', import.meta.url) });
  assert.equal(missing.emptySource, 'fetch_worker_exit');
  const unknown = await runDossierFetchTask('unknown', place('ok'), { env: {} });
  assert.equal(unknown.emptySource, 'fetch_worker_task_failed');
  const launch = await runDossierFetchTask('gather', place('ok'), { env: {} }, { workerUrl: new URL('https://invalid.example/worker') });
  assert.equal(launch.emptySource, 'fetch_worker_start_failed');
  const protocol = await fetchTaskImpl('gather', place('protocol'), { env: {} });
  assert.equal(protocol.emptySource, 'fetch_worker_protocol');
});

test('a parent checkpoint failure rejects instead of becoming emptySource', async () => {
  await assert.rejects(() => fetchTaskImpl('gather', place('progress-crash'), {
    env: {}, onProgress: async () => { throw new Error('checkpoint_write_failed'); },
  }), /checkpoint_write_failed/);
});
