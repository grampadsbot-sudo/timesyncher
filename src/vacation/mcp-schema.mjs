const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ITEM_LOCATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    address: { type: 'string', description: 'Street address or area name.' },
    lat: { type: 'number', minimum: -90, maximum: 90, description: 'Latitude in decimal degrees.' },
    lng: { type: 'number', minimum: -180, maximum: 180, description: 'Longitude in decimal degrees.' },
  },
};

const FLIGHT_ITEM_SCHEMA = {
  type: 'object',
  required: ['title'],
  additionalProperties: false,
  properties: {
    ref: { type: 'string', description: 'Optional draft reference id for linking media.' },
    title: { type: 'string', minLength: 1, description: 'Flight title such as airline and route.' },
    airline: { type: 'string', description: 'Airline name.' },
    flight_number: { type: 'string', description: 'Flight number.' },
    departure_airport: { type: 'string', description: 'Departure airport code.' },
    arrival_airport: { type: 'string', description: 'Arrival airport code.' },
    starts_at: { type: 'string', description: 'Departure timestamp in ISO 8601 format.' },
    ends_at: { type: 'string', description: 'Arrival timestamp in ISO 8601 format.' },
    day_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Vacation day date (YYYY-MM-DD).' },
    confirmation_code: { type: 'string', description: 'Optional booking confirmation code.' },
    total_price_cents: { type: 'integer', minimum: 0, description: 'Total flight price in cents.' },
    currency: { type: 'string', description: 'Three-letter currency code, default usd.' },
    notes: { type: 'string', description: 'Flight notes.' },
  },
};

const HOTEL_ITEM_SCHEMA = {
  type: 'object',
  required: ['title'],
  additionalProperties: false,
  properties: {
    ref: { type: 'string', description: 'Optional draft reference id for linking media.' },
    title: { type: 'string', minLength: 1, description: 'Hotel or lodging name.' },
    description: { type: 'string', description: 'Summary or details about the stay.' },
    check_in: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Check-in date (YYYY-MM-DD).' },
    check_out: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Check-out date (YYYY-MM-DD).' },
    total_price_cents: { type: 'integer', minimum: 0, description: 'Total stay price in cents.' },
    currency: { type: 'string', description: 'Three-letter currency code, default usd.' },
    location: ITEM_LOCATION_SCHEMA,
    website: { type: 'string', description: 'Official hotel website URL.' },
    notes: { type: 'string', description: 'Stay notes.' },
  },
};

const CAR_ITEM_SCHEMA = {
  type: 'object',
  required: ['title'],
  additionalProperties: false,
  properties: {
    ref: { type: 'string', description: 'Optional draft reference id for linking media.' },
    title: { type: 'string', minLength: 1, description: 'Rental car company or vehicle description.' },
    pickup_location: { type: 'string', description: 'Pickup airport or branch.' },
    dropoff_location: { type: 'string', description: 'Dropoff airport or branch.' },
    starts_at: { type: 'string', description: 'Pickup timestamp in ISO 8601 format.' },
    ends_at: { type: 'string', description: 'Return timestamp in ISO 8601 format.' },
    total_price_cents: { type: 'integer', minimum: 0, description: 'Total rental price in cents.' },
    currency: { type: 'string', description: 'Three-letter currency code, default usd.' },
    notes: { type: 'string', description: 'Rental notes.' },
  },
};

