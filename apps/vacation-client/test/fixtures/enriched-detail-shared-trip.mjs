import { sharedTripFromIntake, thingRecordFromTripRow } from '../../../../src/vacation/intake-shared-trip.mjs';

export const ENRICHED_DETAIL_SLUG = 'intake-enriched-detail-fixture';

const SUMMARY =
  'Harbor Room earns repeat visits for crudo, handmade pasta, and a wine list that regulars praise for pairing flexibility. Reviews highlight attentive service, fair pricing for the neighborhood, and a lively dining room that still feels like a locals spot rather than a tourist trap.';

function reviewTexts(prefix) {
  return [
    `${prefix} reviewers praise the crudo and pasta for balance and texture even when the dining room is full and the bar stays busy with regulars waiting for tables.`,
    `${prefix} guests mention fair pricing, strong cocktails, and servers who know the menu without rushing tables through dessert even on busy Friday nights downtown.`,
    `${prefix} regulars call out the wine pairings, fresh seafood, and a kitchen that keeps sauces bright instead of heavy even during peak summer service hours.`,
    `${prefix} critics note one slower service night but still recommend the tasting menu, burrata, and patio seats when the weather cooperates along the waterfront.`,
  ];
}

function reviewFields(prefix, { compositeIndex = 0 } = {}) {
  const texts = reviewTexts(prefix);
  const sources = ['Google', 'Yelp', 'Google', 'TripAdvisor'];
  const ratings = ['4.8', '4.5', '4.7', '4.2'];
  const fields = {};
  texts.forEach((body, index) => {
    const n = index + 1;
    fields[`review${n}`] = body;
    fields[`review${n}Source`] = sources[index];
    fields[`review${n}Rating`] = ratings[index];
    if (compositeIndex === n) {
      fields[`review${n}Composite`] = true;
      fields[`review${n}CompositeLabel`] = `Composite of 120 Google/Yelp reviews`;
    }
  });
  fields.review_totals = {
    count: 820,
    average: 4.6,
    histogram: [12, 18, 44, 210, 536],
    sources: ['Google', 'Yelp'],
  };
  fields.summary = SUMMARY.replace('Harbor Room', prefix);
  fields.longDetails = fields.summary;
  fields.summarySourceUrls = [
    `https://example-${prefix.toLowerCase().replace(/\s+/g, '-')}.example.com/`,
    'https://www.nytimes.com/example-review',
  ];
  fields.googleRating = '4.6';
  fields.googleReviewCount = '820';
  fields.yelpRating = '4.4';
  fields.yelpReviewCount = '410';
  fields.phone = '(212) 555-0101';
  fields.hours = 'Mon–Sat 5pm–11pm';
  fields.website = `https://example-${prefix.toLowerCase().replace(/\s+/g, '-')}.example.com/`;
  fields.priceLevel = '$$';
  fields.happyHourDetails = 'Mon–Fri 4–7pm: $8 cocktails and $1 oysters.';
  fields.itineraryNote = `${prefix} — arrive early on weekends for bar seats or patio tables.`;
  return fields;
}

function placeRow({ id, category, title, lat, lng, address, detail, price, logoUrl, source = 'brave' }) {
  return thingRecordFromTripRow({
    id,
    category,
    title,
    description: detail.summary,
    source,
    location: { lat, lng, address },
    metadata: {
      categoryName: category,
      price,
      sourceRecord: {
        source,
        url: detail.website,
        logoUrl,
        ...detail,
      },
      thingDetail: detail,
    },
  });
}

