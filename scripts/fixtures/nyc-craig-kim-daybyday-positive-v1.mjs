import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { finalizeServedSharedTripPayload } from '../../src/vacation/shared-trip-served-page.mjs';
import { buildNycCraigKimDaybydayTrip } from './nyc-craig-kim-daybyday-trip.mjs';
import { resolveNycCcabKey } from './nyc-vk-list-tab-rows.mjs';

export const NYC_POSITIVE_FIXTURE_VERSION = 'gate-b-nyc-positive-v1';
export const NYC_POSITIVE_FIXTURE_PROVENANCE =
  'Gate B offline verification fixture; synthetic prices and schedule notes are test-only unless copied from nyc_ccab_place_enrichment.json.';

const ENRICHMENT_BY_NAME = JSON.parse(
  readFileSync(new URL('./nyc_ccab_place_enrichment.json', import.meta.url), 'utf8'),
);

const ENRICHMENT_KEY_BY_PLACE_ID = {
  630: 'Flight option: Southwest LAS-LGA 2026-06-23 07:25-16:35',
  631: 'Flight option: Southwest LAS-LGA 2026-06-23 11:30-22:25',
  632: 'Flight option: Southwest LAS-LGA 2026-06-23 05:05-15:45',
  633: 'Flight option: Southwest LAS-LGA 2026-06-23 06:30-16:55',
  634: 'Flight option: Southwest LAS-LGA 2026-06-23 06:50-18:55',
};

const SYNTHETIC_BY_PLACE_ID = {
  601: {
    summary:
      'American Airlines nonstop LAS to JFK on Day 1 afternoon arrival; lands with time to reach the UWS hotel before dinner. Fixture lists $257 one-way fare per traveler for planning math only, not a verified live quote. Allow extra time for JFK baggage claim and AirTrain or taxi into Manhattan.',
    price: 257,
  },
  604: {
    summary:
      'Statue of Liberty walking tour with harbor views, security screening, and timed ferry access from Lower Manhattan. Fixture uses a $48 per-person planning estimate for tickets and guide fees; verify current operator pricing before purchase. Keep mobile tickets ready and arrive early for airport-style screening at the battery.',
    price: 48,
  },
  606: {
    summary:
      'Afternoon matinee show in Midtown during the Day 3 overlap window; tickets are held as a placeholder activity competing with the Bryant Park meetup. Fixture budget line uses $95 per seat for two travelers as synthetic test pricing only. Confirm show title, runtime, and will-call pickup before the 2:00 pm curtain.',
    price: 95,
  },
  607: {
    summary:
      'Friend meetup at Bryant Park on Day 3 with a 2:30 pm start and one-hour window before other Midtown plans. No admission fee is modeled; fixture price is $0 because this is a social calendar block rather than a paid reservation. Bring a phone charger and agree on the lawn or fountain side meeting spot in advance.',
    price: 0,
  },
  610: {
    summary:
      'Carbone dinner reservation in Greenwich Village with classic red-sauce Italian pacing and a hard-to-get evening table. Fixture assumes $95 per person for food and non-alcoholic drinks as synthetic test budgeting, not a live check average. Arrive on time; the dining room turns quickly and late arrivals can lose the slot.',
    price: 95,
  },
  611: {
    summary:
      'Blue Note Jazz Club evening set in the Village with will-call pickup and a 8:30 pm show time after dinner. Fixture ticket planning price is $85 per person including a modest service fee placeholder for Gate B budget math. Arrive early for security and seating; late sets can sell standing-room only.',
    price: 85,
  },
  608: {
    summary:
      'The Manhattan Club remains a list-only Hotels tab row while the PR336 VK snapshot keeps identity, logo, coordinates, and sourced nightly rate blocked because no ccab capture matches this title. Gate B positive capture still uses synthetic $389 nightly math here for offline budget screenshots only; that price is not VK source evidence and must not be treated as a booked or Manhattan Club reservation.',
    price: 389,
  },
  635: {
    summary:
      'American Airlines nonstop JFK to LAS on the final evening departure after Columbus Circle errands. Fixture uses $257 one-way per traveler for return-flight budget arithmetic only, not a verified live fare. Build in extra time for JFK security and AirTrain from Manhattan; evening weekday queues can run long.',
    price: 257,
  },
};

