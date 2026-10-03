#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const destinationCenter = readFileSync(new URL('../src/vacation/trip-destination-center.mjs', import.meta.url), 'utf8');
const assignSite = readFileSync(new URL('../src/vacation/trip-assign-site-url.mjs', import.meta.url), 'utf8');

assert.match(destinationCenter, /JSON\.stringify\(\{ destinationCenter: point \}\)\}::jsonb/);
assert.doesNotMatch(destinationCenter, /\|\| \$\{\{ destinationCenter:/);

assert.match(assignSite, /JSON\.stringify\(\{ publicSlug, intakeShare: true, publicUrl \}\)/);
assert.match(assignSite, /\$\{metadataPatch\}::jsonb/);
assert.doesNotMatch(assignSite, /\|\| \$\{\{ publicSlug,/);

console.log('test_trip_metadata_jsonb_sql: ok');
