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

function slugify(value) {
  return text(value, 160)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `vacation-${Date.now()}`;
}

function hawaiiPlan(payload) {
  const now = new Date().toISOString();
  const title = text(payload.title || 'Hawaii July 2026', 160);
  const unforgettableGoal = text(payload.unforgettableGoal || payload.unforgettable_goal || '', 1000);
  const tripSummary = text(payload.tripSummary || payload.trip_summary || payload.description, 1200);
  const defaultDescription = [
    'TimeSyncher Vacation itinerary workspace for Hawaii: Oahu/Waikiki, Maui/Kihei, and Big Island/Kona.',
    unforgettableGoal ? `Unforgettable goal: ${unforgettableGoal}.` : '',
    'Includes flights, hotels, restaurants, stores, activities, rental cars, map points, budget targets, and open decisions. TimeSyncher organizes and compares options; customers verify details and make bookings themselves.',
  ].filter(Boolean).join(' ');
  return {
    sourceKey: text(payload.sourceKey || payload.onboardingToken || 'timesyncher-vacation-hawaii', 160),
    publicBase: text(payload.publicBase || process.env.TIMESYNCHER_TREK_PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE, 500).replace(/\/+$/, ''),
    preferredToken: slugify(title),
    title,
    unforgettableGoal,
    description: tripSummary || defaultDescription,
    tripSummarySource: tripSummary ? 'assistant_trip_summary' : 'default_trip_summary',
    startDate: '2026-07-24',
    endDate: '2026-07-31',
    currency: 'USD',
    createdAt: now,
    bookingBoundary: 'TimeSyncher Vacation does not book, reserve, hold, purchase, or complete travel arrangements. Customers verify prices, availability, hours, seasonal details, and terms before booking or relying on any option.',
    days: [
      ['2026-07-24', 'Arrive Honolulu / Waikiki'],
      ['2026-07-25', 'Waikiki surf, restaurants, shopping'],
      ['2026-07-26', 'North Shore / Banzai Pipeline option'],
      ['2026-07-27', 'Fly Oahu to Maui / Kihei'],
      ['2026-07-28', 'Kihei + Kapalua dining / sunset sail'],
      ['2026-07-29', 'Fly Maui to Kona / Big Island'],
      ['2026-07-30', 'Kona manta ray night snorkel'],
      ['2026-07-31', 'Depart Kona / return routing'],
    ],
    places: [
      { key: 'flight-las-hnl', type: 'flight', name: 'Flight research: Las Vegas (LAS) to Honolulu (HNL)', day: 1, time: '09:00', area: 'Flights', lat: 21.3187, lng: -157.9225, address: 'Daniel K. Inouye International Airport (HNL)', website: 'https://www.google.com/travel/flights', price: 650, summary: 'Compare LAS to HNL routes landing July 24, including Southwest/Hawaiian/United/American options, connection time, bags, and arrival time.', details: 'Flight candidate only. Add exact departure, airline, fare class, baggage, and connection details after live comparison.' },
      { key: 'flight-hnl-ogg', type: 'flight', name: 'Inter-island flight: Honolulu (HNL) to Maui (OGG)', day: 4, time: '10:00', area: 'Flights', lat: 20.8986, lng: -156.4305, address: 'Kahului Airport (OGG)', website: 'https://www.hawaiianairlines.com/', price: 120, summary: 'Short hop after three Waikiki nights; compare Hawaiian and Southwest schedules to protect the Maui check-in day.', details: 'Confirm baggage fees and whether rental-car pickup timing works at OGG.' },
      { key: 'flight-ogg-koa', type: 'flight', name: 'Inter-island flight: Maui (OGG) to Kona (KOA)', day: 6, time: '10:30', area: 'Flights', lat: 19.7388, lng: -156.0456, address: 'Ellison Onizuka Kona International Airport (KOA)', website: 'https://www.southwest.com/destinations/hawaii', price: 130, summary: 'Move from Maui to Kona for the final Big Island segment; compare direct routing and timing.', details: 'Confirm whether an OGG-KOA direct flight or connection is best for date and fare.' },
      { key: 'hotel-moana', type: 'hotel', name: 'Moana Surfrider, A Westin Resort & Spa, Waikiki Beach', day: 1, time: '15:00', area: 'Waikiki', lat: 21.2766, lng: -157.8268, address: '2365 Kalakaua Ave, Honolulu, HI', website: 'https://www.marriott.com/en-us/hotels/hnlwi-moana-surfrider-a-westin-resort-and-spa-waikiki-beach/overview/', price: 1800, summary: 'Preferred Waikiki candidate from the voice note. Historic beachfront location, very central for surf lessons, shopping, and restaurants.', details: 'Verify exact July 24-27 availability, taxes, resort fees, cancellation policy, room view, and parking before choosing.' },
      { key: 'hotel-royal-hawaiian', type: 'hotel', name: 'The Royal Hawaiian, a Luxury Collection Resort', day: 1, time: '15:00', area: 'Waikiki', lat: 21.2777, lng: -157.8294, address: '2259 Kalakaua Ave, Honolulu, HI', website: 'https://www.marriott.com/en-us/hotels/hnllc-the-royal-hawaiian-a-luxury-collection-resort-waikiki/overview/', price: 1950, summary: 'Nearby premium Waikiki comparison option if Moana pricing or availability is weak.', details: 'Good comparison against Moana for beachfront feel, room quality, and total stay cost.' },
      { key: 'hotel-kihei', type: 'hotel', name: 'Kihei / Wailea lodging comparison set', day: 4, time: '15:00', area: 'Kihei / South Maui', lat: 20.7644, lng: -156.445, address: 'Kihei, Maui, HI', website: 'https://www.gohawaii.com/islands/maui/regions/south-maui/kihei', price: 1100, summary: 'Kihei-area lodging first, with Wailea as a nearby upscale comparison if budget and availability fit.', details: 'Shortlist should compare beach access, parking, resort fees, cancellation terms, and drive time to Kapalua/Napili dining.' },
      { key: 'hotel-hilton-waikoloa', type: 'hotel', name: 'Hilton Waikoloa Village / Kona-area fit check', day: 6, time: '15:00', area: 'Big Island / Kona', lat: 19.9257, lng: -155.8877, address: '69-425 Waikoloa Beach Dr, Waikoloa Village, HI', website: 'https://www.hilton.com/en/hotels/koahwhh-hilton-waikoloa-village/', price: 950, summary: 'Likely Big Island Hilton candidate. Note that “Hilton Hawaiian Village” is on Oahu, so confirm whether Waikoloa is the intended Kona-area Hilton.', details: 'Compare with true Kona-town hotels for manta-ray tour pickup convenience and restaurant access.' },
      { key: 'car-oahu', type: 'car', name: 'Oahu rental car decision', day: 1, time: '12:00', area: 'Transportation', lat: 21.3187, lng: -157.9225, address: 'HNL / Waikiki', website: 'https://www.google.com/search?q=Honolulu+airport+rental+car', price: 240, summary: 'Decide whether to rent for all three Waikiki nights or only North Shore day; Waikiki parking can be expensive.', details: 'If only one North Shore day is planned, compare day-rental vs ride/tour logistics.' },
      { key: 'car-maui', type: 'car', name: 'Maui rental car for Kihei/Kapalua', day: 4, time: '11:00', area: 'Transportation', lat: 20.8986, lng: -156.4305, address: 'OGG / Kihei', website: 'https://www.google.com/search?q=Maui+OGG+rental+car', price: 260, summary: 'Maui segment likely needs a car for Kihei lodging, Kapalua-area restaurants, and sunset sail logistics.', details: 'Compare pickup at OGG, return timing, parking at lodging, and cancellation terms.' },
      { key: 'car-kona', type: 'car', name: 'Big Island rental car for Kona/Waikoloa', day: 6, time: '11:30', area: 'Transportation', lat: 19.7388, lng: -156.0456, address: 'KOA / Kona', website: 'https://www.google.com/search?q=Kona+airport+rental+car', price: 220, summary: 'Big Island generally needs a car, especially if staying at Waikoloa and doing manta/snorkel logistics.', details: 'Check pickup/dropoff timing, parking, and whether tour provider pickup reduces car needs.' },
      { key: 'surf-waikiki', type: 'event', name: 'Waikiki beginner surf lesson', day: 2, time: '09:00', area: 'Waikiki', lat: 21.276, lng: -157.826, address: 'Waikiki Beach, Honolulu, HI', website: 'https://hhsurf.com/', price: 160, summary: 'Customer wants to learn to surf in Waikiki. Compare group vs private beginner lessons and meeting points.', details: 'Verify duration, instructor ratio, photo/video options, cancellation policy, and ocean conditions.' },
      { key: 'pipeline', type: 'event', name: 'Banzai Pipeline / North Shore day', day: 3, time: '10:00', area: 'North Shore Oahu', lat: 21.6658, lng: -158.0529, address: 'Ehukai Beach Park, Haleiwa, HI', website: 'https://www.gohawaii.com/islands/oahu/regions/north-shore', price: 0, summary: 'Visit the famous Pipeline surf break. Summer can be calmer; winter is big-wave season.', details: 'Pair with Haleiwa food stops, beaches, and shopping if surf is quiet.' },
      { key: 'maui-sunset-sail', type: 'event', name: 'Maui sunset dinner sail / whale-season check', day: 5, time: '17:00', area: 'Maui', lat: 20.741, lng: -156.456, address: 'South Maui / Maalaea departure options', website: 'https://sailtrilogy.com/', price: 360, summary: 'Compare sunset dinner sail operators. Whale watching is seasonal, so verify whether July has whale viewing or swap to snorkeling/sunset sail.', details: 'Check departure harbor, dinner included, drinks, cancellation policy, and drive from Kihei.' },
      { key: 'manta-kona', type: 'event', name: 'Kona night manta ray snorkel', day: 7, time: '18:30', area: 'Kona', lat: 19.731, lng: -156.063, address: 'Kona Coast, Big Island, HI', website: 'https://mantaraydiveshawaii.com/', price: 320, summary: 'Signature Big Island night activity. Compare operators by departure harbor, snorkel vs dive, duration, safety requirements, and weather policy.', details: 'Verify swim requirements, minimum age, wetsuit/gear, cancellation policy, and moon/weather caveats.' },
      { key: 'restaurant-marugame', type: 'restaurant', name: 'Marugame Udon Waikiki', day: 2, time: '12:00', area: 'Waikiki', lat: 21.2792, lng: -157.8279, address: '2310 Kuhio Ave, Honolulu, HI', website: 'https://www.marugameudon.com/locations/waikiki/', price: 40, summary: 'Casual, local-favorite-ish Waikiki noodle stop with strong value and easy logistics.', details: 'Verify current line, hours, and whether it fits lunch or casual dinner.' },
      { key: 'restaurant-dukes', type: 'restaurant', name: 'Duke’s Waikiki', day: 1, time: '19:00', area: 'Waikiki', lat: 21.2768, lng: -157.8273, address: '2335 Kalakaua Ave, Honolulu, HI', website: 'https://www.dukeswaikiki.com/', price: 150, summary: 'Classic beachfront Waikiki dinner option, convenient near Moana/Royal Hawaiian.', details: 'Verify reservation availability, live music schedule, and whether Hula Grill is a better fit.' },
      { key: 'restaurant-leonards', type: 'restaurant', name: 'Leonard’s Bakery malasadas', day: 3, time: '08:30', area: 'Honolulu', lat: 21.2846, lng: -157.8139, address: '933 Kapahulu Ave, Honolulu, HI', website: 'https://www.leonardshawaii.com/', price: 25, summary: 'Iconic malasada stop that can pair with Waikiki/North Shore route planning.', details: 'Check hours, lines, and whether food truck/pop-up options are closer.' },
      { key: 'restaurant-nalus', type: 'restaurant', name: 'Nalu’s South Shore Grill', day: 5, time: '11:30', area: 'Kihei', lat: 20.7478, lng: -156.4565, address: '1280 S Kihei Rd, Kihei, HI', website: 'https://www.naluskihei.com/', price: 80, summary: 'Kihei-area casual restaurant candidate for local-feeling breakfast/lunch/dinner.', details: 'Verify hours, music schedule, and recent reviews.' },
      { key: 'restaurant-merrimans', type: 'restaurant', name: 'Merriman’s Kapalua', day: 5, time: '18:30', area: 'Kapalua', lat: 21.003, lng: -156.666, address: '1 Bay Club Pl, Lahaina, HI', website: 'https://www.merrimanshawaii.com/kapalua/', price: 260, summary: 'Elevated Kapalua sunset dinner candidate if drive/time fit from Kihei.', details: 'Verify reservations, menu, sunset timing, parking, and travel time.' },
      { key: 'restaurant-kona-inn', type: 'restaurant', name: 'Kona waterfront / hotel restaurant shortlist', day: 7, time: '19:45', area: 'Kona', lat: 19.639, lng: -155.996, address: 'Kailua-Kona, HI', website: 'https://www.google.com/search?q=best+waterfront+restaurants+Kailua+Kona', price: 180, summary: 'Kona has fewer options than Oahu/Maui; focus on waterfront and hotel-adjacent dinner candidates.', details: 'Shortlist after verifying hotel location and manta tour return time.' },
      { key: 'shopping-royal-hawaiian', type: 'store', name: 'Royal Hawaiian Center', day: 2, time: '15:00', area: 'Waikiki', lat: 21.278, lng: -157.829, address: '2201 Kalakaua Ave, Honolulu, HI', website: 'https://www.royalhawaiiancenter.com/', price: 0, summary: 'Walkable Waikiki shopping near the preferred hotel zone.', details: 'Compare against International Market Place and Ala Moana for time/value.' },
      { key: 'shopping-ala-moana', type: 'store', name: 'Ala Moana Center', day: 2, time: '16:30', area: 'Honolulu', lat: 21.291, lng: -157.843, address: '1450 Ala Moana Blvd, Honolulu, HI', website: 'https://www.alamoanacenter.com/', price: 0, summary: 'Larger shopping block outside Waikiki if shopping becomes a priority.', details: 'Best if paired with dinner or if car/transport is easy.' },
      { key: 'rest-waikiki-beach', type: 'event', name: 'Waikiki beach / recovery time', day: 1, time: '16:00', area: 'Waikiki', lat: 21.276, lng: -157.826, address: 'Waikiki Beach, Honolulu, HI', website: 'https://www.gohawaii.com/islands/oahu/regions/honolulu/waikiki', price: 0, summary: 'Intentional rest block after arrival before dinner.', details: 'Keep this flexible until exact flight arrival and check-in timing are known.' },
    ],
    budget: [
      ['Flights', 'LAS-HNL / HNL-OGG / OGG-KOA / return routing target', 1200, 'Placeholder until live fare comparison.'],
      ['Hotel', 'Oahu Waikiki 3 nights target', 1800, 'Moana Surfrider preferred; verify total cost.'],
      ['Hotel', 'Maui Kihei/Wailea 2 nights target', 1100, 'Compare Kihei and Wailea fit.'],
      ['Hotel', 'Big Island Kona/Waikoloa 2 nights target', 950, 'Confirm intended Hilton/Kona fit.'],
      ['Restaurants', 'Dining target across islands', 1400, 'Mix casual local spots and elevated dinners.'],
      ['Stores', 'Waikiki shopping target', 600, 'Customer-adjustable.'],
      ['Activities', 'Surf, sunset sail, manta snorkel target', 900, 'Seasonality and operator availability need verification.'],
      ['Transport', 'Rental cars / transfers target', 800, 'Oahu optional; Maui and Big Island likely needed.'],
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
let trip = one('SELECT id FROM trips WHERE title = ? ORDER BY id LIMIT 1', payload.title);
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
  thingFields['place-' + placeId] = {
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
    googleRating: '',
    sourceNote: 'Seeded by TimeSyncher Vacation worker from researched starter itinerary.',
  };
});
payload.days.forEach(([date, title], idx) => {
  const dayId = dayMap.get(idx + 1);
  run('INSERT INTO day_notes (day_id, trip_id, text, time, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)', dayId, tripId, title, '09:00', 'Info', 0);
});
payload.budget.forEach(([category, name, total, note], idx) => {
  run('INSERT INTO budget_items (trip_id, category, name, total_price, persons, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', tripId, category, name, total, 2, note, idx);
});
let share = one('SELECT token FROM share_tokens WHERE trip_id=? ORDER BY id LIMIT 1', tripId);
let token = share?.token;
if (!token) {
  token = crypto.randomBytes(24).toString('base64url');
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
import json, sqlite3, sys, secrets, datetime

payload = json.load(sys.stdin)
db = sqlite3.connect('/home/timesyncher-agent/trek/runtime/data/travel.db')
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
trip = one('SELECT id FROM trips WHERE title = ? ORDER BY id LIMIT 1', (payload['title'],))
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
        'INSERT INTO places (trip_id, name, description, lat, lng, address, category_id, price, currency, reservation_status, place_time, duration_minutes, notes, website, transport_mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        (trip_id, p['name'], description, p.get('lat'), p.get('lng'), p.get('address'), category, p.get('price'), payload['currency'], 'considering', p.get('time'), p.get('duration', 90), p.get('details') or p.get('summary'), p.get('website'), 'driving')
    )
    day_id = day_map.get(int(p.get('day') or 1))
    if day_id:
        run('INSERT INTO day_assignments (day_id, place_id, order_index, notes, reservation_status, assignment_time) VALUES (?, ?, ?, ?, ?, ?)', (day_id, place_id, idx, p.get('summary'), 'considering', p.get('time')))
    if p.get('type') == 'hotel':
        start_day = day_map.get(int(p.get('day') or 1))
        nights = 3 if ('Moana' in p['name'] or 'Royal' in p['name']) else 2
        end_day = day_map.get(min(int(p.get('day') or 1) + nights, len(payload['days'])))
        if start_day and end_day:
            run('INSERT INTO day_accommodations (trip_id, place_id, start_day_id, end_day_id, check_in, check_out, notes) VALUES (?, ?, ?, ?, ?, ?, ?)', (trip_id, place_id, start_day, end_day, '15:00', '11:00', p.get('details')))
    if p.get('type') in ('hotel', 'flight', 'car', 'event'):
        run('INSERT INTO reservations (trip_id, day_id, place_id, title, reservation_time, location, notes, status, type, needs_review) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', (trip_id, day_id, place_id, p['name'], p.get('time'), p.get('address'), p.get('details') or p.get('summary'), 'candidate', 'activity' if p.get('type') == 'event' else p.get('type'), 1))
    thing_fields['place-' + str(place_id)] = {
        'category': p.get('type'),
        'area': p.get('area') or '',
        'status': 'considering',
        'timeline': True,
        'startTime': p.get('time') or '',
        'price': str(p.get('price') or ''),
        'summary': p.get('summary') or '',
        'longDetails': p.get('details') or '',
        'website': p.get('website') or '',
        'travelTime': '',
        'googleRating': '',
        'sourceNote': 'Seeded by TimeSyncher Vacation worker from researched starter itinerary.',
    }

for idx, row in enumerate(payload['days'], start=1):
    date, title = row
    run('INSERT INTO day_notes (day_id, trip_id, text, time, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)', (day_map[idx], trip_id, title, '09:00', 'Info', 0))

for idx, row in enumerate(payload['budget']):
    category, name, total, note = row
    run('INSERT INTO budget_items (trip_id, category, name, total_price, persons, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)', (trip_id, category, name, total, 2, note, idx))

share = one('SELECT token FROM share_tokens WHERE trip_id=? ORDER BY id LIMIT 1', (trip_id,))
token = share['token'] if share else None
preferred = (payload.get('preferredToken') or '').strip().lower()
if preferred:
    candidate = preferred
    n = 2
    while True:
        row = one('SELECT trip_id FROM share_tokens WHERE token=?', (candidate,))
        if not row or int(row['trip_id']) == trip_id:
            break
        candidate = preferred + '-' + str(n)
        n += 1
    if token and token != candidate:
        run('UPDATE shared_travel_thing_fields SET token=? WHERE token=?', (candidate, token))
        run('UPDATE share_token_overrides SET token=? WHERE token=?', (candidate, token))
        run('UPDATE share_tokens SET token=? WHERE trip_id=?', (candidate, trip_id))
        token = candidate
if not token:
    token = preferred or secrets.token_urlsafe(24)
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
  const plan = hawaiiPlan(input);
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
