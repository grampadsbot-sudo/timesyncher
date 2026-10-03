#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { sharedLiveTabListMountBundleExpr, sharedLiveTabListMountOutcome } from '../src/vacation/shared-live-tab-list-mount.mjs';
import { applySharedLiveTabBundlePatches } from '../src/vacation/trek-live-product-patches.mjs';
import { finalizeServedSharedTripPayload } from '../src/vacation/shared-trip-served-page.mjs';
import { sharedTripFromIntake, thingRecordFromTripRow } from '../src/vacation/intake-shared-trip.mjs';
import { applyCapturedLogos } from '../src/vacation/thing-logo-capture.mjs';

const R20_TIP = '73e91b2fe970aaae33411ef599281e1ffa4c03e4';
const bundleAtR20 = execFileSync('git', ['show', `${R20_TIP}:public/assets/index-BKun7ofk.js`], {
  maxBuffer: 25 * 1024 * 1024,
}).toString('utf8');

assert.match(bundleAtR20, /GBrain-assisted compare-and-summarize/);
assert.match(bundleAtR20, /vi\(kn,"hotels"\)/);

const patchedFromR20 = applySharedLiveTabBundlePatches(bundleAtR20, { served: true });
assert.doesNotMatch(patchedFromR20, /GBrain|Coming soon/);
assert.doesNotMatch(patchedFromR20, /vi\(kn,"hotels"\)/);
assert.match(patchedFromR20, /tsSharedLiveTabListMount\("hotels"\)/);
assert.match(patchedFromR20, /tsSharedLiveTabListMount\("cars"\)/);

const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
const patchedCommitted = applySharedLiveTabBundlePatches(committed, { served: true });
assert.equal(patchedCommitted, committed, 'committed served bundle must already include shared live-tab patches');

assert.equal(
  sharedLiveTabListMountBundleExpr(),
  'tsSharedLiveTabListMount=G=>{const lists=window.__TS_SHARED_LIVE_TAB_LISTS__;if(!lists||!Object.prototype.hasOwnProperty.call(lists,G))throw new Error("shared_live_tab_lists_missing:"+G);const h=lists[G];if(!Array.isArray(h))throw new Error("shared_live_tab_lists_invalid:"+G);if(!h.length)return null;return n.jsx("div",{"data-shared-live-tab-mount":G,dangerouslySetInnerHTML:{__html:`<ul data-shared-live-tab="${G}">${h.join("")}</ul>`},style:{display:"contents"}})}',
);

function intakeHotelsTwo() {
  const tripId = 'c15be2f6-d7bf-498a-b2e7-aa2b828dfab6';
  const things = [
    {
      id: '66f4916e-fe4e-4333-ba48-632696bcf139',
      category: 'lodging',
      title: 'Hyatt Regency Maui Resort & Spa',
      description: '',
      source: 'brave',
      location: { lat: 20.91, lng: -156.69, address: 'Kaanapali' },
      metadata: {
        categoryName: 'lodging',
        customerStatedLodging: true,
        sourceRecord: { url: 'https://hyatt.com/', source: 'brave' },
        logoUrl: 'https://hyatt.com/favicon.ico',
      },
    },
    {
      id: '5305492c-a1b5-4543-a4d8-d3e3fbe74523',
      category: 'lodging',
      title: "The Westin Maui Resort & Spa, Ka'anapali",
      description: '',
      source: 'brave',
      location: { lat: 20.91, lng: -156.69, address: 'Kaanapali' },
      metadata: {
        categoryName: 'lodging',
        customerStatedLodging: true,
        sourceRecord: { url: 'https://marriott.com/', source: 'brave' },
        logoUrl: 'https://marriott.com/favicon.ico',
      },
    },
  ].map((row) => thingRecordFromTripRow(row));
  return applyCapturedLogos(sharedTripFromIntake({
    trip: {
      id: tripId,
      title: 'Maui March 2027',
      destination: 'Maui',
      start_date: '2027-03-10',
      end_date: '2027-03-17',
      metadata: { intakeShare: true, publicSlug: 'intake-c15be2f6d7bf' },
    },
    things,
  }));
}

const twoHotels = intakeHotelsTwo();
const twoHotelPayload = finalizeServedSharedTripPayload(twoHotels);
assert.equal(twoHotelPayload.liveTabLists.hotels.length, 2);
const hotelsMount = sharedLiveTabListMountOutcome('hotels', twoHotelPayload.liveTabLists);
assert.equal(hotelsMount.kind, 'html');
assert.match(hotelsMount.html, /data-shared-live-tab="hotels"/);
const tinyLogos = [...hotelsMount.html.matchAll(/<img class="tiny-logo"/g)];
assert.equal(tinyLogos.length, 2);
assert.match(hotelsMount.html, /Hyatt Regency Maui Resort &amp; Spa/);
assert.match(hotelsMount.html, /Westin Maui/);

const emptyCars = sharedLiveTabListMountOutcome('cars', { hotels: twoHotelPayload.liveTabLists.hotels, cars: [] });
assert.equal(emptyCars.kind, 'empty');

const oneCarRow = finalizeServedSharedTripPayload(
  applyCapturedLogos(sharedTripFromIntake({
    trip: twoHotels.trip,
    things: [
      thingRecordFromTripRow({
        id: 'car-1',
        category: 'car',
        title: 'Sample Rental Co',
        description: '',
        source: 'brave',
        location: { lat: 20.89, lng: -156.43, address: 'OGG' },
        metadata: {
          categoryName: 'car',
          sourceRecord: { url: 'https://example.com/', source: 'brave' },
          logoUrl: 'https://example.com/favicon.ico',
        },
      }),
    ],
  })),
);
const carMount = sharedLiveTabListMountOutcome('cars', oneCarRow.liveTabLists);
assert.equal(carMount.kind, 'html');
assert.match(carMount.html, /data-shared-live-tab="cars"/);
assert.match(carMount.html, /<img class="tiny-logo"/);

const sharedApp = readFileSync(new URL('../shared-app.html', import.meta.url), 'utf8');
assert.doesNotMatch(sharedApp, /GBrain|Coming soon/);
assert.match(sharedApp, /__TS_SHARED_LIVE_TAB_LISTS__/);

console.log('shared trip served live tab mount tests passed');
