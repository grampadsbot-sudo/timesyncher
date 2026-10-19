import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  classifyDryRunRow,
  currentLogoUrl,
  dryRun463LogoRules,
  probeLogoUrl,
  summarizeDryRunRows,
} from './dryrun_463_logo_rules.mjs';
import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';

const sourceUrl = 'https://vacation-staging.timesyncher.com/api/shared/offline-463-test';
const asOf = '2026-10-17T22:45:00-07:00';

function sharedTrip(places) {
  return {
    trip: { id: '463-offline-trip' },
    places,
    thingOverrides: {},
    days: [{ id: 1 }],
  };
}

function place(id, name, website, logoUrl) {
  return { id, name, category_name: 'Restaurant', website, logoUrl };
}

function response(url, status, type) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: new Headers({ 'content-type': type }),
    text: async () => '',
    body: { cancel: async () => {} },
  };
}

test('probeLogoUrl classifies 404, 403, network errors, and non-image bodies', async () => {
  const cases = [
    {
      label: '404',
      fetch: async () => response('https://bad.example/missing.ico', 404, 'text/html'),
      expect: { ok: false, status: 404, error: 'http_404' },
    },
    {
      label: '403',
      fetch: async () => response('https://bad.example/forbidden.ico', 403, 'text/html'),
      expect: { ok: false, status: 403, error: 'http_403' },
    },
    {
      label: 'network',
      fetch: async () => { throw new Error('fetch failed'); },
      expect: { ok: false, status: null, error: 'fetch failed' },
    },
    {
      label: 'non-image',
      fetch: async () => response('https://bad.example/page.ico', 200, 'text/html'),
      expect: { ok: false, status: 200, error: 'non_image' },
    },
  ];
  for (const row of cases) {
    const probe = await probeLogoUrl('https://bad.example/logo.ico', row.fetch);
    assert.equal(probe.ok, row.expect.ok, row.label);
    assert.equal(probe.status, row.expect.status, row.label);
    assert.match(probe.error, new RegExp(row.expect.error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), row.label);
  }
});

test('classifyDryRunRow and summarizeDryRunRows count fix, blank, and unchanged', () => {
  const rows = [
    { change: classifyDryRunRow({ currentLogoUrl: 'https://a/x.ico', newLogoUrl: '', probe: { ok: false } }) },
    { change: classifyDryRunRow({ currentLogoUrl: '', newLogoUrl: 'https://a/ok.png', probe: { ok: false } }) },
    { change: classifyDryRunRow({ currentLogoUrl: 'https://a/same.png', newLogoUrl: 'https://a/same.png', probe: { ok: true } }) },
  ];
  assert.deepEqual(rows.map((row) => row.change), ['would-blank', 'would-fix', 'unchanged']);
  assert.deepEqual(summarizeDryRunRows(rows.map((row, index) => ({ ...row, id: index }))), {
    total: 3,
    wouldFix: 1,
    wouldBlank: 1,
    unchanged: 1,
  });
});

test('dryRun463LogoRules applies builder discovery with website_host_unresolvable and probe stubs', async () => {
  const site = 'https://dead-host.example/';
  const goodSite = 'https://venue.example/';
  const declared = 'https://venue.example/icon.png';
  const trip = sharedTrip([
    place(601, 'Dead host', site, 'https://dead-host.example/favicon.ico'),
    place(602, 'Good host', goodSite, 'https://venue.example/favicon.ico'),
  ]);
  const fetchImpl = async (url, options = {}) => {
    if (url === site) {
      const err = new TypeError('fetch failed');
      err.cause = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
      throw err;
    }
    if (url === goodSite) {
      return {
        ...response(goodSite, 200, 'text/html'),
        text: async () => '<link rel="icon" href="/icon.png">',
      };
    }
    if (options.headers?.accept === 'image/*' && String(url) === declared) {
      return response(declared, 200, 'image/png');
    }
    if (String(url).includes('favicon.ico')) {
      return response(url, 404, 'text/html');
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const probeFetchImpl = async (url) => {
    if (String(url).includes('dead-host')) return { url, ok: false, status: null, contentType: '', error: 'ENOTFOUND', finalUrl: '' };
    if (String(url).includes('favicon.ico')) return { url, ok: false, status: 404, contentType: 'text/html', error: 'http_404', finalUrl: url };
    return { url, ok: true, status: 200, contentType: 'image/png', error: '', finalUrl: url };
  };
  const result = await dryRun463LogoRules(trip, { sourceUrl, asOf, fetchImpl, probeFetchImpl });
  assert.equal(result.rows.length, 2);
  const dead = result.rows.find((row) => row.id === 601);
  const live = result.rows.find((row) => row.id === 602);
  assert.equal(dead.matchReason, 'website_host_unresolvable');
  assert.equal(dead.newLogoUrl, '');
  assert.equal(dead.change, 'would-blank');
  assert.equal(live.newLogoUrl, declared);
  assert.equal(live.change, 'would-fix');
  assert.equal(currentLogoUrl(trip, trip.places[1]), 'https://venue.example/favicon.ico');
  assert.equal(live.currentLogoProbe.error, 'http_404');
});

test('applyCapturedLogos and served finalize drop cross-domain favicon guesses', () => {
  const captured = applyCapturedLogos(sharedTripFromIntake({
    trip: { id: '463-serve-trip', title: 'Serve filter', destination: 'NYC', start_date: '2026-10-01', end_date: '2026-10-03' },
    things: [thingRecordFromTripRow({
      id: 801,
      category: 'restaurant',
      title: 'Mystery venue',
      description: '',
      metadata: {
        logoUrl: 'https://guessed.example/favicon.ico',
        sourceRecord: { website: 'https://venue.example/', url: 'https://venue.example/' },
      },
      location: { lat: 40.7, lng: -74.0 },
      source: 'brave',
    })],
  }));
  const place = captured.places[0];
  const override = captured.thingOverrides[`place:${place.id}`];
  assert.equal(place.logoUrl, undefined);
  assert.equal(override.logoUrl, undefined);
  const served = finalizeServedSharedTripPayload({
    places: [{
      id: 802,
      name: 'Carbone',
      category_name: 'Restaurant',
      logoUrl: 'https://juicegeneration.com/favicon.ico',
      website: 'https://carbonenewyork.com/',
    }],
    thingOverrides: {
      'place:802': {
        logoUrl: 'https://juicegeneration.com/favicon.ico',
        website: 'https://carbonenewyork.com/',
        url: 'https://carbonenewyork.com/',
      },
    },
  });
  assert.equal(served.places[0].logoUrl, undefined);
  assert.equal(served.thingOverrides['place:802'].logoUrl, undefined);
});
