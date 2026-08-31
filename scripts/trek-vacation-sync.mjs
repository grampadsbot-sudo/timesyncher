#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
const DEFAULT_PUBLIC_BASE = 'https://vacation.timesyncher.com';

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function text(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}


function trekTypeForCategory(category) {
  const value = text(category, 40);
  if (['hotel', 'restaurant', 'store', 'flight', 'car'].includes(value)) return value;
  if (value === 'transport') return 'flight';
  return 'event';
}

function trekPlaceFromResearchThing(thing, index, destination, boundary) {
  const sources = Array.isArray(thing.sources) ? thing.sources : [];
  const sourceLines = sources.map((source) => `${source.label || 'Source'}: ${source.url}`).join('\n');
  const caveats = Array.isArray(thing.caveats) ? thing.caveats.join(' ') : '';
  const sourceCaveats = Array.isArray(thing.sourceCaveats) ? thing.sourceCaveats.join(' ') : '';
  const verifiedLine = thing.verifiedAt ? `Verified: ${thing.verifiedAt}${thing.expiresAt ? `; recheck after ${thing.expiresAt}` : ''}` : '';
  return {
    key: `research-${index + 1}`,
    type: trekTypeForCategory(thing.category),
    name: text(thing.title || `Research candidate ${index + 1}`, 180),
    day: Math.min(2 + (index % 2), 3),
    time: '',
    endTime: '',
    travelTime: '',
    status: 'tbd',
    area: text(thing.area || destination || 'Research', 120),
    lat: Number.isFinite(Number(thing.lat)) ? Number(thing.lat) : null,
    lng: Number.isFinite(Number(thing.lng)) ? Number(thing.lng) : null,
    address: text(thing.address || thing.area || destination || '', 240),
    website: text(thing.website || sources[0]?.url || '', 500),
    price: 0,
    summary: text(thing.summary || '', 500),
    details: [thing.details, sourceLines ? `Sources:\n${sourceLines}` : '', verifiedLine, caveats ? `Caveats: ${caveats}` : '', sourceCaveats ? `Source caveats: ${sourceCaveats}` : '', boundary].filter(Boolean).join('\n\n'),
    sources,
    sourceBacked: Boolean(thing.sourceBacked),
    verificationStatus: text(thing.verificationStatus || '', 80),
    sourceQuality: thing.sourceQuality || {},
    adapterSources: Array.isArray(thing.adapterSources) ? thing.adapterSources : [],
    qualitySignals: thing.qualitySignals || {},
    fitScores: thing.fitScores || {},
    sourceCaveats: Array.isArray(thing.sourceCaveats) ? thing.sourceCaveats : [],
    verifiedAt: text(thing.verifiedAt || '', 40),
    expiresAt: text(thing.expiresAt || '', 40),
    review1: text(thing.review1 || '', 1000),
    review2: text(thing.review2 || '', 1000),
    review3: text(thing.review3 || '', 1000),
    reviewSources: Array.isArray(thing.reviewSources) ? thing.reviewSources : [],
    googleRating: text(thing.googleRating || '', 40),
    yelpRating: text(thing.yelpRating || '', 40),
    thirdPartyRating: text(thing.thirdPartyRating || '', 80),
    happyHour: Boolean(thing.happyHour),
    happyHourDetails: text(thing.happyHourDetails || '', 1200),
    happyHourSources: Array.isArray(thing.happyHourSources) ? thing.happyHourSources : [],
    researchMetadata: thing.metadata || {},
  };
}

function minutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function scheduledDurationMinutes(place) {
  if (Number.isFinite(Number(place.duration)) && Number(place.duration) > 0) return Math.min(240, Math.max(30, Number(place.duration)));
  if (place.type === 'restaurant') return 90;
  if (place.type === 'store') return 60;
  if (place.type === 'hotel') return 60;
  return 120;
}