export function buildEnrichedDetailSharedTrip() {
  const things = [
    placeRow({
      id: 'enriched-restaurant',
      category: 'restaurant',
      title: 'Harbor Room',
      lat: 40.733,
      lng: -74.002,
      address: 'Greenwich Village, New York, NY',
      detail: reviewFields('Harbor Room'),
    }),
    placeRow({
      id: 'enriched-bar',
      category: 'bar',
      title: 'Copper Lantern Bar',
      lat: 40.752,
      lng: -73.977,
      address: 'Midtown, New York, NY',
      detail: reviewFields('Copper Lantern Bar', { compositeIndex: 2 }),
      logoUrl: 'https://www.example-bar.example/favicon.ico',
    }),
    placeRow({
      id: 'enriched-hotel',
      category: 'hotel',
      title: 'Lexington Sample Hotel',
      lat: 40.758,
      lng: -73.9855,
      address: 'Lexington Ave, New York, NY',
      price: 389,
      detail: {
        ...reviewFields('Lexington Sample Hotel'),
        checkInTime: '16:00',
        checkOutTime: '11:00',
        hotelNote: 'Ask for a higher floor for quieter nights.',
        price: 389,
      },
      logoUrl: 'https://example-hotel.example/favicon.ico',
    }),
    placeRow({
      id: 'enriched-flight',
      category: 'flight',
      title: 'Delta JFK → LAX 8:00 am',
      lat: 40.6413,
      lng: -73.7781,
      address: 'JFK Airport, Queens, NY',
      price: 412,
      detail: {
        summary:
          'Morning nonstop with one checked bag included and a schedule that lands before lunch on the West Coast, which reviewers say beats connections when you want a full arrival day.',
        itineraryNote: 'Delta JFK → LAX — arrive at the gate early for overhead bin space.',
        airline: 'Delta',
        flightNumber: 'DL 123',
        departureTime: '8:00 am',
        arrivalTime: '11:15 am',
        duration: '6h 15m',
        layovers: 'Nonstop',
        price: 412,
        fareDirection: 'one-way',
      },
      logoUrl: 'https://www.delta.com/favicon.ico',
      source: 'customer',
    }),
    placeRow({
      id: 'enriched-car',
      category: 'car',
      title: 'Hertz Midtown sedan',
      lat: 40.758,
      lng: -73.9855,
      address: 'Midtown, New York, NY',
      price: 192,
      detail: {
        summary:
          'Mid-size sedan pickup near the hotel with unlimited mileage and an airport return option that travelers mention when they want a simple automatic for city driving and longer day trips.',
        itineraryNote: 'Hertz Midtown sedan — confirm return hours before the trip.',
        rentalCompany: 'Hertz',
        carType: 'Toyota Camry or similar',
        pickupLocation: 'Midtown Manhattan',
        returnLocation: 'JFK Airport',
        price: 192,
      },
      logoUrl: 'https://www.hertz.com/favicon.ico',
    }),
    placeRow({
      id: 'enriched-store',
      category: 'store',
      title: 'Lexington Supply Store',
      lat: 40.761,
      lng: -73.977,
      address: 'Midtown, New York, NY',
      detail: reviewFields('Lexington Supply Store'),
    }),
    placeRow({
      id: 'enriched-attraction',
      category: 'attraction',
      title: 'Skyline Observation Deck',
      lat: 40.758,
      lng: -73.9855,
      address: 'Midtown, New York, NY',
      detail: reviewFields('Skyline Observation Deck'),
    }),
    placeRow({
      id: 'enriched-activity',
      category: 'activity',
      title: 'Harbor Kayak Tour',
      lat: 40.7,
      lng: -74.01,
      address: 'Hudson River Park, New York, NY',
      detail: reviewFields('Harbor Kayak Tour'),
    }),
    placeRow({
      id: 'enriched-transport',
      category: 'transport',
      title: 'AirTrain JFK link',
      lat: 40.6413,
      lng: -73.7781,
      address: 'JFK Airport, Queens, NY',
      detail: reviewFields('AirTrain JFK link'),
    }),
  ];

  return sharedTripFromIntake({
    trip: {
      id: '00000000-0000-4000-8000-enriched-detail',
      title: 'Enriched detail fixture trip',
      destination: 'New York City',
      start_date: '2026-06-10',
      end_date: '2026-06-14',
      metadata: {
        intakeShare: true,
        publicSlug: ENRICHED_DETAIL_SLUG,
        destinationCenter: { lat: 40.758, lng: -73.9855 },
      },
    },
    things,
  });
}

export const ENRICHED_DETAIL_SCENARIOS = [
  { tab: 'Restaurants', slug: 'restaurant', namePattern: /Harbor Room/i },
  { tab: 'Restaurants', slug: 'bar', namePattern: /Copper Lantern Bar/i },
  { tab: 'Hotels', slug: 'hotel', namePattern: /Lexington Sample Hotel/i },
  { tab: 'Flights', slug: 'flight', namePattern: /Delta JFK/i },
  { tab: 'Cars', slug: 'car', namePattern: /Hertz Midtown/i },
  { tab: 'Stores', slug: 'store', namePattern: /Lexington Supply Store/i },
  { tab: 'The Rest', slug: 'attraction', namePattern: /Skyline Observation Deck/i },
  { tab: 'The Rest', slug: 'activity', namePattern: /Harbor Kayak Tour/i },
  { tab: 'The Rest', slug: 'transport', namePattern: /AirTrain JFK/i },
];
