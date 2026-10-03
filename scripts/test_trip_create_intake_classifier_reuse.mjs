#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const itinerary = readFileSync(new URL('../routes/vacation-itinerary.mjs', import.meta.url), 'utf8');
const intake = readFileSync(new URL('../src/vacation/vacation-app-queue-intake.mjs', import.meta.url), 'utf8');
const turnTag = readFileSync(new URL('../src/vacation/vacation-app-turn-tag.mjs', import.meta.url), 'utf8');

assert.match(itinerary, /created\?\.classification\?\.ok === true/, 'trip create should pass classifier output into the queue turn');
assert.match(itinerary, /queueVacationAppTurn\(db, session, selected, body, intakePrefill\)/);
assert.match(itinerary, /resolveVacationAppQueueIntake/);
assert.match(intake, /if \(intakePrefill\?\.classification\?\.ok === true\)/);
assert.doesNotMatch(
  intake,
  /if \(intakePrefill[\s\S]{0,220}classifyVacationAppCustomerTurn/,
  'prefilled intake must skip a second classifier call',
);

assert.match(turnTag, /intakeTurn = classification\?\.ok === true && classification\?\.intake === true/);
assert.match(turnTag, /\|\| intakeTurn[\s\S]*classifyTurn\(/, 'intake turns must not await classifyTurnWithModel on the critical path');
assert.doesNotMatch(
  turnTag,
  /intakeTurn[\s\S]{0,120}await classifyTurnWithModel/,
  'intake turns must not await classifyTurnWithModel serially',
);

console.log('test_trip_create_intake_classifier_reuse: ok');
