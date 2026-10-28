#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  logoCaptureMissReason,
  NAMED_THING_LOGOS,
  sourceLogoUrl,
  resolveThingLogoUrl,
} from '../src/vacation/thing-logo-capture.mjs';
import { logoUrlForPlace } from '../apps/vacation-client/src/lib/listTabModel.mjs';

assert.equal(sourceLogoUrl({ name: 'Hertz', category_name: 'Car' }, { category: 'car' }), '');
assert.equal(logoCaptureMissReason({ name: 'Hertz', category_name: 'Car' }), 'no_place_website');
assert.equal(
  sourceLogoUrl({ name: 'Hertz', category_name: 'Car', url: 'https://www.hertz.com/rentacar' }),
  NAMED_THING_LOGOS.hertz,
);

const nested = { id: 41, metadata: { sourceRecord: { favicon: 'https://venue.example/icon.png' } } };
assert.equal(resolveThingLogoUrl(nested), 'https://venue.example/icon.png');
assert.equal(logoUrlForPlace(nested, {}), 'https://venue.example/icon.png');
assert.equal(sourceLogoUrl({ captured_logo_url: '/ts-thing-logos/venue.png' }), '/ts-thing-logos/venue.png');
assert.equal(sourceLogoUrl({}, { website: 'https://venue.example/visit' }), 'https://venue.example/favicon.ico');
assert.equal(resolveThingLogoUrl({ source_record: { logo: 'https://venue.example/brand.svg' } }), 'https://venue.example/brand.svg');
assert.equal(resolveThingLogoUrl(nested, { logoUrl: '/ts-thing-media/story.jpg' }), 'https://venue.example/icon.png');
assert.equal(resolveThingLogoUrl(nested, { logoUrl: 'https://venue.example/chosen.png' }), 'https://venue.example/chosen.png');
assert.equal(resolveThingLogoUrl({ name: 'Unnamed venue' }), '');

process.stdout.write('tsv415 thing-logo-capture tests passed\n');
