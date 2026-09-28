import assert from 'node:assert/strict';
import fs from 'node:fs';
import { hitsInFile, scanRepo } from './check-no-hardcoded-product-cosmetic.mjs';
import { captureThingLogo, sourceLogoUrl } from '../src/vacation/thing-logo-capture.mjs';
import { inferThingTypeFromText, resolveThingType } from '../src/vacation/timeline-icons.mjs';
import { sharedTripFromIntake } from '../src/vacation/intake-shared-trip.mjs';

const hits = scanRepo();
assert.deepEqual(hits, [], hits.map((hit) => `${hit.id} ${hit.file}:${hit.line} ${hit.excerpt}`).join('\n'));

const samples = [
  ['A19', 'src/vacation/thing-logo-capture.mjs', "Carbone: '/ts-thing-logos/carbone.svg',"],
  ['A19', 'src/vacation/thing-logo-capture.mjs', 'export const NAMED_THING_LOGOS = {};'],
  ['A21', 'src/vacation/timeline-icons.mjs', 'if (/\\b(las vegas|vegas)\\b/i.test(source)) return false;'],
  ['A21', 'src/vacation/timeline-icons.mjs', 'if (/marriott|bellagio/i.test(source)) return "hotel";'],
  ['A21', 'public/ts-timeline-icon-patch.js', 'if (/\\b(las vegas|vegas)\\b/i.test(source)) return false;'],
  ['A22', 'index.html', 'placeholder="Las Vegas"'],
  ['A22', 'order-test.html', "placeholder='Las Vegas'"],
  ['C13', 'vacation-app.html', "if (key === 'vegas anniversary' && !hasPlan) return true;"],
  ['D9', 'src/vacation/intake-shared-trip.mjs', "return { category_name: 'Attraction', category_icon: '🏛️', category: 'other' };"],
  ['D10', 'src/vacation/intake-shared-trip.mjs', 'total_price: null,'],
  ['D10', 'src/vacation/intake-shared-trip.mjs', 'share_budget: true,'],
];
for (const [id, file, line] of samples) {
  const found = hitsInFile(file, line);
  assert.ok(found.some((hit) => hit.id === id), `${id} sample was not caught: ${line}`);
}

assert.equal(captureThingLogo({ name: 'Sample Place' }, { title: 'Sample Place' }), '');
assert.equal(sourceLogoUrl({ source: { logo: 'https://cdn.example/mark.svg' } }), 'https://cdn.example/mark.svg');
assert.equal(sourceLogoUrl({ source: { favicon: 'https://cdn.example/favicon.ico' } }), 'https://cdn.example/favicon.ico');
assert.equal(sourceLogoUrl({ website: 'https://cafe.example/menu' }), 'https://cafe.example/favicon.ico');
assert.equal(sourceLogoUrl({ website: 'https://maps.google.com/maps?q=place' }), '');
assert.equal(inferThingTypeFromText('Bellagio'), '');
assert.equal(inferThingTypeFromText('Marriott'), '');
assert.equal(resolveThingType({ name: 'Bellagio', category_name: 'Hotel' }), 'hotel');

const tripId = 'eab1cbb1-5144-4be4-b856-92f0a3769db3';
const unlabeled = sharedTripFromIntake({
  trip: { id: tripId, title: 'Trip', start_date: '2026-04-03', end_date: '2026-04-03' },
  things: [{ id: 'blank', title: 'Open block' }],
});
assert.equal(unlabeled.places[0].category_name, '');
assert.deepEqual(unlabeled.budget, []);
assert.equal(unlabeled.permissions.share_budget, false);
const nullPrice = sharedTripFromIntake({
  trip: { id: tripId, title: 'Trip', start_date: '2026-04-03', end_date: '2026-04-03' },
  things: [{ id: 'blank', title: 'Open block', total_price: null, price: null }],
});
assert.deepEqual(nullPrice.budget, []);
assert.equal(nullPrice.permissions.share_budget, false);
const sourced = sharedTripFromIntake({
  trip: { id: tripId, title: 'Trip', start_date: '2026-04-03', end_date: '2026-04-03' },
  things: [{ id: 'cafe', category: 'activity', title: 'Cafe', source: { category: 'restaurant' }, total_price: 18 }],
});
assert.equal(sourced.places[0].category_name, 'Restaurant');
assert.equal(sourced.budget[0].total_price, 18);

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const order = fs.readFileSync(new URL('../order-test.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../vacation-app.html', import.meta.url), 'utf8');
assert.match(index, /placeholder="City"/);
assert.match(order, /placeholder="City"/);
assert.doesNotMatch(app, /vegas anniversary/i);

const workflow = fs.readFileSync(new URL('../.github/workflows/evidence-secrets.yml', import.meta.url), 'utf8');
assert.match(workflow, /check-no-hardcoded-product-cosmetic\.mjs/);

console.log('product cosmetic hard-code tests passed');
