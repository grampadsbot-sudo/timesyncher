import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { centreLogoPng } from '../../../src/vacation/logo-ink-centre.mjs';
import { buildNycCraigKimDaybydayTrip } from '../../../scripts/fixtures/nyc-craig-kim-daybyday-trip.mjs';
import {
  carSubtitle,
  isDisplayNameFragment,
  opaqueCarNeedsBlank,
  rowSummary,
} from '../src/lib/listTabModel.mjs';

const INK_ALPHA = 16;

function paintGlyph(width, height, glyph, originX, originY) {
  const png = new PNG({ width, height });
  for (let y = 0; y < glyph.h; y += 1) {
    for (let x = 0; x < glyph.w; x += 1) {
      const i = ((originY + y) * width + (originX + x)) * 4;
      png.data[i] = 20;
      png.data[i + 1] = 40;
      png.data[i + 2] = 180;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function inkCentreDeltaY(buffer) {
  const png = PNG.sync.read(buffer);
  let sum = 0;
  let mass = 0;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.data[(y * png.width + x) * 4 + 3];
      if (alpha < INK_ALPHA) continue;
      sum += y * alpha;
      mass += alpha;
    }
  }
  assert.ok(mass > 0, 'logo fixture has ink');
  return sum / mass - png.height / 2;
}

const logoFixtures = [
  { name: 'ink-low', originY: 7 },
  { name: 'ink-high', originY: 3 },
  { name: 'ink-centred', originY: 5 },
];

for (const fixture of logoFixtures) {
  const raw = paintGlyph(18, 18, { w: 8, h: 8 }, 5, fixture.originY);
  const centred = centreLogoPng(raw, 18);
  const rawDelta = inkCentreDeltaY(raw);
  const centredDelta = inkCentreDeltaY(centred);
  if (fixture.name !== 'ink-centred') {
    assert.ok(Math.abs(rawDelta) > 0.5, `${fixture.name} fixture starts off centre (${rawDelta})`);
  }
  assert.ok(
    Math.abs(centredDelta) <= 0.5,
    `${fixture.name} ink centre ${centredDelta}px from box centre`,
  );
}

assert.equal(isDisplayNameFragment('Priceline opaque', 'Priceline opaque Standard sedan'), true);

const trip = buildNycCraigKimDaybydayTrip();
const car = trip.places.find((place) => place.name === 'Priceline opaque Standard sedan');
assert.equal(opaqueCarNeedsBlank(car, trip), true);
assert.equal(carSubtitle(car, trip), '');
assert.equal(rowSummary(car, trip), '');
assert.equal(rowSummary(car, trip).includes('Priceline opaque'), false);

console.log('logo ink centre and blank flagged rental checks passed');