const PLACE_ITEM_SCHEMA = {
  type: 'object',
  required: ['title'],
  additionalProperties: false,
  properties: {
    ref: { type: 'string', description: 'Optional draft reference id for linking media.' },
    category: {
      type: 'string',
      enum: ['restaurant', 'activity', 'attraction', 'store', 'bar', 'tour', 'event', 'sightseeing'],
      description: 'Optional Thing category.',
    },
    title: { type: 'string', minLength: 1, description: 'Place or activity name.' },
    description: { type: 'string', description: 'Description of what to expect or what you loved.' },
    day_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Optional vacation day date (YYYY-MM-DD). Omit for an unscheduled long-list Thing.' },
    starts_at: { type: 'string', description: 'Scheduled or visited time in ISO 8601 format.' },
    unscheduled: { type: 'boolean', description: 'Set true to store on the vacation long list without scheduling on any day.' },
    total_price_cents: { type: 'integer', minimum: 0, description: 'Estimated or actual total in cents.' },
    currency: { type: 'string', description: 'Three-letter currency code, default usd.' },
    location: ITEM_LOCATION_SCHEMA,
    website: { type: 'string', description: 'Official website URL.' },
    notes: { type: 'string', description: 'Personal notes or highlights.' },
  },
};

const UNSCHEDULED_THING_SCHEMA = {
  type: 'object',
  required: ['title'],
  additionalProperties: false,
  properties: {
    ref: { type: 'string', description: 'Optional draft reference id for linking media.' },
    category: {
      type: 'string',
      enum: ['restaurant', 'activity', 'attraction', 'store', 'bar', 'tour', 'event', 'sightseeing', 'hotel', 'flight', 'car', 'note'],
      description: 'Long-list Thing category such as restaurant, attraction, store, or activity.',
    },
    title: { type: 'string', minLength: 1, description: 'Saved unscheduled Thing name.' },
    description: { type: 'string', description: 'Description or reason this Thing is saved.' },
    total_price_cents: { type: 'integer', minimum: 0, description: 'Estimated or actual total in cents.' },
    currency: { type: 'string', description: 'Three-letter currency code, default usd.' },
    location: ITEM_LOCATION_SCHEMA,
    website: { type: 'string', description: 'Official website URL.' },
    notes: { type: 'string', description: 'Personal notes or highlights.' },
  },
};

const NOTE_ITEM_SCHEMA = {
  type: 'object',
  required: ['title', 'body'],
  additionalProperties: false,
  properties: {
    ref: { type: 'string', description: 'Optional draft reference id.' },
    title: { type: 'string', minLength: 1, description: 'Short note heading.' },
    body: { type: 'string', minLength: 1, description: 'Note content.' },
    day_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Optional vacation day date (YYYY-MM-DD).' },
  },
};

const MEDIA_LINK_SCHEMA = {
  type: 'object',
  required: ['media_id'],
  additionalProperties: false,
  properties: {
    media_id: { type: 'string', minLength: 1, description: 'Media id returned by upload_media.' },
    day_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Optional day date override (YYYY-MM-DD).' },
    thing_ref: { type: 'string', description: 'Optional place or item ref id this photo or video belongs to.' },
    caption: { type: 'string', description: 'Optional photo or video caption.' },
    media_kind: { type: 'string', enum: ['photo', 'video'], description: 'Photo or video.' },
  },
};

const DAY_SCHEMA = {
  type: 'object',
  required: ['day_number', 'date'],
  additionalProperties: false,
  properties: {
    day_number: { type: 'integer', minimum: 1, description: '1-based vacation day number.' },
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Local calendar date (YYYY-MM-DD).' },
    title: { type: 'string', description: 'Short headline for the day.' },
    notes: { type: 'string', description: 'Day summary or memories.' },
  },
};

export { ITEM_LOCATION_SCHEMA };