const TEST_ONLY_CAR = {
  summary:
    'Priceline opaque Toyota Corolla or similar at JFK Federal Circle; supplier name stays hidden until booking. Fixture pickup Jun 23 2026 10:00 at JFK rental shuttle, return Jun 30 2026 09:00 same facility; $172 total is synthetic test pricing only. Review toll, fuel, and cancellation terms before paying; do not treat counter reputation as verified.',
  price: 172,
  rentalCompany: 'Priceline opaque (test fixture)',
  vehicleClass: 'Toyota Corolla or similar',
  pickupLocation: 'JFK Federal Circle rental shuttle, Jamaica, NY (fixture test window Jun 23 2026 10:00)',
  returnLocation: 'JFK Federal Circle rental shuttle, Jamaica, NY (fixture test window Jun 30 2026 09:00)',
  startTime: '10:00',
  endTime: '09:00',
  rentalTermsNote:
    'Illustrative test-only terms: unlimited miles placeholder, refuel-to-full policy, LDW declined unless explicitly approved in chat.',
};

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function ensureMinWords(summary, minWords, tail = '') {
  let row = text(summary);
  const extra = text(tail);
  if (extra && !row.includes(extra)) row = row ? `${row} ${extra}` : extra;
  if (wordCount(row) >= minWords) return row;
  const note =
    'Fixture enrichment copy for Gate B offline verification; prices and reviews are planning placeholders unless marked source-backed.';
  if (!row.includes(note)) row = row ? `${row} ${note}` : note;
  return row;
}

function enrichmentForPlace(place = {}) {
  if (ENRICHMENT_KEY_BY_PLACE_ID[place.id]) {
    return ENRICHMENT_BY_NAME[ENRICHMENT_KEY_BY_PLACE_ID[place.id]] || null;
  }
  const ccabKey = resolveNycCcabKey(place.name);
  return ENRICHMENT_BY_NAME[ccabKey] || ENRICHMENT_BY_NAME[place.name] || null;
}

function storePrice(enrich, priorPrice) {
  if (priorPrice != null && priorPrice !== '') return priorPrice;
  if (enrich?.price != null && enrich.price !== '') return enrich.price;
  return 0;
}

function applyEnrichmentPatch(place, override, enrich, synthetic) {
  const next = { ...override };
  const summary = text(
    synthetic?.summary ||
      enrich?.summary ||
      enrich?.description ||
      next.summary,
  );
  if (summary) {
    const addressTail = enrich?.address ? `Address on file: ${text(enrich.address)}.` : '';
    const expanded = ensureMinWords(summary, 30, addressTail);
    next.summary = expanded;
    next.longDetails = text(enrich?.description || expanded);
  }
  if (synthetic?.price != null) next.price = synthetic.price;
  else if (next.price == null || next.price === '') {
    const cat = text(next.category || place.category_name).toLowerCase();
    if (cat === 'store') next.price = storePrice(enrich, next.price);
    else if (enrich?.price != null) next.price = enrich.price;
  }
  if (enrich?.website) next.website = enrich.website;
  if (enrich?.logoUrl) next.logoUrl = enrich.logoUrl;
  if (enrich?.address) {
    next.address = enrich.address;
    place.address = enrich.address;
  }
  if (enrich?.lat != null) {
    next.lat = enrich.lat;
    place.lat = enrich.lat;
  }
  if (enrich?.lng != null) {
    next.lng = enrich.lng;
    place.lng = enrich.lng;
  }
  if (synthetic) {
    for (const [key, value] of Object.entries(synthetic)) {
      if (key === 'summary' || key === 'price') continue;
      if (value != null && value !== '') next[key] = value;
    }
  }
  next.fixtureProvenance = NYC_POSITIVE_FIXTURE_PROVENANCE;
  return next;
}

export function buildNycCraigKimDaybydayTripPositiveV1() {
  const base = structuredClone(buildNycCraigKimDaybydayTrip());
  base.trip = {
    ...base.trip,
    metadata: {
      ...(base.trip?.metadata || {}),
      gateBNycFixtureVersion: NYC_POSITIVE_FIXTURE_VERSION,
      gateBNycFixtureProvenance: NYC_POSITIVE_FIXTURE_PROVENANCE,
    },
  };

  for (const place of base.places || []) {
    const key = `place:${place.id}`;
    const prior = base.thingOverrides[key] || {};
    const enrich = enrichmentForPlace(place);
    const synthetic = SYNTHETIC_BY_PLACE_ID[place.id] || null;
    let patch = applyEnrichmentPatch(place, prior, enrich, synthetic);
    if (Number(place.id) === 609) {
      patch = { ...patch, ...TEST_ONLY_CAR, timeline: false };
    }
    base.thingOverrides[key] = patch;
  }

  return finalizeServedSharedTripPayload(base);
}
