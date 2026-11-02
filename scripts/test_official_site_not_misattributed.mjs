#!/usr/bin/env node
import assert from 'node:assert/strict';

import { pageNamesOtherVenue } from '../src/vacation/dossier-evidence-hydrate.mjs';

const boilerplate =
  "Friendly UWS Neighborhood Bar - e's BAR | e's BAR is your neighborhood joint with good food, drinks, games, and smiling people.";

const row672 = {
  id: 672,
  title: "e's BAR / The Dead Poet / Lilly's Cocktail & Wine",
  name: "e's BAR / The Dead Poet / Lilly's Cocktail & Wine",
  category: 'restaurant',
  url: 'https://e-barnyc.com/',
  website: 'https://e-barnyc.com/',
};

assert.equal(
  pageNamesOtherVenue({ url: 'https://e-barnyc.com/', text: boilerplate }, row672, { allowTargetMention: true }),
  false,
  'official-host page with Friendly UWS Neighborhood Bar boilerplate must not be misattributed',
);

assert.equal(
  pageNamesOtherVenue({ url: 'https://nymag.com/eats/bars', text: boilerplate }, row672, { allowTargetMention: true }),
  true,
  'same boilerplate on a third-party host is still stripped',
);

assert.equal(
  pageNamesOtherVenue({ url: 'https://www.e-barnyc.com/menu', text: boilerplate }, row672, { allowTargetMention: true }),
  false,
  'www. official host variant is kept',
);

assert.equal(
  pageNamesOtherVenue({ url: 'https://e-barnyc.com.evil.test/', text: boilerplate }, row672, { allowTargetMention: true }),
  true,
  'host that only contains official host as substring is still stripped',
);

console.log('test_official_site_not_misattributed: ok');