function cascadeDaySchedule(places) {
  const byDay = new Map();
  for (const place of places) {
    const day = Number(place.day || 1);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(place);
  }
  const floorFor = (prev, cur) => {
    const sameName = text(prev?.name || '', 180).toLowerCase() === text(cur?.name || '', 180).toLowerCase();
    const prevAddr = text(prev?.address || '', 240).toLowerCase();
    const curAddr = text(cur?.address || '', 240).toLowerCase();
    const sameAddr = Boolean(prevAddr) && prevAddr === curAddr;
    const sameCoord = Number.isFinite(Number(prev?.lat)) && Number.isFinite(Number(cur?.lat))
      && Math.abs(Number(prev.lat) - Number(cur.lat)) < 0.0005
      && Math.abs(Number(prev.lng) - Number(cur.lng)) < 0.0005;
    if (sameName || sameAddr || sameCoord) return 0;
    const existing = Number(cur?.travelTime);
    if (Number.isFinite(existing) && existing > 0) return existing;
    return 15;
  };
  const toMin = (value) => {
    const m = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  for (const dayPlaces of byDay.values()) {
    const scheduled = dayPlaces
      .filter((place) => place.time && String(place.status || '').toLowerCase() !== 'tbd')
      .sort((a, b) => (toMin(a.time) ?? 0) - (toMin(b.time) ?? 0));
    let prev = null;
    for (const place of scheduled) {
      const dur = scheduledDurationMinutes(place);
      place.duration = dur;
      let start = toMin(place.time);
      if (start == null) continue;
      let end = toMin(place.endTime);
      if (end == null || end <= start) end = start + dur;
      if (prev) {
        const floor = floorFor(prev, place);
        const prevEnd = toMin(prev.endTime) ?? ((toMin(prev.time) ?? 0) + scheduledDurationMinutes(prev));
        const minStart = prevEnd + floor;
        if (start < minStart) {
          start = minStart;
          end = start + dur;
        }
        place.travelTime = String(floor);
      } else if (place.travelTime === '' || place.travelTime == null) {
        place.travelTime = '0';
      }
      if (end >= 24 * 60) {
        end = 24 * 60 - 1;
        start = Math.max(0, end - dur);
      }
      place.time = minutesToTime(start);
      place.endTime = minutesToTime(end);
      place.status = place.status || 'scheduled';
      prev = place;
    }
  }
  return places;
}

function applyFeasibleTimeline(places) {
  const byDay = new Map();
  for (const place of places) {
    const day = Number(place.day || 1);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(place);
  }
  const slots = [9 * 60 + 30, 12 * 60 + 30, 15 * 60 + 30];
  for (const dayPlaces of byDay.values()) {
    let scheduled = 0;
    for (const place of dayPlaces) {
      place.duration = scheduledDurationMinutes(place);
      if (place.type === 'hotel') {
        place.time = place.time || '15:00';
        place.endTime = place.endTime || '16:00';
        place.travelTime = '';
        place.status = 'scheduled';
        continue;
      }
      if (scheduled < slots.length) {
        const start = slots[scheduled];
        place.time = minutesToTime(start);
        place.endTime = minutesToTime(start + place.duration);
        place.travelTime = scheduled === 0 ? '0' : '20';
        place.status = 'scheduled';
        scheduled += 1;
      } else {
        place.time = '';
        place.endTime = '';
        place.travelTime = '';
        place.status = 'tbd';
      }
    }
  }
  return places;
}

function slugify(value) {
  return text(value, 160)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `vacation-${Date.now()}`;
}

function genericPlan(payload) {
  const now = new Date().toISOString();
  const title = text(payload.title || 'TimeSyncher Vacation Research Workspace', 160);
  const createNewTrip = Boolean(payload.createNewTrip || payload.create_new_trip);
  const destination = text(payload.destination || 'Destination to research', 180);
  const unforgettableGoal = text(payload.unforgettableGoal || payload.unforgettable_goal || '', 1000);
  const unforgettableGoalSentence = unforgettableGoal.replace(/[.!?]+$/, '');
  const dateText = text(payload.dates?.dateText || payload.dates?.startDate || '', 120) || 'Dates to confirm';
  const startDate = text(payload.dates?.startDate || '', 40) || null;
  const endDate = text(payload.dates?.endDate || '', 40) || null;
  const startMs = startDate ? Date.parse(`${startDate}T00:00:00Z`) : Number.NaN;
  const endMs = endDate ? Date.parse(`${endDate}T00:00:00Z`) : Number.NaN;
  const dayCount = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
    ? Math.max(1, Math.min(31, Math.round((endMs - startMs) / 86400000) + 1))
    : 3;
  const bookingBoundary = 'TimeSyncher Vacation does not book, reserve, hold, purchase, or complete travel arrangements. Customers verify prices, availability, hours, seasonal details, and terms before booking or relying on any option.';
  const researchedPlaces = cascadeDaySchedule(applyFeasibleTimeline((Array.isArray(payload.researchedThings) ? payload.researchedThings : []).map((thing, index) => trekPlaceFromResearchThing(thing, index, destination, bookingBoundary))));
  const queuePlaces = [
    { key: 'research-lodging', type: 'hotel', name: `${destination} lodging research queue`, day: 1, time: '09:00', area: 'Research', lat: null, lng: null, address: destination, website: '', price: 0, summary: 'Queue multiple lodging/hotel options from public sources with fees, location tradeoffs, availability caveats, and cancellation terms.', details: 'Not a recommendation yet. Requires live public research before customer-facing ranking.' },
    { key: 'research-transport', type: 'car', name: `${destination} transport and car research queue`, day: 2, time: '10:00', area: 'Research', lat: null, lng: null, address: destination, website: '', price: 0, summary: 'Queue flights, airport transfers, rental cars, rideshare, transit, and parking logistics when relevant.', details: 'Not a recommendation yet. Requires live public research before customer-facing ranking.' },
    { key: 'research-food-activities-shopping', type: 'event', name: `${destination} restaurants, activities, and shopping research queue`, day: 2, time: '11:00', area: 'Research', lat: null, lng: null, address: destination, website: '', price: 0, summary: 'Queue restaurants, shopping, and activity candidates with source URLs, hours, reservation needs, and verification status.', details: 'Not a recommendation yet. Requires live public research before customer-facing ranking.' },
  ];
  const hasResearchedPlaces = researchedPlaces.length > 0;
  return {
    sourceKey: text(payload.sourceKey || payload.onboardingToken || title, 160),
    publicBase: text(payload.publicBase || process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE, 500).replace(/\/+$/, ''),
    preferredToken: slugify(title),
    createNewTrip,
    title,
    unforgettableGoal,
    description: [
      `TimeSyncher Vacation research workspace for ${destination}.`,
      `Dates: ${dateText}.`,
      unforgettableGoalSentence ? `Unforgettable goal: ${unforgettableGoalSentence}.` : '',
    ].filter(Boolean).join(' '),
    startDate,
    endDate,
    currency: 'USD',
    createdAt: now,
    bookingBoundary,
    days: Array.from({ length: dayCount }, (_, idx) => {
      const date = startDate ? new Date(Date.parse(`${startDate}T00:00:00Z`) + idx * 86400000).toISOString().slice(0, 10) : '';
      return [date, ''];
    }),
    places: hasResearchedPlaces ? researchedPlaces : queuePlaces,
    budget: [
      ['Lodging', `${destination} lodging research target`, 0, 'Placeholder until live source-backed research.'],
      ['Transport', `${destination} flights, cars, and ground transport research target`, 0, 'Placeholder until live source-backed research.'],
      ['Food, shopping, activities', `${destination} experience research target`, 0, 'Placeholder until live source-backed research.'],
    ],
  };
}

const containerCode = String.raw`
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const db = new Database('/app/data/travel.db');
const nowSql = () => new Date().toISOString();
function one(sql, ...args) { return db.prepare(sql).get(...args); }
function run(sql, ...args) { return db.prepare(sql).run(...args); }
function categoryId(name, color, icon) {
  const existing = one('SELECT id FROM categories WHERE lower(name)=lower(?) ORDER BY id LIMIT 1', name);
  if (existing) return existing.id;
  return Number(run('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)', name, color, icon).lastInsertRowid);
}
function userId() {
  const user = one("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1") || one('SELECT id FROM users ORDER BY id LIMIT 1');
  if (!user) throw new Error('No TREK user exists');
  return Number(user.id);
}
const cat = {
  hotel: categoryId('Hotel', '#2563eb', 'Hotel'),
  restaurant: categoryId('Restaurant', '#dc2626', 'Utensils'),
  attraction: categoryId('Attraction', '#7c3aed', 'MapPin'),
  transport: categoryId('Transport', '#0f766e', 'Plane'),
  store: categoryId('Store', '#d97706', 'ShoppingBag'),
  car: categoryId('Car', '#0891b2', 'Car'),
};
const uid = userId();
let trip = payload.createNewTrip ? null : one('SELECT id FROM trips WHERE title = ? ORDER BY id LIMIT 1', payload.title);
let tripId;
if (trip) {
  tripId = Number(trip.id);
  run('UPDATE trips SET description=?, start_date=?, end_date=?, currency=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', payload.description, payload.startDate, payload.endDate, payload.currency, tripId);
  const dayIds = db.prepare('SELECT id FROM days WHERE trip_id=?').all(tripId).map(r => r.id);
  for (const d of dayIds) {
    run('DELETE FROM day_assignments WHERE day_id=?', d);
    run('DELETE FROM day_notes WHERE day_id=?', d);
  }
  run('DELETE FROM days WHERE trip_id=?', tripId);
  run('DELETE FROM day_accommodations WHERE trip_id=?', tripId);
  run('DELETE FROM reservations WHERE trip_id=?', tripId);
  run('DELETE FROM budget_items WHERE trip_id=?', tripId);
  run('DELETE FROM place_tags WHERE place_id IN (SELECT id FROM places WHERE trip_id=?)', tripId);
  run('DELETE FROM places WHERE trip_id=?', tripId);
} else {
  tripId = Number(run('INSERT INTO trips (user_id, title, description, start_date, end_date, currency) VALUES (?, ?, ?, ?, ?, ?)', uid, payload.title, payload.description, payload.startDate, payload.endDate, payload.currency).lastInsertRowid);
  run('INSERT OR IGNORE INTO trip_members (trip_id, user_id, invited_by) VALUES (?, ?, ?)', tripId, uid, uid);
}
const dayMap = new Map();
payload.days.forEach(([date, title], idx) => {
  const id = Number(run('INSERT INTO days (trip_id, day_number, date, title) VALUES (?, ?, ?, ?)', tripId, idx + 1, date, title).lastInsertRowid);
  dayMap.set(idx + 1, id);
});
const typeToCat = { hotel: cat.hotel, restaurant: cat.restaurant, store: cat.store, flight: cat.transport, car: cat.car, event: cat.attraction };
const thingFields = {};
payload.places.forEach((p, idx) => {
  const category = typeToCat[p.type] || cat.attraction;
  const description = [p.summary, p.details, payload.bookingBoundary].filter(Boolean).join('\\n\\n');
  const placeId = Number(run(
    'INSERT INTO places (trip_id, name, description, lat, lng, address, category_id, price, currency, reservation_status, place_time, duration_minutes, notes, website, transport_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    tripId, p.name, description, p.lat ?? null, p.lng ?? null, p.address || null, category, p.price || null, payload.currency, 'considering', p.time || null, p.duration || 90, p.details || p.summary || null, p.website || null, 'driving'
  ).lastInsertRowid);
  const dayId = dayMap.get(Number(p.day || 1));
  if (dayId) {
    run('INSERT INTO day_assignments (day_id, place_id, order_index, notes, reservation_status, assignment_time) VALUES (?, ?, ?, ?, ?, ?)', dayId, placeId, idx, p.summary || null, 'considering', p.time || null);
  }
  if (p.type === 'hotel') {
    const startDay = dayMap.get(Number(p.day || 1));
    const endDay = dayMap.get(Math.min(Number(p.day || 1) + (p.name.includes('Moana') || p.name.includes('Royal') ? 3 : 2), payload.days.length));
    if (startDay && endDay) run('INSERT INTO day_accommodations (trip_id, place_id, start_day_id, end_day_id, check_in, check_out, notes) VALUES (?, ?, ?, ?, ?, ?, ?)', tripId, placeId, startDay, endDay, '15:00', '11:00', p.details || null);
  }
  if (['hotel', 'flight', 'car', 'event'].includes(p.type)) {
    run('INSERT INTO reservations (trip_id, day_id, place_id, title, reservation_time, location, notes, status, type, needs_review) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', tripId, dayId || null, placeId, p.name, p.time || null, p.address || null, p.details || p.summary || null, 'candidate', p.type === 'event' ? 'activity' : p.type, 1);
  }
  thingFields['place:' + placeId] = {
    category: p.type,
    area: p.area || '',
    status: 'considering',
    timeline: true,
    startTime: p.time || '',
    price: p.price ? String(p.price) : '',
    summary: p.summary || '',
    longDetails: p.details || '',
    website: p.website || '',
    travelTime: '',
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    address: p.address || '',
    googleRating: p.googleRating || '',
    yelpRating: p.yelpRating || '',
    thirdPartyRating: p.thirdPartyRating || '',
    review1: p.review1 || '',
    review2: p.review2 || '',
    review3: p.review3 || '',
    reviewSources: Array.isArray(p.reviewSources) ? p.reviewSources : [],
    happyHour: Boolean(p.happyHour),
    happyHourDetails: p.happyHourDetails || '',
    happyHourSources: Array.isArray(p.happyHourSources) ? p.happyHourSources : [],
    sourceNote: 'Seeded by TimeSyncher Vacation worker from source-backed public research.',
    sources: Array.isArray(p.sources) ? p.sources : [],
    sourceBacked: Boolean(p.sourceBacked),
    verificationStatus: p.verificationStatus || '',
    sourceQuality: p.sourceQuality || {},
    adapterSources: Array.isArray(p.adapterSources) ? p.adapterSources : [],
    qualitySignals: p.qualitySignals || {},
    fitScores: p.fitScores || {},
    sourceCaveats: Array.isArray(p.sourceCaveats) ? p.sourceCaveats : [],
    verifiedAt: p.verifiedAt || '',
    expiresAt: p.expiresAt || '',
    researchMetadata: p.researchMetadata || {},
  };
});
payload.budget.forEach(([category, name, total, note], idx) => {
  run('INSERT INTO budget_items (trip_id, category, name, total_price, persons, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', tripId, category, name, total, 2, note, idx);
});
let share = one('SELECT token FROM share_tokens WHERE trip_id=? ORDER BY id LIMIT 1', tripId);
let token = share?.token;
let preferredCandidate = '';
const preferred = String(payload.preferredToken || '').trim().toLowerCase();
if (preferred) {
  preferredCandidate = preferred;
  let n = 2;
  for (;;) {
    const row = one('SELECT trip_id FROM share_tokens WHERE token=?', preferredCandidate);
    if (!row || Number(row.trip_id) === tripId) break;
    preferredCandidate = preferred + '-' + n;
    n += 1;
  }
  if (token && token !== preferredCandidate) {
    run('UPDATE shared_travel_thing_fields SET token=? WHERE token=?', preferredCandidate, token);
    run('UPDATE share_token_overrides SET token=? WHERE token=?', preferredCandidate, token);
    run('UPDATE share_tokens SET token=? WHERE trip_id=?', preferredCandidate, tripId);
    token = preferredCandidate;
  }
}
if (!token) {
  token = preferredCandidate || crypto.randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  run('INSERT INTO share_tokens (trip_id, token, created_by, share_map, share_bookings, share_packing, share_budget, share_collab, expires_at) VALUES (?, ?, ?, 1, 1, 0, 1, 0, ?)', tripId, token, uid, expires);
} else {
  run('UPDATE share_tokens SET share_map=1, share_bookings=1, share_budget=1, share_packing=0, share_collab=0 WHERE trip_id=?', tripId);
}
run('CREATE TABLE IF NOT EXISTS shared_travel_thing_fields (token TEXT NOT NULL, thing_key TEXT NOT NULL, fields_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (token, thing_key))');
run('CREATE TABLE IF NOT EXISTS share_token_overrides (token TEXT PRIMARY KEY, overrides_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
run('DELETE FROM shared_travel_thing_fields WHERE token=?', token);
for (const [key, fields] of Object.entries(thingFields)) {
  run('INSERT INTO shared_travel_thing_fields (token, thing_key, fields_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', token, key, JSON.stringify(fields));
}
const overrides = { ...thingFields, __keepsakeSummary: payload.description, __bookingBoundary: payload.bookingBoundary };
run('INSERT INTO share_token_overrides (token, overrides_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(token) DO UPDATE SET overrides_json=excluded.overrides_json, updated_at=CURRENT_TIMESTAMP', token, JSON.stringify(overrides));
console.log(JSON.stringify({ tripId, token, url: String(payload.publicBase || '').replace(new RegExp('/+$'), '') + '/shared/' + encodeURIComponent(token) + '/' }));
`;

const pythonCode = String.raw`
import json, sqlite3, sys, secrets, datetime, os

payload = json.load(sys.stdin)
db = sqlite3.connect(os.environ.get('TIMESYNCHER_TREK_DB_PATH') or '/home/timesyncher-agent/trek/runtime/data/travel.db')
db.row_factory = sqlite3.Row

def one(sql, args=()):
    return db.execute(sql, args).fetchone()

def run(sql, args=()):
    cur = db.execute(sql, args)
    return cur.lastrowid

def category_id(name, color, icon):
    row = one('SELECT id FROM categories WHERE lower(name)=lower(?) ORDER BY id LIMIT 1', (name,))
    if row:
        return row['id']
    return run('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)', (name, color, icon))

def user_id():
    row = one("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1") or one('SELECT id FROM users ORDER BY id LIMIT 1')
    if not row:
        raise RuntimeError('No TREK user exists')
    return int(row['id'])

cat = {
    'hotel': category_id('Hotel', '#2563eb', 'Hotel'),
    'restaurant': category_id('Restaurant', '#dc2626', 'Utensils'),
    'attraction': category_id('Attraction', '#7c3aed', 'MapPin'),
    'transport': category_id('Transport', '#0f766e', 'Plane'),
    'store': category_id('Store', '#d97706', 'ShoppingBag'),
    'car': category_id('Car', '#0891b2', 'Car'),
}
uid = user_id()
create_new_trip = bool(payload.get('createNewTrip'))
trip = None if create_new_trip else one('SELECT id FROM trips WHERE title = ? ORDER BY id LIMIT 1', (payload['title'],))
if trip:
    trip_id = int(trip['id'])
    run('UPDATE trips SET description=?, start_date=?, end_date=?, currency=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', (payload['description'], payload['startDate'], payload['endDate'], payload['currency'], trip_id))
    day_ids = [r['id'] for r in db.execute('SELECT id FROM days WHERE trip_id=?', (trip_id,)).fetchall()]
    for day_id in day_ids:
        run('DELETE FROM day_assignments WHERE day_id=?', (day_id,))
        run('DELETE FROM day_notes WHERE day_id=?', (day_id,))
    run('DELETE FROM days WHERE trip_id=?', (trip_id,))
    run('DELETE FROM day_accommodations WHERE trip_id=?', (trip_id,))
    run('DELETE FROM reservations WHERE trip_id=?', (trip_id,))
    run('DELETE FROM budget_items WHERE trip_id=?', (trip_id,))
    run('DELETE FROM place_tags WHERE place_id IN (SELECT id FROM places WHERE trip_id=?)', (trip_id,))
    run('DELETE FROM places WHERE trip_id=?', (trip_id,))
else:
    trip_id = run('INSERT INTO trips (user_id, title, description, start_date, end_date, currency) VALUES (?, ?, ?, ?, ?, ?)', (uid, payload['title'], payload['description'], payload['startDate'], payload['endDate'], payload['currency']))
    run('INSERT OR IGNORE INTO trip_members (trip_id, user_id, invited_by) VALUES (?, ?, ?)', (trip_id, uid, uid))

day_map = {}
for idx, row in enumerate(payload['days'], start=1):
    date, title = row
    day_map[idx] = run('INSERT INTO days (trip_id, day_number, date, title) VALUES (?, ?, ?, ?)', (trip_id, idx, date, title))

type_to_cat = {'hotel': cat['hotel'], 'restaurant': cat['restaurant'], 'store': cat['store'], 'flight': cat['transport'], 'car': cat['car'], 'event': cat['attraction']}
thing_fields = {}
for idx, p in enumerate(payload['places']):
    category = type_to_cat.get(p.get('type'), cat['attraction'])
    description = '\n\n'.join([x for x in [p.get('summary'), p.get('details'), payload.get('bookingBoundary')] if x])
    place_id = run(
        'INSERT INTO places (trip_id, name, description, lat, lng, address, category_id, price, currency, reservation_status, place_time, end_time, duration_minutes, notes, website, transport_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (trip_id, p['name'], description, p.get('lat'), p.get('lng'), p.get('address'), category, p.get('price'), payload['currency'], p.get('status') or 'considering', p.get('time'), p.get('endTime'), p.get('duration', 90), p.get('details') or p.get('summary'), p.get('website'), 'driving')
    )
    day_id = day_map.get(int(p.get('day') or 1))
    if day_id:
        run('INSERT INTO day_assignments (day_id, place_id, order_index, notes, reservation_status, assignment_time, assignment_end_time) VALUES (?, ?, ?, ?, ?, ?, ?)', (day_id, place_id, idx, p.get('summary'), p.get('status') or 'considering', p.get('time') or None, p.get('endTime') or None))
    if p.get('type') == 'hotel':
        start_day = day_map.get(int(p.get('day') or 1))
        nights = 3 if ('Moana' in p['name'] or 'Royal' in p['name']) else 2
        end_day = day_map.get(min(int(p.get('day') or 1) + nights, len(payload['days'])))
        if start_day and end_day:
            run('INSERT INTO day_accommodations (trip_id, place_id, start_day_id, end_day_id, check_in, check_out, notes) VALUES (?, ?, ?, ?, ?, ?, ?)', (trip_id, place_id, start_day, end_day, '15:00', '11:00', p.get('details')))
    if p.get('type') in ('hotel', 'flight', 'car', 'event'):
        run('INSERT INTO reservations (trip_id, day_id, place_id, title, reservation_time, location, notes, status, type, needs_review) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', (trip_id, day_id, place_id, p['name'], p.get('time'), p.get('address'), p.get('details') or p.get('summary'), 'candidate', 'activity' if p.get('type') == 'event' else p.get('type'), 1))
    thing_fields['place:' + str(place_id)] = {
        'category': p.get('type'),
        'area': p.get('area') or '',
        'status': p.get('status') or 'considering',
        'timeline': True,
        'startTime': p.get('time') or '',
        'endTime': p.get('endTime') or '',
        'price': str(p.get('price') or ''),
        'summary': p.get('summary') or '',
        'longDetails': p.get('details') or '',
        'website': p.get('website') or '',
        'travelTime': p.get('travelTime') or '',
        'lat': p.get('lat'),
        'lng': p.get('lng'),
        'address': p.get('address') or '',
        'googleRating': p.get('googleRating') or '',
        'yelpRating': p.get('yelpRating') or '',
        'thirdPartyRating': p.get('thirdPartyRating') or '',
        'review1': p.get('review1') or '',
        'review2': p.get('review2') or '',
        'review3': p.get('review3') or '',
        'reviewSources': p.get('reviewSources') or [],
        'happyHour': bool(p.get('happyHour')),
        'happyHourDetails': p.get('happyHourDetails') or '',
        'happyHourSources': p.get('happyHourSources') or [],
        'sourceNote': 'Seeded by TimeSyncher Vacation worker from source-backed public research.',
        'sources': p.get('sources') or [],
        'sourceBacked': bool(p.get('sourceBacked')),
        'verificationStatus': p.get('verificationStatus') or '',
        'sourceQuality': p.get('sourceQuality') or {},
        'adapterSources': p.get('adapterSources') or [],
        'qualitySignals': p.get('qualitySignals') or {},
        'fitScores': p.get('fitScores') or {},
        'sourceCaveats': p.get('sourceCaveats') or [],
        'verifiedAt': p.get('verifiedAt') or '',
        'expiresAt': p.get('expiresAt') or '',
        'researchMetadata': p.get('researchMetadata') or {},
    }

for idx, row in enumerate(payload['budget']):
    category, name, total, note = row
    run('INSERT INTO budget_items (trip_id, category, name, total_price, persons, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', (trip_id, category, name, total, 2, note, idx))

share = one('SELECT token FROM share_tokens WHERE trip_id=? ORDER BY id LIMIT 1', (trip_id,))
token = share['token'] if share else None
preferred = (payload.get('preferredToken') or '').strip().lower()
preferred_candidate = ''
if preferred:
    candidate = preferred
    n = 2
    while True:
        row = one('SELECT trip_id FROM share_tokens WHERE token=?', (candidate,))
        if not row or int(row['trip_id']) == trip_id:
            break
        candidate = preferred + '-' + str(n)
        n += 1
    preferred_candidate = candidate
    if token and token != candidate:
        run('UPDATE shared_travel_thing_fields SET token=? WHERE token=?', (candidate, token))
        run('UPDATE share_token_overrides SET token=? WHERE token=?', (candidate, token))
        run('UPDATE share_tokens SET token=? WHERE trip_id=?', (candidate, trip_id))
        token = candidate
if not token:
    token = preferred_candidate or secrets.token_urlsafe(24)
    expires = (datetime.datetime.utcnow() + datetime.timedelta(days=90)).isoformat() + 'Z'
    run('INSERT INTO share_tokens (trip_id, token, created_by, share_map, share_bookings, share_packing, share_budget, share_collab, expires_at) VALUES (?, ?, ?, 1, 1, 0, 1, 0, ?)', (trip_id, token, uid, expires))
else:
    run('UPDATE share_tokens SET share_map=1, share_bookings=1, share_budget=1, share_packing=0, share_collab=0 WHERE trip_id=?', (trip_id,))

run('CREATE TABLE IF NOT EXISTS shared_travel_thing_fields (token TEXT NOT NULL, thing_key TEXT NOT NULL, fields_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (token, thing_key))')
run('CREATE TABLE IF NOT EXISTS share_token_overrides (token TEXT PRIMARY KEY, overrides_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)')
run('DELETE FROM shared_travel_thing_fields WHERE token=?', (token,))
for key, fields in thing_fields.items():
    run('INSERT INTO shared_travel_thing_fields (token, thing_key, fields_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', (token, key, json.dumps(fields)))
overrides = dict(thing_fields)
overrides['__keepsakeSummary'] = payload['description']
overrides['__bookingBoundary'] = payload['bookingBoundary']
run('INSERT INTO share_token_overrides (token, overrides_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(token) DO UPDATE SET overrides_json=excluded.overrides_json, updated_at=CURRENT_TIMESTAMP', (token, json.dumps(overrides)))
db.commit()
print(json.dumps({'tripId': trip_id, 'token': token, 'url': payload['publicBase'].rstrip('/') + '/shared/' + token + '/'}))
`;

async function main() {
  const input = JSON.parse((await readStdin()) || '{}');
  const plan = genericPlan(input);
  const final = spawnSync('python3', ['-c', pythonCode], {
    input: JSON.stringify(plan),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (final.status !== 0) throw new Error((final.stderr || final.stdout || 'TREK sync failed').trim());
  const out = final.stdout.trim();
  if (!out) throw new Error('TREK sync returned no output');
  console.log(out);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
