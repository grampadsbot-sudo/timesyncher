import {
  enrichSearchPlaceEventLogo,
  enrichSearchPlacesWithEventLogos,
  eventLogoMatchesWebsite,
  eventLogoSearchQuery,
  placeNeedsEventLogoSearch,
  sharedUnrelatedEventLogoFailures,
} from '../../src/vacation/search-event-logo.mjs';
import { buildPr336VkSearchPlacesByRowId } from '../fixtures/pr336-vk-search-trip-sources.mjs';

const GATE_B_EVENT_ROWS = [
  { id: 604, name: 'Statue of Liberty walking tour', cat: 'activity' },
  { id: 606, name: 'Afternoon matinee show', cat: 'activity' },
  { id: 607, name: 'Friend meetup at Bryant Park', cat: 'activity' },
  { id: 611, name: 'Jazz at Lincoln Center', cat: 'activity' },
];

/** Dedicated event-logo source checks for #388 (invoked from VK contract test). */
export async function assertVkSearchEventLogoSource(assert) {
  assert.match(eventLogoSearchQuery('Afternoon matinee show', 'New York'), /official website/i);
  assert.equal(
    eventLogoMatchesWebsite({
      logoUrl: 'https://www.tdf.org/favicon.ico',
      website: 'https://www.tdf.org/discount-ticket-programs/tkts-by-tdf/',
    }),
    true,
  );
  assert.equal(
    eventLogoMatchesWebsite({
      logoUrl: 'https://example.com/favicon.ico',
      website: 'https://other-brand.org/',
    }),
    false,
  );

  const matineeSearchImpl = async () => ({
    results: [{
      title: 'TKTS by TDF',
      url: 'https://www.tdf.org/discount-ticket-programs/tkts-by-tdf/',
      content: 'Official TKTS booth site https://www.tdf.org/discount-ticket-programs/tkts-by-tdf/ sells same-day Broadway matinee tickets.',
    }],
  });

  const enrichedMatinee = await enrichSearchPlaceEventLogo({
    category: 'activity',
    title: 'Afternoon matinee show',
    address: 'Times Square, New York, NY',
  }, {
    destination: 'New York',
    searchImpl: matineeSearchImpl,
  });

  assert.equal(placeNeedsEventLogoSearch(enrichedMatinee), false);
  assert.match(enrichedMatinee.logoUrl, /tdf\.org\/favicon\.ico/i);
  assert.match(enrichedMatinee.sourceRecord.logoSearchEvidence.website, /tdf\.org/i);
  assert.equal(enrichedMatinee.sourceRecord.logoSearchBlocked, undefined);

  const jazzSearchImpl = async () => ({
    results: [{
      title: 'Dizzy\'s Club',
      url: 'https://jazz.org/dizzys/',
      content: 'Jazz at Lincoln Center runs Dizzy\'s Club at https://jazz.org/dizzys/ with nightly sets.',
    }],
  });

  const eventLogoBatch = await enrichSearchPlacesWithEventLogos([
    { category: 'event', title: 'Afternoon matinee show', address: 'New York, NY' },
    { category: 'music', title: 'Jazz at Lincoln Center', address: 'New York, NY' },
  ], {
    destination: 'New York',
    searchImpl: async (query) => {
      if (/matinee/i.test(query)) return matineeSearchImpl();
      if (/jazz/i.test(query)) return jazzSearchImpl();
      return { results: [] };
    },
  });

  assert.equal(eventLogoBatch.places.length, 2);
  assert.notEqual(eventLogoBatch.places[0].logoUrl, eventLogoBatch.places[1].logoUrl);
  assert.deepEqual(sharedUnrelatedEventLogoFailures(eventLogoBatch.places), []);

  const blockedEventLogo = await enrichSearchPlaceEventLogo({
    category: 'activity',
    title: 'Mystery pop-up with no web presence',
  }, {
    destination: 'New York',
    searchImpl: async () => ({ results: [] }),
  });
  assert.equal(blockedEventLogo.sourceRecord.logoSearchBlocked, 'no_official_website_found');
  assert.ok(Array.isArray(blockedEventLogo.sourceRecord.missingFields));
  assert.ok(blockedEventLogo.sourceRecord.missingFields.includes('logoUrl'));

  const sharedLogoFailures = sharedUnrelatedEventLogoFailures([
    {
      category: 'event',
      title: 'Venue A',
      logoUrl: 'https://shared.example/favicon.ico',
      sourceRecord: { logoUrl: 'https://shared.example/favicon.ico', url: 'https://venue-a.example/' },
    },
    {
      category: 'event',
      title: 'Venue B',
      logoUrl: 'https://shared.example/favicon.ico',
      sourceRecord: { logoUrl: 'https://shared.example/favicon.ico', url: 'https://venue-b.example/' },
    },
  ]);
  assert.ok(sharedLogoFailures.length > 0, 'unrelated rows must not share one logo');

  const gateBEventPlaces = buildPr336VkSearchPlacesByRowId(GATE_B_EVENT_ROWS);
  const eventLogos = new Set();
  for (const row of GATE_B_EVENT_ROWS) {
    const place = gateBEventPlaces[row.id];
    const logo = String(place.logoUrl || place.sourceRecord?.logoUrl || '').trim();
    assert.ok(logo, `gate-b event row ${row.id} must carry logoUrl from search source`);
    assert.ok(!eventLogos.has(logo), `gate-b event row ${row.id} must not reuse another row logo`);
    eventLogos.add(logo);
    const website = place.url || place.sourceRecord?.website || place.sourceRecord?.url;
    assert.equal(eventLogoMatchesWebsite({ logoUrl: logo, website }), true, `row ${row.id} logo must match website host`);
  }
}
