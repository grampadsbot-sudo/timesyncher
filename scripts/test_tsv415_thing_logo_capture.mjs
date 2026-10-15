#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  logoCaptureMissReason,
  NAMED_THING_LOGOS,
  sourceLogoUrl,
} from '../src/vacation/thing-logo-capture.mjs';

assert.equal(sourceLogoUrl({ name: 'Hertz', category_name: 'Car' }, { category: 'car' }), '');
assert.equal(logoCaptureMissReason({ name: 'Hertz', category_name: 'Car' }), 'no_place_website');
assert.equal(
  sourceLogoUrl({ name: 'Hertz', category_name: 'Car', url: 'https://www.hertz.com/rentacar' }),
  NAMED_THING_LOGOS.hertz,
);

process.stdout.write('tsv415 thing-logo-capture tests passed\n');
