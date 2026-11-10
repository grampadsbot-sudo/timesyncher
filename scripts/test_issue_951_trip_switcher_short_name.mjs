#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appHtml = readFileSync(path.join(root, 'vacation-app.html'), 'utf8');
const itineraryRoute = readFileSync(path.join(root, 'routes/vacation-itinerary.mjs'), 'utf8');
const migrationPath = path.join(root, 'db/migrations/009_trips_short_name.sql');

assert.equal(existsSync(migrationPath), false, 'trips short_name migration must not ship under db/');
assert.match(itineraryRoute, /shortName:\s*cleanText\(metadata\.shortName/);
assert.doesNotMatch(itineraryRoute, /trips\.short_name/);
assert.match(appHtml, /function tripSwitcherShortName\(trip\)/);
assert.match(appHtml, /trip\?\.shortName \?\? trip\?\.short_name/);
assert.doesNotMatch(
  appHtml,
  /function tripTriggerInner\(trip\)[\s\S]{0,220}tripDates\(trip\)/,
  'closed trip trigger must not compose dates',
);
assert.doesNotMatch(
  appHtml,
  /function tripTriggerInner\(trip\)[\s\S]{0,220}tripTitle\(trip\)/,
  'closed trip trigger must not compose title from destination',
);
assert.match(appHtml, /@media \(max-width: 480px\)[\s\S]*\.trip-button \.trip-trigger-title[\s\S]*white-space: nowrap/);

console.log('issue #951 trip switcher short name checks passed');