export const VACATION_IMPORT_FORMAT_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Vacay Keepsake Vacation Import Format',
  type: 'object',
  required: ['vacation'],
  additionalProperties: false,
  properties: {
    vacation: {
      type: 'object',
      required: ['title', 'destination', 'start_date', 'end_date', 'timezone'],
      additionalProperties: false,
      properties: {
        title: { type: 'string', minLength: 1, description: 'Vacation display title.' },
        destination: { type: 'string', minLength: 1, description: 'Primary destination city or region.' },
        start_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Vacation start date (YYYY-MM-DD).' },
        end_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Vacation end date (YYYY-MM-DD).' },
        timezone: { type: 'string', minLength: 1, description: 'IANA timezone for local day assignment, such as America/Los_Angeles.' },
        currency: { type: 'string', description: 'Three-letter currency code, default usd.' },
        summary: { type: 'string', description: 'Short overview of the vacation.' },
      },
    },
    days: { type: 'array', items: DAY_SCHEMA, description: 'Ordered list of vacation days.' },
    flights: { type: 'array', items: FLIGHT_ITEM_SCHEMA, description: 'Flights for the vacation.' },
    hotels: { type: 'array', items: HOTEL_ITEM_SCHEMA, description: 'Hotels and lodging stays.' },
    cars: { type: 'array', items: CAR_ITEM_SCHEMA, description: 'Rental cars.' },
    restaurants: { type: 'array', items: PLACE_ITEM_SCHEMA, description: 'Restaurants, cafes, and dining stops.' },
    stores: { type: 'array', items: PLACE_ITEM_SCHEMA, description: 'Shops, boutiques, and stores.' },
    things_to_do: { type: 'array', items: PLACE_ITEM_SCHEMA, description: 'Activities, sights, museums, parks, and stores.' },
    unscheduled_things: { type: 'array', items: UNSCHEDULED_THING_SCHEMA, description: 'Long-list Things saved for the vacation that are not scheduled on any day.' },
    notes: { type: 'array', items: NOTE_ITEM_SCHEMA, description: 'General or day-level notes and memories.' },
    media: { type: 'array', items: MEDIA_LINK_SCHEMA, description: 'Links between uploaded media ids and vacation days or itinerary items.' },
  },
};

function sampleDate(dayOffset) {
  const base = new Date(Date.UTC(2026, 6, 3 + dayOffset));
  return base.toISOString().slice(0, 10);
}

const SAMPLE_D1 = sampleDate(0);
const SAMPLE_D2 = sampleDate(1);
const SAMPLE_D3 = sampleDate(2);

