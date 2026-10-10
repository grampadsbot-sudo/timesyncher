#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isGenericDescription } from '../src/vacation/trip-thing-enrichment.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const payload = JSON.parse(
  readFileSync(new URL('./fixtures/nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);

const names = Object.keys(payload);
assert.equal(names.length, 63, 'NYC ccab fixture should document 63 places');

const descriptions = names.map((name) => String(payload[name]?.description || '').trim());
assert.equal(descriptions.length, new Set(descriptions).size, 'each NYC fixture place needs a unique description');

for (const [name, record] of Object.entries(payload)) {
  const description = String(record?.description || '').trim();
  assert.ok(description, `missing description for ${name}`);
  assert.equal(isGenericDescription(description), false, `generic description for ${name}`);
  if (record?.website) {
    assert.ok(record.logoUrl, `logo expected when website exists: ${name}`);
  }
  if (record?.price != null) {
    assert.ok(Number(record.price) > 0, `price must be positive for ${name}`);
  }
}

console.log('nyc ccab fixture description tests passed');
