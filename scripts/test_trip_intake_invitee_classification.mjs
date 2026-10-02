#!/usr/bin/env node
import assert from 'node:assert/strict';
import { classifyTripIntake } from '../src/vacation/trip-intake-classify.mjs';

const env = { OPENROUTER_API_KEY: 'test-key', JEV_ROUTER_MODEL: 'test/jev-router' };

function extractionJson(overrides = {}) {
  return JSON.stringify({
    turnKind: 'other',
    target: '',
    anchor: '',
    anchorIsLodging: false,
    category: '',
    question: '',
    things: [],
    roster: [],
    inviteeName: 'Kim',
    inviteeEmail: 'kim.rivera.sct@agentmail.to',
    destination: '',
    hasDates: false,
    startDate: '',
    endDate: '',
    title: '',
    ...overrides,
  });
}

const fetchImpl = async (url) => {
  const href = String(url);
  if (href.includes('/decisions')) {
    return { ok: true, json: async () => ({ answers: { trip_intake: { noul: 0.12 } } }) };
  }
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: extractionJson() } }],
    }),
  };
};

const classification = await classifyTripIntake({
  text: 'my wife Kim, kim.rivera.sct@agentmail.to',
  env,
  fetchImpl,
});
assert.equal(classification.ok, true);
assert.equal(classification.inviteeName, 'Kim');
assert.equal(classification.inviteeEmail, 'kim.rivera.sct@agentmail.to');

console.log('test_trip_intake_invitee_classification: ok');
