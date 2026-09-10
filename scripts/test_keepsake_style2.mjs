import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildStyle2Model, renderStyle2Html, realTripSummary, BOILERPLATE_RE } from '../src/vacation/keepsake-style2.mjs';
import { applyCapturedLogos, captureThingLogo, thingCreateLogoFields, isBoundStoryMediaUrl } from '../src/vacation/thing-logo-capture.mjs';
import { isAirplaneGlyph, timelineIcon } from '../src/vacation/timeline-icons.mjs';

const shared = {
  trip: {
    id: 197,
    title: 'Las Vegas Vacation',
    description: 'Anniversary weekend at the Bellagio with dinner, a show, Conservatory cocktails, Carbone, and Strip wandering.',
  },
  days: [
    { id: 1236, day_number: 1 },
    { id: 1237, day_number: 2 },
  ],
  thingOverrides: {
    'place:8871': { title: 'Bellagio Conservatory — Anniversary Cocktails', category: 'other', story: 'The air smelled like wet petals and cold gin.' },
    'place:8872': { story: 'Spicy rigatoni split down the middle.' },
    'place:8873': { story: 'Paper boat of fries after the heat.' },
    'place:8869': { title: 'Bellagio — Alex & Kim Anniversary Stay', category: 'hotel', story: 'Fountain spray lit gold outside the glass.' },
  },
  places: [
    { id: 8872, name: 'Carbone at Aria', category_name: 'Restaurant', category_icon: '🍽️', image_url: '/api/bind-thing-media?shareToken=x&id=1&raw=1' },
    { id: 8873, name: 'Shake Shack near Cosmo/Aria', category_name: 'Restaurant', category_icon: '🍽️' },
    { id: 8876, name: 'Cosmopolitan shops', category_name: 'Store', category_icon: 'ShoppingBag' },
    { id: 8871, name: 'Las Vegas restaurants, activities, and shopping research queue', category_name: 'Attraction', category_icon: '🏛️' },
    { id: 8869, name: 'Las Vegas lodging research queue', category_name: 'Hotel', category_icon: '🏨' },
    { id: 8877, name: 'SFO to LAS Thu Oct 9', category_name: 'Transport', category_icon: '🚌', address: 'SFO to LAS' },
  ],
  assignments: {
    1237: [
      { place: { id: 8872, name: 'Carbone at Aria', category_name: 'Restaurant' } },
      { place: { id: 8876, name: 'Cosmopolitan shops', category_name: 'Store' } },
    ],
  },
};

const bindings = [
  { id: 's1', thingId: 8872, thingName: 'Carbone', publicUrl: '/ts-thing-media/las-vegas-vacation-3/carbone-plates-photo.jpg', mimeType: 'image/jpeg', mediaKind: 'photo' },
  { id: 's2', thingId: 8871, thingName: 'Conservatory', publicUrl: '/ts-thing-media/las-vegas-vacation-3/conservatory-photo.jpg', mimeType: 'image/jpeg', mediaKind: 'photo' },
];

assert.equal(isBoundStoryMediaUrl('/api/bind-thing-media?shareToken=x&id=1&raw=1'), true);
assert.equal(captureThingLogo(shared.places[0], {}), '/ts-thing-logos/carbone.svg');
assert.equal(thingCreateLogoFields('Carbone at Aria', 'restaurant').logoUrl, '/ts-thing-logos/carbone.svg');
assert.equal(thingCreateLogoFields('Carbone at Aria', 'restaurant').icon, '🍽️');
assert.equal(thingCreateLogoFields('SFO to LAS', 'flight').isFlight, true);

const logos = applyCapturedLogos(shared);
assert.equal(logos.thingOverrides['place:8872'].logoUrl, '/ts-thing-logos/carbone.svg');
assert.equal(logos.thingOverrides['place:8872'].icon, '🍽️');
assert.ok(!isAirplaneGlyph(logos.thingOverrides['place:8876'].icon));
assert.equal(timelineIcon(shared.places[3], shared.thingOverrides['place:8871']).isFlight, false);

const summary = realTripSummary(shared);
assert.equal(BOILERPLATE_RE.test(summary), false);
assert.match(summary, /Bellagio|Carbone|anniversary/i);

const html = renderStyle2Html(shared, bindings, {
  origin: 'https://vacation-staging.timesyncher.com',
  shareToken: 'las-vegas-vacation-3',
});

assert.match(html, /data-style="2"/);
assert.match(html, /data-page="1"/);
assert.match(html, /data-stories-up-front="1"/);
assert.match(html, /Anniversary weekend at the Bellagio/);
assert.match(html, /Spicy rigatoni/);
assert.match(html, /wet petals/);
assert.match(html, /carbone\.svg/);
assert.match(html, /shake-shack\.svg/);
assert.match(html, /cosmopolitan-shops\.svg/);
assert.match(html, /bellagio-conservatory\.svg/);
assert.doesNotMatch(html, /brought together your day-by-day plan/);
assert.match(html, /data-icon-type="restaurant"/);
assert.match(html, /data-icon-type="store"/);
assert.match(html, /data-icon-type="flight"/);

const airplaneOnNonFlight = [...html.matchAll(/data-icon-type="(?!flight)[^"]+"[\s\S]{0,180}(?:✈️|&#9992;)/g)];
assert.equal(airplaneOnNonFlight.length, 0, 'no airplane on non-flight rows');

const model = buildStyle2Model(shared, bindings, 'https://vacation-staging.timesyncher.com');
assert.equal(model.airplaneAudit.length, 0);
assert.ok(model.stories.length >= 3);
assert.equal(model.isBoilerplate, false);

const overlay = await readFile(new URL('../public/ts-thing-media-overlay.js', import.meta.url), 'utf8');
assert.match(overlay, /style=2/);
assert.match(overlay, /report\/style-2/);

const patch = await readFile(new URL('../public/ts-timeline-icon-patch.js', import.meta.url), 'utf8');
assert.match(patch, /AIRPLANE/);
assert.match(patch, /keepsake/);
assert.match(patch, /style=2/);

const vercel = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
assert.match(vercel, /keepsakePdf/);
assert.match(vercel, /\/api\/pdf\/shared/);

const create = await readFile(new URL('../scripts/trek-itinerary-edit.mjs', import.meta.url), 'utf8');
assert.match(create, /captured_logo/);
assert.match(create, /image_url/);
assert.doesNotMatch(create, /airport\|las\|boi/);

console.log('keepsake style-2 tests passed');
