import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyTripIntake } from '../src/vacation/trip-intake-classify.mjs';
import { completeRosterParty } from '../src/vacation/live-app-turn.mjs';

const turnSource = fs.readFileSync(new URL('../src/vacation/live-app-turn.mjs', import.meta.url), 'utf8');
const partyStart = turnSource.indexOf('export function completeRosterParty');
const partyEnd = turnSource.indexOf('\nfunction ', partyStart);
const partySource = turnSource.slice(partyStart, partyEnd);
assert.doesNotMatch(partySource, /who is \(/);
assert.doesNotMatch(partySource, /can view/);
assert.doesNotMatch(partySource, /can edit/);
assert.doesNotMatch(partySource, /view\|look/);
assert.doesNotMatch(turnSource, /ageFromWords|AGE_WORDS/);

const sentence = 'Kai who is 7 can edit';

function rosterEntries(party) {
  return {
    primary: party.primary,
    collaborators: party.collaborators,
    preference_subjects: party.preference_subjects,
    viewers: party.viewers,
    editors: party.editors,
  };
}

const alone = completeRosterParty({
  turns: [{ role: 'customer', text: sentence }],
});
assert.deepEqual(rosterEntries(alone), {
  primary: null,
  collaborators: [],
  preference_subjects: [],
  viewers: [],
  editors: [],
});
assert.deepEqual(alone.sources, []);

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function mockFetch(roster) {
  return async (url) => {
    if (String(url).includes('/decisions')) {
      return jsonResponse({ answers: { trip_intake: { noul: 0.9 } } });
    }
    return jsonResponse({
      choices: [{
        message: {
          content: JSON.stringify({
            things: [],
            roster,
            destination: '',
            hasDates: false,
            title: '',
          }),
        },
      }],
    });
  };
}

const env = { OPENROUTER_API_KEY: 'test-key' };

const extracted = await classifyTripIntake({
  text: sentence,
  env,
  fetchImpl: mockFetch([
    { name: 'Kai', role: 'child', age: 4 },
    { name: 'Kai', role: 'viewer', age: null },
    { name: 'Kai', role: 'editor', age: null },
  ]),
});
assert.equal(extracted.ok, true);
assert.equal(extracted.rosterError, undefined);
const fromExtraction = completeRosterParty({
  turns: [{ role: 'customer', text: sentence }],
  roster: extracted.roster,
});
assert.deepEqual(fromExtraction.preference_subjects, [{ name: 'Kai', age: 4 }]);
assert.deepEqual(fromExtraction.viewers, [{ name: 'Kai' }]);
assert.deepEqual(fromExtraction.editors, [{ name: 'Kai' }]);
assert.deepEqual(fromExtraction.sources.map((item) => [item.field, item.value, item.source]), [
  ['preference_subjects.Kai', 4, 'chat_extraction'],
  ['viewers.Kai', 'viewer', 'chat_extraction'],
  ['editors.Kai', 'editor', 'chat_extraction'],
]);
assert.equal(fromExtraction.preference_subjects.some((kid) => kid.age === 7), false);

const missing = await classifyTripIntake({
  text: sentence,
  env,
  fetchImpl: mockFetch([
    { name: 'Kai', role: 'child', age: null },
  ]),
});
const unfilled = completeRosterParty({
  turns: [{ role: 'customer', text: sentence }],
  roster: missing.roster,
});
assert.deepEqual(unfilled.preference_subjects, [{ name: 'Kai' }]);
assert.deepEqual(unfilled.viewers, []);
assert.deepEqual(unfilled.editors, []);
assert.equal(unfilled.sources.some((item) => String(item.source).startsWith('customer:')), false);
