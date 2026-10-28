function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function categoryLabel(value = '') {
  const raw = value;
  if (raw && typeof raw === 'object') {
    return text(raw.name || raw.category_name || raw.slug || raw.label);
  }
  return text(raw);
}

function categoryOf(place = {}) {
  const fromRecord = place.sourceRecord && typeof place.sourceRecord === 'object'
    ? categoryLabel(place.sourceRecord.category || place.sourceRecord.category_name)
    : '';
  const direct = categoryLabel(place.category) || categoryLabel(place.category_name) || fromRecord;
  if (direct) return direct.toLowerCase();
  const title = text(place.title || place.name);
  if (/\b(flight|airline)\b/i.test(title) || /\b(LAS|JFK|LGA|EWR)\b/.test(title)) return 'flight';
  if (/\b(rental car|sedan|suv|opaque|priceline|hertz|avis)\b/i.test(title)) return 'car';
  return '';
}

export function dossierThingTitle(place = {}) {
  const title = text(place.title || place.name);
  return categoryOf(place) === 'flight' ? title.replace(/^Flight option:\s*/i, '') : title;
}

export function isBarOrRestaurant(place = {}) {
  const cat = categoryOf(place);
  return /restaurant|bar|dining|cafe|coffee|pub|brewery|bistro|brasserie|grill|pizzeria|bakery|eatery/.test(cat)
    || cat === 'restaurant' || cat === 'bar';
}

export function requiresHappyHourCapture(place = {}) {
  if (!isBarOrRestaurant(place)) return false;
  const cat = categoryOf(place);
  if (/jazz|music|club|nightclub|concert|venue|theater|theatre|matinee|show|cabaret/.test(cat)) return false;
  const title = text(place.title || place.name);
  if (/jazz club|nightclub|music hall|concert hall|cabaret|matinee|theatre|theater/i.test(title)) return false;
  return true;
}

function isHotel(place = {}) {
  return /hotel|lodg|stay|inn|resort|hostel|motel/.test(categoryOf(place));
}

export function isFlightOrCarOrDecision(place = {}) {
  const cat = categoryOf(place);
  return cat === 'flight' || cat === 'car' || cat === 'decision' || cat === 'note'
    || /^(transport|transportation|rental)$/.test(cat);
}

export function placeSupportsDossierReviews(place = {}) {
  return !isFlightOrCarOrDecision(place);
}

export function dossierSearchIdentity(place = {}, destination = '') {
  const name = dossierThingTitle(place);
  if (categoryOf(place) === 'flight') {
    const record = place.sourceRecord || {};
    const cleanName = name.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '').replace(/\b\d{1,2}:\d{2}(?:\s*[–—-]\s*\d{1,2}:\d{2})?\b/g, '');
    const airline = text(place.airline || record.airline || cleanName.split(/\b[A-Z]{3}\b/)[0]);
    const airports = [...new Set(`${place.route || record.route || ''} ${cleanName}`.match(/\b[A-Z]{3}\b/g) || [])];
    return [...new Set([airline, ...airports])].filter(Boolean).join(' ');
  }
  const dest = text(destination);
  return [name, dest].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function flightEvidenceMatchesTarget(page = {}, place = {}) {
  if (categoryOf(place) !== 'flight') return false;
  const title = dossierThingTitle(place);
  const record = place.sourceRecord || {};
  const airline = text(place.airline || record.airline || title.split(/\b[A-Z]{3}\b/)[0]).toLowerCase();
  const blob = text(page.text).toLowerCase();
  if (!airline || !blob.includes(airline)) return false;
  const airports = [...new Set(`${title} ${place.route || record.route || ''}`.match(/\b[A-Z]{3}\b/g) || [])];
  return airports.length >= 2 && airports.every((airport) => new RegExp(`\\b${airport}\\b`, 'i').test(blob));
}

