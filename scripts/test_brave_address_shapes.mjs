#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { braveAddress, bravePlaceSearchRows, bravePoint, trimBraveResultEvidence } from '../src/vacation/brave-place-query.mjs';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/intake-lodging-brave/', import.meta.url));

function load(name) {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, 'utf8'));
}

const displayOnly = bravePlaceSearchRows(load('hyatt-display-address-only.json'), 'local')[0];
assert.match(braveAddress(displayOnly), /200 Nohea Kai/i);
assert.equal(bravePoint(displayOnly).lat, 20.9124823);

const classic = bravePlaceSearchRows(load('hyatt-regency-maui.json'), 'local')[0];
assert.ok(braveAddress(classic).includes('Lahaina'));

const locationShape = {
  title: 'Sample Resort',
  coordinates: [20.1, -156.2],
  location: { address: '1 Beach Walk', city: 'Lahaina', state: 'HI', postcode: '96761' },
};
assert.match(braveAddress(locationShape), /Beach Walk/);

const stringAddress = { title: 'Sample Inn', coordinates: [20.1, -156.2], address: '99 Main St, Kihei, HI' };
assert.equal(braveAddress(stringAddress), '99 Main St, Kihei, HI');

const evidence = trimBraveResultEvidence(displayOnly);
assert.ok(evidence.postal_address?.displayAddress);
assert.ok(Array.isArray(evidence.coordinates));

console.log('test_brave_address_shapes: ok');
