import assert from 'node:assert/strict';
import { serveDossierFetchWorker } from '../../src/vacation/dossier-fetch-worker.mjs';
import { gatherThingEvidence } from '../../src/vacation/thing-evidence-dossier.mjs';
import { page } from '../lib/dossier-round4-test-support.mjs';

serveDossierFetchWorker({
  async gatherImpl(place, options) {
    assert.equal(process.env.XAI_API_KEY, undefined);
    assert.equal(options.env.XAI_API_KEY, undefined);
    const fault = place.sourceRecord?.workerFault;
    if (fault === 'throw') throw new Error('test-only private detail');
    if (fault === 'protocol') {
      process.send({ type: 'result', dossier: { pages: 'invalid', attempts: [] } });
      return new Promise(() => {});
    }
    if (fault === 'progress-crash') {
      await options.onProgress({ pages: [page()], attempts: [{ kind: 'page', status: 'ok', workerPid: process.pid }] });
      process.exit(23);
    }
    const injected = {
      ...options, braveImpl: null, sleepImpl: async () => {},
      env: fault === 'search-crash' ? { BRAVE_SEARCH_API_KEY: 'offline-fixture' } : {},
      resolveImpl: async () => {
        if (fault === 'dns-crash') process.exit(23);
        return [{ address: '93.184.216.34' }];
      },
      fetchImpl: async () => {
        if (fault === 'search-crash') process.exit(23);
        if (fault === 'page-timeout') return new Promise(() => {});
        return new Response(page().text, { status: ['blocked', 'extract-crash'].includes(fault) ? 403 : 200, headers: { 'content-type': 'text/html' } });
      },
      extractImpl: async () => {
        if (fault === 'extract-crash') process.exit(23);
        throw new Error('fixture_extract_denied');
      },
    };
    const dossier = await gatherThingEvidence(place, injected);
    dossier.attempts.push({ kind: 'page', status: 'ok', workerPid: process.pid });
    return dossier;
  },
  async topUpImpl(dossier, place, options) {
    await options.onProgress(dossier);
    if (place.sourceRecord?.workerFault === 'progress-crash') process.exit(23);
    return dossier;
  },
});
