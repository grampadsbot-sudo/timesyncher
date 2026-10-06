import { mergeBindingsIntoShared } from '../../src/vacation/thing-media-bind.mjs';
import { finalizeServedSharedTripPayload } from '../../src/vacation/shared-trip-served-page.mjs';
import {
  applyLiveAppTimelineSelections,
  assignPlaceToTripDays,
} from '../../src/vacation/shared-trip-live-app-fields.mjs';

export const NYC_DAYBYDAY_SLUG = '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y';
export const NYC_CONFLICT_DAY = 3;
/** Live TREK reads one-line copy via ha(place).summary → rr(place). */
export const STORED_SUMMARY_FIELD = 'thingOverrides[place:<placeId>].summary';
const MEDIA_PREFIX = '/ts-thing-media/nyc-craig-kim-june-2026';
const VIDEO_URL = 'https://example.com/nyc-day1-walk.mp4';

const SUMMARIES = {
  601: 'Nonstop morning option; good if you want to land before lunch.',
  602: 'UWS grocery stop for picnic supplies.',
  603: 'Check-in window; drop bags before dinner.',
  604: 'Ferry and grounds; keep tickets on phone.',
  605: 'Browse rare room if time allows.',
  606: 'Overlap window A: matinee tickets already held.',
  607: 'Overlap window B: friend meetup at the same hour.',
};

export function listStoredSummaries() {
  return { ...SUMMARIES };
}

export function expectedSummariesOnDay(dayNumber) {
  const idsByDay = {
    1: [602],
    2: [604, 605],
    3: [606, 607],
  };
  return (idsByDay[dayNumber] || []).map((id) => SUMMARIES[id]);
}

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
    { day: 1, time: '10:30', name: 'JetBlue BOS → JFK', cat: 'flight', id: 601 },
    { day: 1, time: '14:00', name: "Zabar's", cat: 'store', id: 602, photo: true },
    { day: 1, time: '16:00', name: 'Motto by Hilton Chelsea', cat: 'hotel', id: 603 },
    { day: 2, time: '11:00', name: 'Statue of Liberty walking tour', cat: 'activity', id: 604, photo: true, video: true },
    { day: 2, time: '15:30', name: 'Strand Book Store', cat: 'store', id: 605 },
    { day: NYC_CONFLICT_DAY, time: '14:00', name: 'Afternoon matinee show', cat: 'activity', id: 606 },
    { day: NYC_CONFLICT_DAY, time: '14:30', name: 'Friend meetup at Bryant Park', cat: 'activity', id: 607 },
  ];
  for (const row of rows) {
    const day = days.find((d) => d.day_number === row.day);
    const kind = categories[row.cat];
    const place = {
      id: row.id,
      trip_id: 99,
      name: row.name,
      description: '',
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
    const override = {
      timeline: true,
      category: row.cat,
      summary: SUMMARIES[row.id],
    };
    if (row.id === 601) {
      override.logoUrl = 'https://www.jetblue.com/favicon.ico';
    }
    if (row.id === 603) {
      override.logoUrl = 'https://www.hilton.com/favicon.ico';
    }
    thingOverrides[`place:${row.id}`] = override;
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
  let withTimeline = applyLiveAppTimelineSelections(shared, timelineIds);
  const conflictDay = days.find((d) => d.day_number === NYC_CONFLICT_DAY);
  if (conflictDay) {
    const dayKey = String(conflictDay.id);
    withTimeline = assignPlaceToTripDays(withTimeline, 606, [NYC_CONFLICT_DAY]);
    withTimeline = assignPlaceToTripDays(withTimeline, 607, [NYC_CONFLICT_DAY]);
    const schedules = {
      606: { startTime: '14:00', duration: '90 min' },
      607: { startTime: '14:30', duration: '60 min' },
    };
    for (const [placeId, slot] of Object.entries(schedules)) {
      const key = `place:${placeId}`;
      withTimeline.thingOverrides[key] = {
        ...(withTimeline.thingOverrides[key] || {}),
        perDaySchedule: { [dayKey]: slot },
      };
    }
  }
  return finalizeServedSharedTripPayload(mergeBindingsIntoShared(withTimeline, bindings));
}

export function buildNycCraigKimDaybydayTrip() {
  return buildPayload();
}
