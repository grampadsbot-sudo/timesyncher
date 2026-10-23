function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function categoryOf(place = {}) {
  return text(place.category || place.sourceRecord?.category).toLowerCase();
}

export function isBarOrRestaurant(place = {}) {
  const cat = categoryOf(place);
  return /restaurant|bar|dining|cafe|coffee|pub|brewery|bistro|brasserie|grill|pizzeria|bakery|eatery/.test(cat)
    || cat === 'restaurant' || cat === 'bar';
}

function isHotel(place = {}) {
  return /hotel|lodg|stay|inn|resort|hostel|motel/.test(categoryOf(place));
}

export function isFlightOrCarOrDecision(place = {}) {
  const cat = categoryOf(place);
  return cat === 'flight' || cat === 'car' || cat === 'decision' || cat === 'note';
}

function baseQuery(place = {}, destination = '') {
  const name = text(place.title || place.name);
  const dest = text(destination);
  return [name, dest].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function braveDossierQueryStages(place = {}, destination = '') {
  const q = baseQuery(place, destination);
  if (!q) return [];
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
  if (isBarOrRestaurant(place)) {
    stages.push({
      stage: 'happyHour',
      queries: [`${q} happy hour deals times`, `${q} site:yelp.com happy hour`],
    });
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
  phone: (q) => [`${q} phone number contact`, `${q} reservations phone`, `${q} site:yelp.com phone`],
  website: (q) => [`${q} official website`, `${q} homepage`, `${q} site: opentable.com`],
  googleRating: (q) => [`${q} site:google.com rating reviews`, `${q} google maps rating`, `${q} google reviews stars`],
  yelpRating: (q) => [`${q} site:yelp.com rating`, `${q} yelp stars review count`, `${q} yelp rating`],
  knownFor: (q) => [`${q} signature dish known for`, `${q} famous for menu specialty`, `${q} best known for`],
  ratings: (q) => TOPUP_BY_FIELD.googleRating(q),
};

export function topUpQueriesForField(field = '', place = {}, destination = '', attemptIndex = 0) {
  const q = baseQuery(place, destination);
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
