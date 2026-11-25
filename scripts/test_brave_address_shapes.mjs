#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveVkSearchPlaceIdentity } from '../src/vacation/vk-search-place-identity.mjs';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/intake-lodging-brave/', import.meta.url));

function load(name) {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, 'utf8'));
}

const displayRaw = load('hyatt-display-address-only.json').results[0];
const displayResolved = await resolveVkSearchPlaceIdentity(
  { ...displayRaw, url: displayRaw.url || 'https://www.hyatt.com/en-US/hotel/hawaii/hyatt-regency-maui-resort-and-spa/oggrm' },
  { category: 'hotel', env: {} },
);
assert.equal(displayResolved.ok, true);
assert.match(displayResolved.place.address, /200 Nohea Kai/i);
assert.equal(displayResolved.place.lat, 20.9124823);

const classicRaw = load('hyatt-regency-maui.json').results[0];
const classicResolved = await resolveVkSearchPlaceIdentity(
  { ...classicRaw, url: classicRaw.url || 'https://www.hyatt.com/en-US/hotel/hawaii/hyatt-regency-maui-resort-and-spa/oggrm' },
  { category: 'hotel', env: {} },
);
assert.equal(classicResolved.ok, true);
assert.ok(classicResolved.place.address.includes('Lahaina'));

const locationShape = await resolveVkSearchPlaceIdentity({
  title: 'Sample Resort',
  url: 'https://sample-resort.example/',
  coordinates: [20.1, -156.2],
  location: { address: '1 Beach Walk', city: 'Lahaina', state: 'HI', postcode: '96761' },
}, { category: 'hotel', env: {} });
assert.equal(locationShape.ok, true);
assert.match(locationShape.place.address, /Beach Walk/);

const stringAddress = await resolveVkSearchPlaceIdentity({
  title: 'Sample Inn',
  url: 'https://sample-inn.example/',
  coordinates: [20.1, -156.2],
  address: '99 Main St, Kihei, HI',
}, { category: 'hotel', env: {} });
assert.equal(stringAddress.ok, true);
assert.equal(stringAddress.place.address, '99 Main St, Kihei, HI');

console.log('test_brave_address_shapes: ok');