export function braveDossierQueryStages(place = {}, destination = '') {
  const q = dossierSearchIdentity(place, destination);
  if (!q) return [];
  if (categoryOf(place) === 'flight') {
    let site = '';
    try { site = new URL(place.website || place.url || place.sourceRecord?.website || place.sourceRecord?.url).hostname; } catch { site = ''; }
    return [{ stage: 'general', queries: [
      `${q} nonstop route`, `${q} airline destinations airports`,
      ...(site ? [`${q} site:${site} route`] : [`${q} official airline route`]),
    ] }];
  }
  if (['flight', 'car'].includes(categoryOf(place))) {
    return [{ stage: 'general', queries: [
      `${q} official website booking`,
      `${q} ${categoryOf(place) === 'flight' ? 'route schedule fare baggage' : 'rental pickup return car class price'}`,
    ] }];
  }
  const stages = [
    {
      stage: 'general',
      queries: [
        `${q} official website menu description summary`,
        `${q} known for signature dish reviews articles`,
        `${q} itinerary visit tips what to order`,
      ],
    },
    {
      stage: 'reviews',
      queries: [
        `${q} site:yelp.com reviews`,
        `${q} site:tripadvisor.com reviews`,
        `${q} site:google.com reviews`,
        `${q} site:opentable.com reviews`,
        ...(isHotel(place) ? [`${q} site:booking.com reviews`] : []),
      ],
      review: true,
    },
    {
      stage: 'price',
      queries: [`${q} price menu cost per person`, `${q} average price entree`],
    },
    {
      stage: 'hours',
      queries: [`${q} hours open close`, `${q} opening hours today`],
    },
  ];
  if (requiresHappyHourCapture(place)) {
    stages.push({
      stage: 'happyHour',
      queries: [`${q} happy hour deals times`, `${q} site:yelp.com happy hour`],
    });
  }
  if (isFlightOrCarOrDecision(place)) {
    return stages.filter((stage) => !['hours', 'happyHour', 'reviews', 'price'].includes(stage.stage));
  }
  stages.push({
    stage: 'contact',
    queries: [
      `${q} address phone official website`,
      `${q} contact location neighborhood`,
    ],
  });
  return stages;
}

const TOPUP_BY_FIELD = {
  summary: (q) => [`${q} overview summary`, `${q} about description`, `${q} guide article`],
  description: (q) => [`${q} long review article`, `${q} detailed description`, `${q} what to expect`],
  itineraryNote: (q) => [`${q} visit tip short`, `${q} best time to go`, `${q} what to order highlight`],
  reviews: (q) => [
    `${q} site:yelp.com reviews`,
    `${q} site:reddit.com reviews`,
    `${q} site:tripadvisor.com reviews`,
  ],
  price: (q) => [`${q} menu prices`, `${q} cost average check`, `${q} price range`],
  hours: (q) => [`${q} hours`, `${q} open hours schedule`, `${q} site:yelp.com hours`],
  happyHour: (q) => [`${q} happy hour`, `${q} happy hour specials`, `${q} site:yelp.com happy hour`],
  happyHourDetails: (q) => TOPUP_BY_FIELD.happyHour(q),
  address: (q) => [`${q} address location`, `${q} site:yelp.com address`, `${q} map address`],
  phone: (q) => [`${q} phone number contact`, `${q} listed phone number`, `${q} site:yelp.com phone`],
  website: (q) => [`${q} official website`, `${q} homepage`, `${q} site: opentable.com`],
  googleRating: (q) => [`${q} site:google.com rating reviews`, `${q} google maps rating`, `${q} google reviews stars`],
  yelpRating: (q) => [`${q} site:yelp.com rating`, `${q} yelp stars review count`, `${q} yelp rating`],
  knownFor: (q) => [`${q} signature dish known for`, `${q} famous for menu specialty`, `${q} best known for`],
  ratings: (q) => TOPUP_BY_FIELD.googleRating(q),
};

export function topUpQueriesForField(field = '', place = {}, destination = '', attemptIndex = 0) {
  const q = dossierSearchIdentity(place, destination);
  const fn = TOPUP_BY_FIELD[field] || TOPUP_BY_FIELD.ratings;
  if (!fn || !q) return [];
  const all = fn(q);
  const idx = Math.max(0, Math.min(attemptIndex, all.length - 1));
  return [{ query: all[idx], field, attempt: attemptIndex + 1 }];
}

export function stageQueriesForFields(fields = [], place = {}, destination = '') {
  const want = new Set(fields);
  const out = [];
  for (const stage of braveDossierQueryStages(place, destination)) {
    const hit = stage.stage === 'happyHour' && (want.has('happyHour') || want.has('happyHourDetails'))
      || stage.stage === 'reviews' && (want.has('reviews') || want.has('googleRating') || want.has('yelpRating') || want.has('ratings'))
      || want.has(stage.stage)
      || (stage.stage === 'general' && (want.has('summary') || want.has('description') || want.has('itineraryNote') || want.has('knownFor')));
    if (!hit) continue;
    for (const query of stage.queries) out.push({ query, stage: stage.stage, review: stage.review === true });
  }
  return out;
}
