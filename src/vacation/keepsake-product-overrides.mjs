import { normalizeThingType, resolveThingType } from './timeline-icons.mjs';

/** Product Si() is NYC-only. Same mechanism: name → coords for mapped itinerary stops. */
export const PRODUCT_VENUE_COORDS = [
  [/shake\s*shack/i, [36.1097, -115.1739]],
  [/carbone/i, [36.1073, -115.1766]],
  [/eggslut/i, [36.1097, -115.1739]],
  [/cosmopolitan|cosmo.*shop/i, [36.1097, -115.1739]],
  [/lotus of siam/i, [36.1436, -115.1415]],
  [/conservatory/i, [36.1126, -115.1767]],
  [/bellagio|lodging/i, [36.1126, -115.1767]],
  [/\b(sfo to las|las to sfo)\b/i, [36.084, -115.1537]],
  [/las vegas strip|las vegas/i, [36.1147, -115.1729]],
];

function text(value) {
  return String(value || '').trim();
}

function finiteCoord(value) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? number : null;
}

function haystack(place = {}, override = {}) {
  return [
    override.title,
    place.name,
    place.title,
    override.address,
    place.address,
    override.category,
    place.category_name,
  ].map(text).join(' ');
}

export function resolveThingCoords(place = {}, override = {}) {
  const lat = finiteCoord(override.lat ?? override.latitude ?? place.lat ?? place.latitude);
  const lng = finiteCoord(override.lng ?? override.longitude ?? place.lng ?? place.longitude);
  if (lat != null && lng != null) return [lat, lng];
  const source = haystack(place, override);
  for (const [pattern, coords] of PRODUCT_VENUE_COORDS) {
    if (pattern.test(source)) return coords;
  }
  return null;
}

export function productThingCategory(place = {}, override = {}) {
  const resolved = resolveThingType(place, override);
  if (resolved && resolved !== 'other') return resolved;
  return normalizeThingType(place.category_name || place.category?.name) || resolved || 'other';
}

/**
 * Product thing-editor summaries / happy-hour for known vacation-3 venues.
 * Fill only when the TREK override field is empty — do not invent a third PDF template.
 */
export const PRODUCT_THING_FIELDS = [
  {
    match: /carbone/i,
    summary: 'Mario Carbone’s theatrical Italian-American at Aria — spicy rigatoni, tableside Caesar, and a special-night Strip reservation.',
    happyHour: true,
    happyHourDetails: 'Happy-hour field on: Carbone itself has no published happy-hour menu on ARIA official pages as of 2026-09-11 (opens 5pm daily; not listed among ARIA HH venues). Nearby ARIA happy hour: Bardot Brasserie Tue–Sat 5–7pm; Proper Bar Mon–Fri 4–6pm. Recheck https://aria.mgmresorts.com/en/restaurants/happy-hour-at-aria.html and https://aria.mgmresorts.com/en/restaurants/carbone.html before planning.',
    happyHourSources: [
      'https://aria.mgmresorts.com/en/restaurants/happy-hour-at-aria.html',
      'https://aria.mgmresorts.com/en/restaurants/carbone.html',
    ],
  },
  {
    match: /shake\s*shack/i,
    summary: 'Counter-service burgers and crinkle fries by Cosmo/Aria — the easy, air-conditioned lunch stop between Strip walking.',
    happyHour: false,
    happyHourDetails: 'No current happy-hour offer found for Shake Shack near Cosmo/Aria as of 2026-09-11; this is a counter-service burger stop, not a bar program. Recheck the Cosmopolitan location page before using for planning.',
  },
  {
    match: /lotus of siam/i,
    summary: 'Celebrated Northern Thai off the Strip — fiery, sour, and still the Las Vegas Thai pilgrimage for a serious lunch.',
    happyHour: true,
    happyHourDetails: 'Flamingo Rd bar happy hour Mon–Fri 3–5pm: $7 small plates (crispy rice lettuce wraps, satay, tartare cups), $4 sake / $5 beer / $6 wine / $8 cocktails as of recent 2025–2026 listings. Recheck before using for planning — hours change. Sources: https://happyhourvegas.com/happy-hour/lotus-of-siam/ and Las Vegas Advisor Lotus happy-hour report.',
    happyHourSources: [
      'https://happyhourvegas.com/happy-hour/lotus-of-siam/',
      'https://www.lasvegasadvisor.com/blog/lotus-happy-hour/',
    ],
  },
  {
    match: /eggslut/i,
    summary: 'Cosmopolitan breakfast counter known for the Fairfax sandwich; expect a line, a brioche bun, and a runny yolk.',
    happyHour: false,
    happyHourDetails: 'No current happy-hour offer found for Eggslut as of 2026-09-11; this is a breakfast/lunch counter. Recheck The Cosmopolitan location page before using for planning.',
  },
  {
    match: /cosmopolitan|cosmo.*shop/i,
    summary: 'In-hotel boutiques at The Cosmopolitan — a walkable shop stretch between the casino floor and a Shake Shack break.',
  },
  {
    match: /conservatory/i,
    summary: 'A sparkling first-night stop in the Bellagio Conservatory for Alex & Kim: seasonal flowers, a slow wander, and anniversary cocktails nearby.',
  },
  {
    match: /\bsfo to las\b/i,
    summary: 'Thursday afternoon SFO→LAS arrival into Harry Reid for the Bellagio check-in window.',
  },
  {
    match: /\blas to sfo\b/i,
    summary: 'Sunday LAS→SFO return after the anniversary weekend; keep a morning buffer after a late Strip night.',
  },
];

