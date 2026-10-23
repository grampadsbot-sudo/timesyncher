#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  scheduleMissingEvidenceCapturesForTrip,
  scheduleThingEvidenceCapture,
  thingWantsEvidenceCapture,
} from '../src/vacation/thing-evidence-capture-trigger.mjs';
import { listTripThingsMissingDossiers } from '../src/vacation/thing-evidence-dossier-execution.mjs';

assert.equal(thingWantsEvidenceCapture({ category: 'note', title: 'x' }), false);
assert.equal(thingWantsEvidenceCapture({ category: 'restaurant', title: 'x' }), true);

assert.equal(scheduleThingEvidenceCapture({ title: 'x' }, { env: {} }).reason, 'missing_xai_api_key');

const scheduled = await scheduleMissingEvidenceCapturesForTrip({
  trip: { id: 'trip-1', destination: 'NYC' },
  things: [{ id: 'p1', title: 'Cafe', category: 'restaurant' }],
  env: { XAI_API_KEY: 'test-key' },
});
assert.equal(scheduled.length, 1);

const listed = await listTripThingsMissingDossiers({
  env: {},
  dbImpl: async () => [],
});
assert.equal(listed.ok, true);
assert.deepEqual(listed.targets, []);

console.log('test_thing_evidence_capture_trigger: ok');
