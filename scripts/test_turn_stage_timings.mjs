#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replyStageMillis, turnStageTimings } from '../src/vacation/turn-stage-timings.mjs';
import { runPlaceProviderPass } from '../src/vacation/place-search-provider-pass.mjs';
import { TIERED_REPLY_TIMEOUT_MS } from '../scripts/vacation-app-reply-rules.mjs';

const timings = turnStageTimings({
  classifierMs: 1370.4,
  searchMs: 18000,
  judgeMs: 390,
  replyMs: -1,
  gateMs: 'no',
});
assert.deepEqual(Object.keys(timings), ['classifierMs', 'searchMs', 'judgeMs', 'replyMs', 'gateMs']);
assert.equal(timings.classifierMs, 1370);
assert.equal(timings.searchMs, 18000);
assert.equal(timings.judgeMs, 390);
assert.equal(timings.replyMs, null);
assert.equal(timings.gateMs, null);

const stages = replyStageMillis({
  model: { genLatencyMs: 9000, log: { latencyMs: { draft: 12307, jevDraft: 800, jevRewrite: 200 } } },
}, 40000);
assert.equal(stages.replyMs, 12307);
assert.equal(stages.judgeMs, 1000);
const wallOnly = replyStageMillis({}, 42.2);
assert.equal(wallOnly.replyMs, 42.2);
assert.equal(wallOnly.judgeMs, null);

assert.equal(TIERED_REPLY_TIMEOUT_MS, 20000);
assert.ok(TIERED_REPLY_TIMEOUT_MS < 60000);

const live = readFileSync(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(live, /jevAttempt < 2/);
assert.doesNotMatch(live, /attempt < 2 && !String\(reply/);
assert.doesNotMatch(live, /if \(!quality\?\.judged\) quality = await jevQualityRewrite/);
assert.doesNotMatch(live, /if \(!rewriteQuality\?\.judged\)/);
assert.doesNotMatch(live, /if \(!holdingQuality\?\.judged\)/);

const center = { lat: 20.925, lng: -156.69 };
let osmFinished = false;
let braveStartedAfterOsm = false;
const pass = await runPlaceProviderPass({
  fetchImpl: async () => { throw new Error('network'); },
  env: {},
  dest: 'Maui',
  lodging: 'Kaanapali',
  lodgingPoint: center,
  placeQueries: [{ category: 'restaurant', targetKind: 'category', query: 'taco spots' }],
  osmCategoryFilter: ['restaurant'],
  searchAnchor: null,
  relevanceContext: { area: 'Kaanapali', target: 'taco spots' },
  priorPlaces: [],
  selectPriorPlaces: () => [],
  priorRowsFromInput: (rows) => rows,
  queryOsm: async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
    osmFinished = true;
    throw new Error('OpenStreetMap Overpass failed: HTTP 504');
  },
  queryBrave: async () => {
    braveStartedAfterOsm = osmFinished;
    return {
      places: [{ title: 'Maui Taco', source: 'brave', lat: center.lat, lng: center.lng, category: 'restaurant' }],
      query: 'taco spots near Kaanapali',
      endpoint: 'local',
    };
  },
  mergePlaces: (groups) => groups.flat(),
  attachRelevance: async (rows) => ({ places: rows, rejections: [] }),
  readJson: async () => { throw new Error('no geocode'); },
  fail: (message) => { throw new Error(message); },
});

assert.equal(braveStartedAfterOsm, false);
assert.equal(pass.status, 'ok');
const providers = pass.providerLog.map((row) => row.provider);
const osmAt = providers.indexOf('osm');
const braveAt = providers.indexOf('brave');
assert.ok(osmAt >= 0 && braveAt > osmAt);
const osm = pass.providerLog.find((row) => row.provider === 'osm');
assert.equal(osm.status, 'error');
assert.equal(osm.httpStatus, 504);
const brave = pass.providerLog.find((row) => row.provider === 'brave');
assert.equal(brave.status, 'ok');
assert.equal(brave.resultCount, 1);

console.log(JSON.stringify({ ok: true, checked: 'turn-stage-timings', replyTimeoutMs: TIERED_REPLY_TIMEOUT_MS }));