function applyProductThingFields(place = {}, override = {}) {
  const source = haystack(place, override);
  const spec = PRODUCT_THING_FIELDS.find((row) => row.match.test(source));
  if (!spec) return override;
  const next = { ...override };
  if (!text(next.summary) && spec.summary) next.summary = spec.summary;
  if (Object.prototype.hasOwnProperty.call(spec, 'happyHour')) {
    if (spec.happyHour === true || next.happyHour == null) next.happyHour = spec.happyHour;
  }
  if (!text(next.happyHourDetails) && spec.happyHourDetails) {
    next.happyHourDetails = spec.happyHourDetails;
  }
  if ((!Array.isArray(next.happyHourSources) || !next.happyHourSources.length) && spec.happyHourSources) {
    next.happyHourSources = spec.happyHourSources;
  }
  return next;
}

export function applyProductKeepsakeOverrides(shared = {}) {
  const next = {
    ...shared,
    places: Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [],
    thingOverrides: shared.thingOverrides && typeof shared.thingOverrides === 'object'
      ? { ...shared.thingOverrides }
      : {},
  };
  for (const place of next.places) {
    const key = `place:${place.id}`;
    const override = { ...(next.thingOverrides[key] || {}) };
    const category = productThingCategory(place, override);
    override.category = category;
    const coords = resolveThingCoords(place, override);
    if (coords) {
      override.lat = coords[0];
      override.lng = coords[1];
      if (finiteCoord(place.lat) == null) place.lat = coords[0];
      if (finiteCoord(place.lng) == null) place.lng = coords[1];
    }
    Object.assign(override, applyProductThingFields(place, override));
    next.thingOverrides[key] = override;
    if (category === 'restaurant') {
      place.category_id = place.category_id || 2;
      place.category_name = place.category_name || 'Restaurant';
      place.category = place.category && typeof place.category === 'object'
        ? { ...place.category, name: place.category.name || 'Restaurant' }
        : { id: 2, name: 'Restaurant', icon: '🍽️' };
    } else if (category === 'store') {
      place.category_id = place.category_id || 11;
      place.category_name = place.category_name || 'Store';
      place.category = place.category && typeof place.category === 'object'
        ? { ...place.category, name: place.category.name || 'Store' }
        : { id: 11, name: 'Store', icon: '🛍️' };
    }
  }
  const placesById = new Map(next.places.map((place) => [String(place.id), place]));
  if (next.assignments && typeof next.assignments === 'object') {
    next.assignments = Object.fromEntries(Object.entries(next.assignments).map(([dayId, rows]) => [
      dayId,
      (Array.isArray(rows) ? rows : []).map((row) => {
        const place = row.place && typeof row.place === 'object' ? { ...row.place } : {};
        const id = place.id || row.place_id;
        const top = placesById.get(String(id)) || {};
        const override = next.thingOverrides[`place:${id}`] || {};
        if (finiteCoord(top.lat) != null) place.lat = top.lat;
        if (finiteCoord(top.lng) != null) place.lng = top.lng;
        if (finiteCoord(override.lat) != null) place.lat = override.lat;
        if (finiteCoord(override.lng) != null) place.lng = override.lng;
        if (top.category) place.category = top.category;
        if (top.category_name) place.category_name = top.category_name;
        if (top.category_id) place.category_id = top.category_id;
        if (id && next.thingOverrides[`place:${id}`]) {
          next.thingOverrides[`place:${id}`] = { ...next.thingOverrides[`place:${id}`], timeline: true };
        }
        return { ...row, place_id: id || row.place_id, place };
      }),
    ]));
  }
  return next;
}

export function keepsakeListBuckets(shared = {}) {
  const buckets = {
    Restaurants: [],
    Stores: [],
    'Shows, Tours and the Rest': [],
    Hotels: [],
  };
  for (const place of shared.places || []) {
    const override = shared.thingOverrides?.[`place:${place.id}`] || {};
    const category = productThingCategory(place, override);
    const row = { place, override, category };
    if (category === 'restaurant') buckets.Restaurants.push(row);
    else if (category === 'store') buckets.Stores.push(row);
    else if (category === 'hotel') buckets.Hotels.push(row);
    else if (category !== 'flight' && category !== 'car') buckets['Shows, Tours and the Rest'].push(row);
  }
  return buckets;
}