export const VACATION_IMPORT_EXAMPLE = {
  vacation: {
    title: 'Astoria Coast Weekend',
    destination: 'Astoria, Oregon',
    start_date: SAMPLE_D1,
    end_date: SAMPLE_D3,
    timezone: 'America/Los_Angeles',
    currency: 'usd',
    summary: 'Three relaxed summer days along the Columbia River waterfront and coast.',
  },
  days: [
    { day_number: 1, date: SAMPLE_D1, title: 'Arrival and Waterfront Walk', notes: 'Checked into the hotel and walked the riverwalk before sunset.' },
    { day_number: 2, date: SAMPLE_D2, title: 'Column Views and Harbor Lunch', notes: 'Climbed the tower in the morning and explored downtown shops.' },
    { day_number: 3, date: SAMPLE_D3, title: 'Coffee and Drive Home', notes: 'Picked up pastries on the pier before heading back.' },
  ],
  flights: [
    {
      ref: 'flight-out',
      title: 'Alaska Airlines 412 SEA to PDX',
      airline: 'Alaska Airlines',
      flight_number: 'AS412',
      departure_airport: 'SEA',
      arrival_airport: 'PDX',
      starts_at: `${SAMPLE_D1}T09:15:00-07:00`,
      ends_at: `${SAMPLE_D1}T10:15:00-07:00`,
      day_date: SAMPLE_D1,
      total_price_cents: 32000,
      currency: 'usd',
      notes: 'Window seats on the left side.',
    },
  ],
  hotels: [
    {
      ref: 'hotel-cannery',
      title: 'Cannery Pier Hotel',
      description: 'Historic waterfront hotel extending over the river with balconies.',
      check_in: SAMPLE_D1,
      check_out: SAMPLE_D3,
      total_price_cents: 89000,
      currency: 'usd',
      location: { address: '10 Basin St, Astoria, OR' },
      notes: 'River-view room with complimentary bicycles.',
    },
  ],
  cars: [
    {
      ref: 'car-suv',
      title: 'Midsize SUV Rental',
      pickup_location: 'PDX Airport',
      dropoff_location: 'PDX Airport',
      starts_at: `${SAMPLE_D1}T10:45:00-07:00`,
      ends_at: `${SAMPLE_D3}T16:30:00-07:00`,
      total_price_cents: 24500,
      currency: 'usd',
      notes: 'Plenty of trunk room for beach chairs.',
    },
  ],
  restaurants: [
    {
      ref: 'rest-buoy',
      title: 'Riverfront Chowder House',
      description: 'Casual seafood spot overlooking passing ships.',
      day_date: SAMPLE_D2,
      starts_at: `${SAMPLE_D2}T12:30:00-07:00`,
      total_price_cents: 9500,
      currency: 'usd',
      location: { address: '1400 Marine Dr, Astoria, OR' },
      notes: 'Clam chowder and fish tacos were the standout.',
    },
  ],
  things_to_do: [
    {
      ref: 'item-column',
      title: 'Astoria Column',
      description: 'Hilltop monument with panoramic views of the river mouth and ocean.',
      day_date: SAMPLE_D2,
      starts_at: `${SAMPLE_D2}T09:30:00-07:00`,
      total_price_cents: 500,
      currency: 'usd',
      location: { address: '1 Coxcomb Dr, Astoria, OR' },
      notes: 'Launched balsa wood gliders from the observation deck.',
    },
  ],
  notes: [
    {
      ref: 'note-packing',
      title: 'Coastal Breeze Tip',
      body: 'Bring light windbreakers for evening walks along the pier in summer.',
      day_date: SAMPLE_D1,
    },
  ],
  media: [
    {
      media_id: 'media-example-001',
      day_date: SAMPLE_D2,
      thing_ref: 'item-column',
      caption: 'Morning view from the top of the tower.',
      media_kind: 'photo',
    },
  ],
};

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateString(value, pathLabel, errors, { required = false, pattern = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) errors.push(`${pathLabel} is required.`);
    return;
  }
  if (typeof value !== 'string') {
    errors.push(`${pathLabel} must be a string.`);
    return;
  }
  if (pattern && !pattern.test(value)) errors.push(`${pathLabel} must match ${pattern.source}.`);
}

function validateLocation(location, pathLabel, errors) {
  if (location === undefined || location === null) return;
  if (!isObject(location)) { errors.push(`${pathLabel} must be an object.`); return; }
  if (location.address !== undefined) validateString(location.address, `${pathLabel}.address`, errors);
  if (location.lat !== undefined && (typeof location.lat !== 'number' || location.lat < -90 || location.lat > 90)) {
    errors.push(`${pathLabel}.lat must be a number between -90 and 90.`);
  }
  if (location.lng !== undefined && (typeof location.lng !== 'number' || location.lng < -180 || location.lng > 180)) {
    errors.push(`${pathLabel}.lng must be a number between -180 and 180.`);
  }
}

function validatePrice(value, pathLabel, errors) {
  if (value === undefined || value === null) return;
  if (!Number.isInteger(value) || value < 0) errors.push(`${pathLabel} must be a non-negative integer.`);
}

