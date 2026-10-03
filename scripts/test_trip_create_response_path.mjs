#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const itinerary = readFileSync(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');

assert.match(itinerary, /mergeTripCreateServerTiming/);
assert.match(itinerary, /serverTiming,/);
assert.match(itinerary, /createVacationMs/);
assert.match(itinerary, /queueTurnMs/);

console.log('test_trip_create_response_path: ok');
