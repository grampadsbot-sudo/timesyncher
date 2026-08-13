#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runPublicResearch, buildResearchQueries, blockedPrivateSignals } from './vacation-public-research-worker.mjs';
import { loadAdapterRegistry, runApprovedSourceAdapters } from './travel-source-adapter-runner.mjs';

const fixturePath = '/home/timesyncher-agent/timestopper-vacation-worker/public-research-fixture.json';
const workerText = fs.readFileSync('/home/timesyncher-agent/timestopper-vacation-worker/vacation-public-research-worker.mjs', 'utf8');
assert.match(workerText, /live-grok-web-search/);
assert.match(workerText, /--tools web_search/);
assert.match(workerText, /sudo', \['-n', '-u', 'ubishere9995'/);
assert.match(workerText, /runApprovedSourceAdapters/);
const artifacts = { destination: 'Tokyo', dates: { dateText: 'October' }, requestText: 'Plan Tokyo hotels ramen museums shopping flights and transport.' };
assert.ok(buildResearchQueries(artifacts).some((item) => item.category === 'flight'));
assert.ok(blockedPrivateSignals({ requestText: 'read my Gmail and book the hotel' }).length >= 2);
const registry = loadAdapterRegistry();
assert.deepEqual(registry.errors, []);
const adapterRun = await runApprovedSourceAdapters({ mode: 'fixture', artifacts, destination: 'Tokyo', retrievedAt: new Date().toISOString() });
assert.equal(adapterRun.status, 'adapters_complete');
assert.ok(adapterRun.candidates.some((candidate) => candidate.adapterSources?.[0]?.adapterId === 'fixture-recent-traveler-sentiment'));
const fixture = await runPublicResearch({ mode: 'fixture', fixturePath, artifacts });
assert.equal(fixture.status, 'first_pass_quality_gate_failed');
assert.equal(fixture.sourceBackedCandidateCount, 1);
assert.deepEqual(Object.keys(fixture.missingMinimums).sort(), ['rest', 'restaurant', 'store']);
assert.ok(fixture.candidates.every((candidate) => candidate.sourceBacked));
assert.ok(fixture.candidates.every((candidate) => candidate.sourceQuality?.sourceCount >= 1));
assert.ok(fixture.candidates.every((candidate) => candidate.verifiedAt && candidate.expiresAt));
assert.ok(fixture.rejectedCandidateCount >= 1);
const previousDisableLive = process.env.TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE;
process.env.TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE = '1';
const closed = await runPublicResearch({ artifacts: { destination: 'Caldwell, Idaho', requestText: 'Plan Caldwell restaurants stores and family activities.' } });
if (previousDisableLive === undefined) delete process.env.TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE;
else process.env.TIMESYNCHER_PUBLIC_RESEARCH_DISABLE_LIVE = previousDisableLive;
assert.equal(closed.status, 'source_backed_research_complete');
assert.equal(closed.provider, 'live-google-places-new');
assert.equal(closed.categoryCounts.restaurant, 15);
assert.equal(closed.categoryCounts.store, 10);
assert.equal(closed.categoryCounts.rest, 15);
assert.equal(closed.sourceBackedCandidateCount, 40);
assert.equal(closed.missingReviews.length, 0);
assert.equal(closed.missingHappyHour.length, 0);
assert.equal(closed.missingCoordinates.length, 0);
const smokeToken = `public-research-smoke-${Date.now()}`;
const dispatch = spawnSync(process.execPath, ['./product-gbrain-dispatch.mjs'], {
  input: JSON.stringify({ id: smokeToken, request_id: smokeToken, onboarding_token: smokeToken, request_text: 'Plan a public web researched vacation to Tokyo with hotels flights ramen shopping museums and airport transport.', payload: { vacationName: `Public Research Smoke ${Date.now()}`, unforgettableGoal: 'Prove the Vacation public research worker writes source-backed TREK candidates.' } }),
  env: { ...process.env, TIMESYNCHER_PUBLIC_RESEARCH_FIXTURE: fixturePath },
  encoding: 'utf8', timeout: 90000, maxBuffer: 3 * 1024 * 1024,
});
assert.equal(dispatch.status, 0, dispatch.stderr || dispatch.stdout);
const e2e = JSON.parse(dispatch.stdout);
assert.equal(e2e.result.researchSummary.status, 'first_pass_quality_gate_failed');
assert.equal(e2e.result.researchSummary.sourceBackedCandidateCount, 1);
const expectedPublicBase = (process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || 'https://vacation.timesyncher.com').replace(/\/+$/, '');
assert.match(e2e.result.webItineraryUrl, new RegExp(`^${expectedPublicBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/shared/`));
assert.match(e2e.customerResponse, /still needs more source-backed options/i);
assert.ok(JSON.stringify(e2e).includes('sourceQuality'));
console.log(JSON.stringify({ ok: true, checked: 'vacation-public-research-worker', placesFallbackCandidateCount: closed.sourceBackedCandidateCount, url: e2e.result.webItineraryUrl }));
