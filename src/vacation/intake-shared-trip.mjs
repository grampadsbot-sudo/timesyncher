const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function intakeShareSlug(tripId) {
  const hex = String(tripId || '').replace(/-/g, '').toLowerCase().slice(0, 12);
  if (!/^[0-9a-f]{12}$/.test(hex)) return '';
  return `intake-${hex}`;
}

function intId(seed) {
  let hash = 2166136261;
  for (const char of String(seed)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 900000000 + 1000;
}

function isoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function addDays(iso, count) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function eachDate(start, end) {
  if (!start) return [];
  const last = end && end >= start ? end : start;
  const dates = [];
  for (let cursor = start; cursor <= last && dates.length < 21; cursor = addDays(cursor, 1)) dates.push(cursor);
  return dates;
}

function namedDates(label, year) {
  const found = [];
  const re = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\b/gi;
  for (const match of String(label || '').matchAll(re)) {
    const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
    const day = Number(match[2]);
    if (!month || day < 1 || day > 31 || !year) continue;
    found.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return [...new Set(found)];
}

function assignDates(thing, year, tripDates) {
  const named = [...namedDates(thing.customerWhen, year), ...namedDates(thing.whenLabel, year)];
  const unique = [...new Set(named)].filter((date) => tripDates.includes(date));
  if (!unique.length) return tripDates.slice(0, 1);
  if (unique.length >= 2) {
    const sorted = unique.slice().sort();
    const span = eachDate(sorted[0], sorted[sorted.length - 1]).filter((date) => tripDates.includes(date));
    if (span.length > 2) return span;
  }
  return unique;
}

function categoryFor(thing) {
  if (String(thing.category || '').toLowerCase() === 'hotel') {
    return { category_name: 'Hotel', category_icon: '🏨', category: 'hotel' };
  }
  return { category_name: 'Attraction', category_icon: '🏛️', category: 'other' };
}

export function sharedTripFromIntake({ trip, things }) {
  const start = isoDate(trip?.start_date || trip?.startDate);
  const end = isoDate(trip?.end_date || trip?.endDate) || start;
  const year = start ? Number(start.slice(0, 4)) : null;
  const tripDates = eachDate(start, end);
  const days = tripDates.map((date, index) => ({
    id: intId(`${trip.id}:day:${date}`),
    trip_id: intId(trip.id),
    day_number: index + 1,
    date,
    notes: '',
    title: '',
  }));
  const dayByDate = new Map(days.map((day, index) => [tripDates[index], day]));
  const places = [];
  const assignments = {};
  const thingOverrides = {};
  for (const thing of things || []) {
    const id = intId(thing.id || thing.title);
    const kind = categoryFor(thing);
    const notes = [...(thing.notes || []), ...(thing.collaboratorNotes || [])].filter(Boolean);
    const summary = notes.join(' ') || thing.description || '';
    places.push({
      id,
      trip_id: intId(trip.id),
      name: thing.title,
      description: summary,
      category_name: kind.category_name,
      category_icon: kind.category_icon,
      category: { name: kind.category_name, icon: kind.category_icon },
      reservation_status: 'considering',
      notes: summary,
    });
    const dayIds = [];
    thingOverrides[`place:${id}`] = {
      timeline: true,
      status: 'considering',
      category: kind.category,
      summary,
      longDetails: [thing.who ? `Who: ${thing.who}` : '', thing.whenLabel, thing.customerWhen].filter(Boolean).join(' · '),
      dayIds,
    };
    for (const date of assignDates(thing, year, tripDates)) {
      const day = dayByDate.get(date);
      if (!day) continue;
      dayIds.push(day.id);
      const key = String(day.id);
      const rows = assignments[key] || [];
      rows.push({
        id: intId(`${thing.id}:${date}`),
        day_id: day.id,
        order_index: rows.length,
        notes: summary,
        place_id: id,
        place: places[places.length - 1],
      });
      assignments[key] = rows;
    }
  }
  return {
    trip: {
      id: intId(trip.id),
      title: trip.title || 'Vacation',
      description: trip.destination || '',
      start_date: start || null,
      end_date: end || null,
      currency: 'usd',
    },
    days,
    assignments,
    dayNotes: {},
    places,
    categories: [],
    permissions: {
      share_map: true,
      share_bookings: true,
      share_packing: false,
      share_budget: false,
      share_collab: false,
    },
    media: [],
    reservations: [],
    accommodations: [],
    packing: [],
    budget: [],
    collab: {},
    thingOverrides,
    timesyncherIntake: true,
  };
}
