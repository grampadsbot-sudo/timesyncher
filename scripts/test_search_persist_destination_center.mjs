#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolveSearchContext } from '../src/vacation/place-search-geocode.mjs';
import { installNoopNominatimStore } from './fixtures/nominatim-store-test-double.mjs';
import { urlIsNominatim } from './intake-lodging-test-hosts.mjs';

installNoopNominatimStore();

const tripId = 'cccccccc-cccc-4ccc-8ddd-eeeeeeeeeeee';
let updateSql = '';
const db = async (strings, ...values) => {
  const text = strings.join(' ');
  if (text.includes('update trips')) {
    updateSql = text;
    assert.match(text, /::jsonb/);
    assert.ok(values.some((v) => typeof v === 'string' && v.includes('destinationCenter')));
    return [];
  }
  throw new Error(text);
};

const providerLog = [];
const fetchImpl = async (url) => {
  if (!urlIsNominatim(String(url))) throw new Error(url);
  return {
    ok: true,
    json: async () => [{ lat: '20.8', lon: '-156.3', display_name: 'Maui, Hawaii' }],
  };
};

const context = await resolveSearchContext(
  fetchImpl,
  { lodging: '', lodgingPoint: null, destination: 'Maui', tripDestinationCenter: null },
  providerLog,
  null,
  () => {},
  { db, tripId },
);

assert.equal(context.center?.lat, 20.8);
assert.ok(updateSql.includes('destinationCenter'));

console.log('test_search_persist_destination_center: ok');
