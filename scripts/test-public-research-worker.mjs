#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPublicResearch, buildResearchQueries, blockedPrivateSignals } from './vacation-public-research-worker.mjs';
import { loadAdapterRegistry, runApprovedSourceAdapters } from './travel-source-adapter-runner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const workerText = fs.readFileSync(path.join(here, 'vacation-public-research-worker.mjs'), 'utf8');
const runnerText = fs.readFileSync(path.join(here, 'travel-source-adapter-runner.mjs'), 'utf8');
assert.doesNotMatch(workerText, /places\.googleapis\.com/);
assert.doesNotMatch(workerText, /live-google-places-new/);
assert.doesNotMatch(workerText, /house-radius-poi/);
assert.doesNotMatch(workerText, /live-grok-web-search/);
assert.doesNotMatch(workerText, /runGrokResearch/);
assert.doesNotMatch(workerText, /TIMESYNCHER_GROK_BIN/);
assert.doesNotMatch(workerText, /\.local\/bin\/grok/);
assert.doesNotMatch(workerText, /Caldwell/);
assert.doesNotMatch(workerText, /[Pp]erplexity/);
assert.doesNotMatch(workerText, /TIMESYNCHER_PUBLIC_RESEARCH_FIXTURE/);
assert.doesNotMatch(workerText, /TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE/);
assert.doesNotMatch(workerText, /runApprovedSourceAdapters/);
assert.doesNotMatch(runnerText, /TIMESYNCHER_PUBLIC_RESEARCH_FIXTURE/);
assert.doesNotMatch(runnerText, /function fixtureRecentTravelerSentiment/);
assert.doesNotMatch(runnerText, /disabled_google_places_seed_removed/);
assert.doesNotMatch(runnerText, /TIMESYNCHER_GROK_BIN/);
assert.match(runnerText, /adapter\.fixtureOnly/);
assert.match(runnerText, /export async function searchBraveAndTavily/);

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
  fixturePath: path.join(here, 'missing-public-research-fixture.json'),
  registryPath,
  artifacts: {},
  retrievedAt: new Date().toISOString(),
});
assert.equal(adapterRun.candidates.some((candidate) => candidate.adapterSources?.[0]?.adapterId === 'fixture-recent-traveler-sentiment'), false);
assert.equal(adapterRun.adaptersRun.some((row) => row.adapterId === 'fixture-recent-traveler-sentiment'), false);
assert.equal(adapterRun.adaptersRun.some((row) => row.adapterId === 'printingpress-wanderlust-goat'), false);

const fixture = await runPublicResearch({
  mode: 'fixture',
  fixturePath: path.join(here, 'missing-public-research-fixture.json'),
  artifacts,
  fetchImpl: async () => {
    throw new Error('fixture mode must not search');
  },
});
assert.equal(fixture.status, 'no_wanted_things');
assert.deepEqual(fixture.things, []);
console.log(JSON.stringify({ ok: true, checked: 'vacation-public-research-worker', provider: fixture.provider }));
