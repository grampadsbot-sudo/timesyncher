#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  applyCapturedLogos,
  resolveThingLogoUrl,
  sourceLogoUrl,
} from '../src/vacation/thing-logo-capture.mjs';

const STORED_CROSS_DOMAIN = 'https://juicegeneration.com/favicon.ico';
const WEBSITE = 'https://carbonenewyork.com/';
const OFFICIAL = 'https://carbonenewyork.com/wp-content/uploads/carbone-logo.png';
const PAGE_FAVICON = 'https://carbonenewyork.com/favicon.ico';

function carbonePlace(extra = {}) {
  return {
    id: 463,
    name: 'Carbone',
    category_name: 'Restaurant',
    website: WEBSITE,
    logoUrl: STORED_CROSS_DOMAIN,
    ...extra,
  };
}

function carboneOverride(extra = {}) {
  return {
    logoUrl: STORED_CROSS_DOMAIN,
    website: WEBSITE,
    url: WEBSITE,
    ...extra,
  };
}

const noOfficialPlace = carbonePlace();
const noOfficialOverride = carboneOverride();
assert.equal(sourceLogoUrl(noOfficialPlace, noOfficialOverride), STORED_CROSS_DOMAIN);
assert.notEqual(sourceLogoUrl(noOfficialPlace, noOfficialOverride), PAGE_FAVICON);

const captured = applyCapturedLogos({
  places: [noOfficialPlace],
  thingOverrides: { 'place:463': noOfficialOverride },
});
assert.equal(captured.places[0].logoUrl, STORED_CROSS_DOMAIN);
assert.equal(captured.thingOverrides['place:463'].logoUrl, STORED_CROSS_DOMAIN);

const officialSource = {
  website: WEBSITE,
  url: WEBSITE,
  logoUrl: OFFICIAL,
  logo: OFFICIAL,
};
const withOfficial = carbonePlace({ sourceRecord: officialSource });
const withOfficialOverride = carboneOverride({ sourceRecord: officialSource });
assert.equal(sourceLogoUrl(withOfficial, withOfficialOverride), OFFICIAL);
assert.equal(resolveThingLogoUrl(withOfficial, withOfficialOverride), OFFICIAL);

const capturedOfficial = applyCapturedLogos({
  places: [withOfficial],
  thingOverrides: { 'place:463': withOfficialOverride },
});
assert.equal(capturedOfficial.places[0].logoUrl, OFFICIAL);
assert.equal(capturedOfficial.thingOverrides['place:463'].logoUrl, OFFICIAL);

const websiteOnly = carbonePlace({ logoUrl: '', sourceRecord: { website: WEBSITE, url: WEBSITE } });
assert.equal(
  sourceLogoUrl(websiteOnly, { website: WEBSITE, url: WEBSITE }),
  PAGE_FAVICON,
);

process.stdout.write('dryrun 463 logo rules passed\n');
