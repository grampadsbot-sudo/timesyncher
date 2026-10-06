import { mergeBindingsIntoShared } from '../../src/vacation/thing-media-bind.mjs';
import { finalizeServedSharedTripPayload } from '../../src/vacation/shared-trip-served-page.mjs';
import { applyLiveAppTimelineSelections } from '../../src/vacation/shared-trip-live-app-fields.mjs';

export const NYC_DAYBYDAY_SLUG = '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y';
const MEDIA_PREFIX = '/ts-thing-media/nyc-craig-kim-june-2026';
const VIDEO_URL = 'https://example.com/nyc-day1-walk.mp4';

function buildPayload() {
  const categories = {
    hotel: { id: 1, name: 'Hotel', icon: '🧳' },
    restaurant: { id: 2, name: 'Restaurant', icon: '🍽️' },
    activity: { id: 3, name: 'Attraction', icon: '🏛️' },
    store: { id: 4, name: 'Store', icon: '🛍️' },
    flight: { id: 5, name: 'Flight', icon: '✈️' },
  };
  const days = [1, 2, 3, 4, 5, 6, 7, 8].map((day) => ({
    id: 500 + day,
    trip_id: 99,
    day_number: day,
    date: `2026-06-${String(22 + day).padStart(2, '0')}`,
    title: day === 1 ? 'Day 1' : day === 2 ? 'Day 2' : `Day ${day}`,
  }));
  const places = [];
  const assignments = Object.fromEntries(days.map((day) => [String(day.id), []]));
  const thingOverrides = {};
  const rows = [
    { day: 1, time: '10:30', name: 'JetBlue BOS → JFK', cat: 'flight', id: 601, summary: 'Nonstop morning option; good if you want to land before lunch.' },
    { day: 1, time: '14:00', name: "Zabar's", cat: 'store', id: 602, summary: 'UWS grocery stop for picnic supplies.', photo: true },
    { day: 1, time: '16:00', name: 'Motto by Hilton Chelsea', cat: 'hotel', id: 603, summary: 'Check-in window; drop bags before dinner.' },
    { day: 2, time: '11:00', name: 'Statue of Liberty walking tour', cat: 'activity', id: 604, summary: 'Ferry and grounds; keep tickets on phone.', photo: true, video: true },
    { day: 2, time: '15:30', name: 'Strand Book Store', cat: 'store', id: 605, summary: 'Browse rare room if time allows.' },
  ];
  for (const row of rows) {
    const day = days.find((d) => d.day_number === row.day);
    const kind = categories[row.cat];
    const place = {
      id: row.id,
      trip_id: 99,
      name: row.name,
      description: row.summary,
      lat: 40.78,
      lng: -73.96,
      address: 'New York, NY',
      category_id: kind.id,
      category_name: kind.name,
      category_icon: kind.icon,
      category: { id: kind.id, name: kind.name, icon: kind.icon },
      reservation_status: 'considering',
      place_time: row.time,
      website: '',
      notes: '',
      source: 'fixture-nyc',
    };
    places.push(place);
    assignments[String(day.id)].push({
      id: 700 + row.id,
      day_id: day.id,
      order_index: assignments[String(day.id)].length,
      notes: '',
      place,
    });
    thingOverrides[`place:${row.id}`] = { timeline: true, category: row.cat, summary: row.summary };
  }
  const reservations = rows.map((row) => {
    const day = days.find((d) => d.day_number === row.day);
    return {
      id: 800 + row.id,
      trip_id: 99,
      day_id: day.id,
      place_id: row.id,
      title: row.name,
      status: 'candidate',
      type: row.cat === 'flight' ? 'flight' : row.cat === 'hotel' ? 'hotel' : 'activity',
      start_time: row.time,
    };
  });
  const shared = {
    trip: {
      id: 99,
      title: 'Craig / Kim NYC June 2026',
      description: 'Las Vegas to New York · Jun 23–30, 2026 · UWS / Lincoln Center priority · planning options only',
      start_date: '2026-06-23',
      end_date: '2026-06-30',
      currency: 'USD',
      lat: 40.774,
      lng: -73.982,
    },
    days,
    assignments,
    dayNotes: {},
    places,
    categories: Object.values(categories),
    permissions: { share_map: true, share_bookings: true, share_packing: true, share_budget: true, share_collab: false },
    media: [],
    reservations,
    accommodations: [],
    packing: [],
    budget: [],
    collab: [],
    thingOverrides,
    timesyncherIntake: true,
  };
  const bindings = [];
  const zabars = places.find((p) => p.id === 602);
  const tour = places.find((p) => p.id === 604);
  if (zabars) {
    bindings.push({
      id: 'nyc-bind-photo-day1',
      shareToken: NYC_DAYBYDAY_SLUG,
      thingId: zabars.id,
      thingName: zabars.name,
      mediaKind: 'photo',
      mimeType: 'image/jpeg',
      originalName: 'uws-street-photo.jpg',
      publicUrl: `${MEDIA_PREFIX}/uws-street-photo.jpg`,
    });
  }
  if (tour) {
    bindings.push({
      id: 'nyc-bind-photo-day2',
      shareToken: NYC_DAYBYDAY_SLUG,
      thingId: tour.id,
      thingName: tour.name,
      mediaKind: 'photo',
      mimeType: 'image/jpeg',
      originalName: 'lincoln-center-photo.jpg',
      publicUrl: `${MEDIA_PREFIX}/lincoln-center-photo.jpg`,
    });
    bindings.push({
      id: 'nyc-bind-video-day2',
      shareToken: NYC_DAYBYDAY_SLUG,
      thingId: tour.id,
      thingName: tour.name,
      mediaKind: 'video',
      mimeType: 'video/mp4',
      originalName: 'nyc-day1-walk.mp4',
      publicUrl: VIDEO_URL,
    });
  }
  const timelineIds = rows.map((row) => row.id);
  const withTimeline = applyLiveAppTimelineSelections(shared, timelineIds);
  return finalizeServedSharedTripPayload(mergeBindingsIntoShared(withTimeline, bindings));
}

export function buildNycCraigKimDaybydayTrip() {
  return buildPayload();
}
