#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildResearchQueries, blockedPrivateSignals } from './vacation-public-research-worker.mjs';
import { loadAdapterRegistry, runApprovedSourceAdapters } from './travel-source-adapter-runner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const workerText = fs.readFileSync(path.join(here, 'vacation-public-research-worker.mjs'), 'utf8');
assert.doesNotMatch(workerText, /places\.googleapis\.com/);
assert.doesNotMatch(workerText, /live-google-places-new/);
assert.match(workerText, /house-radius-poi/);
assert.match(workerText, /live-grok-web-search/);
assert.match(workerText, /runApprovedSourceAdapters/);
assert.doesNotMatch(workerText, /TIMESYNCHER_PUBLIC_RESEARCH_FIXTURE/);
assert.doesNotMatch(workerText, /fixturePath/);
assert.doesNotMatch(workerText, /mode === 'fixture'/);

const artifacts = { destination: 'Tokyo', dates: { dateText: 'October' }, requestText: 'Plan Tokyo hotels ramen museums shopping flights and transport.' };
assert.ok(buildResearchQueries(artifacts).some((item) => item.category === 'flight'));
assert.ok(blockedPrivateSignals({ requestText: 'read my Gmail and book the hotel' }).length >= 2);

const registryPath = path.join(here, 'travel-source-adapter-registry.json');
const registry = loadAdapterRegistry(registryPath);
assert.deepEqual(registry.errors, []);
const goat = registry.registry.adapters.find((adapter) => adapter.id === 'printingpress-wanderlust-goat');
assert.equal(goat.enabled, false);
assert.equal(JSON.stringify(goat.secretFiles || {}).includes('GOOGLE_PLACES'), false);
const adapterRun = await runApprovedSourceAdapters({
  mode: 'fixture',
  registryPath,
  artifacts,
  destination: 'Tokyo',
  retrievedAt: new Date().toISOString(),
});
assert.equal(adapterRun.status, 'adapters_complete');
assert.ok(adapterRun.candidates.some((candidate) => candidate.adapterSources?.[0]?.adapterId === 'fixture-recent-traveler-sentiment'));
assert.equal(adapterRun.adaptersRun.some((row) => row.adapterId === 'printingpress-wanderlust-goat'), false);

console.log(JSON.stringify({ ok: true, checked: 'vacation-public-research-worker' }));
