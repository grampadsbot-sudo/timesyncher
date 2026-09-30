import assert from 'node:assert/strict';
import { applyCustomerNotes, intakeSpan } from '../src/vacation/live-app-turn.mjs';
import { applyThingPresentation, sharedTripFromIntake } from '../src/vacation/intake-shared-trip.mjs';
import {
  extractDestinationFromChat,
  openRouterDestinationComplete,
  resolveTripDestination,
} from '../src/vacation/trip-destination.mjs';

const saved = await resolveTripDestination({
  saved: 'Lisbon',
  texts: ['a customer turn'],
  complete: async () => {
    throw new Error('saved destination must not call the model');
  },
});
assert.equal(saved.destination, 'Lisbon');
assert.equal(saved.ask, false);
assert.equal(saved.source, 'saved-trip');

const extracted = await resolveTripDestination({
  saved: '',
  texts: ['the customer named a place'],
  complete: async (corpus) => {
    assert.match(corpus, /named a place/);
    return 'Lisbon';
  },
});
assert.equal(extracted.destination, 'Lisbon');
assert.equal(extracted.ask, false);
assert.equal(extracted.source, 'chat');

const missing = await resolveTripDestination({
  saved: '  ',
  texts: ['no place in this turn'],
  complete: async () => 'none',
});
assert.equal(missing.destination, '');
assert.equal(missing.ask, true);

await assert.rejects(
  () => resolveTripDestination({ saved: '', texts: ['hello'] }),
  /destination_extraction_unavailable/,
);
await assert.rejects(
  () => extractDestinationFromChat('hello', { complete: async () => { throw new Error('down'); } }),
  /destination_extraction_failed/,
);
await assert.rejects(
  () => extractDestinationFromChat('hello', { complete: async () => ({ ok: false, reason: 'model down' }) }),
  /model down/,
);
await assert.rejects(
  () => openRouterDestinationComplete('hello', {}),
  /destination_extraction_unavailable/,
);

const span = intakeSpan('We leave Friday April third and come home Sunday April twelfth, twenty twenty-six. The place was named in chat.');
assert.equal(span.destination, '');
assert.equal(span.placeTitle, undefined);
assert.equal(span.badge, 'Apr 3–12 2026');

const things = [
  { title: 'Gardens', category: 'activity', description: '', source: 'customer', notes: ['Gardens on Sunday.'], collaboratorNotes: [], who: '', whenLabel: '', customerWhen: '' },
  { title: 'Groceries', category: 'activity', description: '', source: 'customer', notes: ['Groceries the same day.'], collaboratorNotes: [], who: '', whenLabel: '', customerWhen: '' },
];
assert.ok(things.every((thing) => thing.description === ''));
assert.ok(things.every((thing) => thing.source === 'customer'));
assert.ok(things.every((thing) => Array.isArray(thing.notes) && thing.notes.length));

const noted = applyCustomerNotes(things, 'Sunday April fifth Gardens morning still works.', { collaborator: true, speakerName: 'Ada' });
const garden = noted.find((thing) => thing.title === 'Gardens');
assert.match(garden.collaboratorNotes[0], /Sunday April fifth/);
assert.equal(garden.description, '');
assert.equal(garden.source, 'customer');
assert.equal(garden.customerWhen, '');

const shared = sharedTripFromIntake({
  trip: { id: '11111111-1111-1111-1111-111111111111', title: 'Vacation', destination: 'Lisbon', start_date: '2026-04-03', end_date: '2026-04-04' },
  things: [{ id: 'garden', title: 'Gardens', notes: ['Sunday garden'], source: 'customer' }],
});
const place = shared.places.find((row) => row.name === 'Gardens');
assert.equal(place.description, '');
assert.equal(place.notes, 'Sunday garden');
assert.equal(place.source, 'customer');
assert.equal(shared.thingOverrides[`place:${place.id}`].source, 'customer');
assert.equal(shared.thingOverrides[`place:${place.id}`].summary, undefined);

const shown = applyThingPresentation(shared, { windBackup: 'do not copy this into a thing' });
const shownGarden = shown.places.find((row) => row.name === 'Gardens');
assert.equal(shownGarden.description, '');
assert.equal(shownGarden.notes, 'Sunday garden');
assert.doesNotMatch(JSON.stringify(shownGarden), /do not copy this/);

console.log('g2c thing notes and destination passed');