export function validateVacationImportDocument(doc) {
  const errors = [];
  if (!isObject(doc)) return { valid: false, errors: ['Document must be an object.'] };
  const allowedTop = new Set(Object.keys(VACATION_IMPORT_FORMAT_SCHEMA.properties));
  for (const key of Object.keys(doc)) {
    if (!allowedTop.has(key)) errors.push(`Unexpected top-level field "${key}".`);
  }
  if (!isObject(doc.vacation)) {
    errors.push('vacation object is required.');
  } else {
    const v = doc.vacation;
    validateString(v.title, 'vacation.title', errors, { required: true });
    validateString(v.destination, 'vacation.destination', errors, { required: true });
    validateString(v.start_date, 'vacation.start_date', errors, { required: true, pattern: ISO_DATE_RE });
    validateString(v.end_date, 'vacation.end_date', errors, { required: true, pattern: ISO_DATE_RE });
    validateString(v.timezone, 'vacation.timezone', errors, { required: true });
    validateString(v.currency, 'vacation.currency', errors);
    validateString(v.summary, 'vacation.summary', errors);
    if (ISO_DATE_RE.test(String(v.start_date || '')) && ISO_DATE_RE.test(String(v.end_date || '')) && v.end_date < v.start_date) {
      errors.push('vacation.end_date cannot be earlier than vacation.start_date.');
    }
  }
  if (doc.days !== undefined) {
    if (!Array.isArray(doc.days)) errors.push('days must be an array.');
    else {
      doc.days.forEach((day, idx) => {
        if (!isObject(day)) { errors.push(`days[${idx}] must be an object.`); return; }
        if (!Number.isInteger(day.day_number) || day.day_number < 1) errors.push(`days[${idx}].day_number must be an integer >= 1.`);
        validateString(day.date, `days[${idx}].date`, errors, { required: true, pattern: ISO_DATE_RE });
        validateString(day.title, `days[${idx}].title`, errors);
        validateString(day.notes, `days[${idx}].notes`, errors);
      });
    }
  }
  for (const section of ['flights', 'hotels', 'cars', 'restaurants', 'stores', 'things_to_do', 'unscheduled_things']) {
    if (doc[section] === undefined) continue;
    if (!Array.isArray(doc[section])) { errors.push(`${section} must be an array.`); continue; }
    doc[section].forEach((item, idx) => {
      if (!isObject(item)) { errors.push(`${section}[${idx}] must be an object.`); return; }
      validateString(item.title, `${section}[${idx}].title`, errors, { required: true });
      validateString(item.day_date, `${section}[${idx}].day_date`, errors, { pattern: ISO_DATE_RE });
      validateString(item.check_in, `${section}[${idx}].check_in`, errors, { pattern: ISO_DATE_RE });
      validateString(item.check_out, `${section}[${idx}].check_out`, errors, { pattern: ISO_DATE_RE });
      validatePrice(item.total_price_cents, `${section}[${idx}].total_price_cents`, errors);
      validateLocation(item.location, `${section}[${idx}].location`, errors);
      if (item.unscheduled !== undefined && typeof item.unscheduled !== 'boolean') {
        errors.push(`${section}[${idx}].unscheduled must be a boolean.`);
      }
    });
  }
  if (doc.notes !== undefined) {
    if (!Array.isArray(doc.notes)) errors.push('notes must be an array.');
    else {
      doc.notes.forEach((note, idx) => {
        if (!isObject(note)) { errors.push(`notes[${idx}] must be an object.`); return; }
        validateString(note.title, `notes[${idx}].title`, errors, { required: true });
        validateString(note.body, `notes[${idx}].body`, errors, { required: true });
        validateString(note.day_date, `notes[${idx}].day_date`, errors, { pattern: ISO_DATE_RE });
      });
    }
  }
  if (doc.media !== undefined) {
    if (!Array.isArray(doc.media)) errors.push('media must be an array.');
    else {
      doc.media.forEach((media, idx) => {
        if (!isObject(media)) { errors.push(`media[${idx}] must be an object.`); return; }
        validateString(media.media_id, `media[${idx}].media_id`, errors, { required: true });
        validateString(media.day_date, `media[${idx}].day_date`, errors, { pattern: ISO_DATE_RE });
        if (media.media_kind !== undefined && media.media_kind !== 'photo' && media.media_kind !== 'video') {
          errors.push(`media[${idx}].media_kind must be photo or video.`);
        }
      });
    }
  }
  return { valid: errors.length === 0, errors };
}
