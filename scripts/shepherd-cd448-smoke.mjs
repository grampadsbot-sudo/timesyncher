#!/usr/bin/env node
import { mkdir } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { sql } from '/workspace/src/vacation/db.mjs';
import { couponHash } from '/workspace/src/vacation/coupons.mjs';

const BASE = 'https://vacation-staging.timesyncher.com';
const out = { checks: {} };

async function postItinerary(session, body) {
  const res = await fetch(`${BASE}/api/vacation-itinerary?app=1&session=${encodeURIComponent(session)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json, raw: text };
}

async function countThings(db, tripId) {
  const rows = await db`select count(*)::int as n from trip_things where trip_id = ${tripId}`;
  return rows[0].n;
}

async function turnPayload(db, tripId, bodyLike) {
  const rows = await db`
    select body, speaker, payload
    from transcript_turns
    where trip_id = ${tripId} and body ilike ${bodyLike}
    order by created_at desc
    limit 1
  `;
  return rows[0] || null;
}

function braveFromProviders(ps) {
  if (!ps?.providers) return null;
  const row = ps.providers.find((p) => p.provider === 'brave');
  return row || null;
}

function failEvidence(label, http, json, dbTurn) {
  return {
    label,
    http,
    error: json?.error || json?.code || null,
    status: json?.status || null,
    body: json,
    blockedReasons: dbTurn?.payload?.blockedReasons || json?.blockedReasons || null,
    replyFailure: dbTurn?.payload?.replyFailure || null,
  };
}

const version = await fetch(`${BASE}/api/version`).then((r) => r.json());
out.version = version;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.goto(`${BASE}/index.html`, { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 5000));
out.price = await page.$eval('#singlePrice', (el) => el.textContent).catch(() => '');
await browser.close();

const couponCode = process.argv[2];
const couponRes = await fetch(`${BASE}/api/checkout-coupon`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    firstName: 'Shepherd',
    lastName: 'Cd448',
    email: `shepherd-cd448-${Date.now()}@resend.dev`,
    couponCode,
    orderBump: false,
    photoMemories: false,
  }),
});
const couponText = await couponRes.text();
const couponJson = JSON.parse(couponText.split('\nHTTP:')[0] || couponText);
out.coupon = { status: couponRes.status, json: couponJson };

const session = couponJson.session?.token;
const customerId = couponJson.redemption?.customer_id;
const db = sql(process.env);
out.tripsAfterCoupon = (await db`select count(*)::int as n from trips where customer_id = ${customerId}`)[0].n;

await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(`vacation-${session}`)}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ acceptedByName: 'Shepherd Cd448', checkboxConfirmed: true }),
});

const hi = await postItinerary(session, { text: 'hi' });
out.hi = { status: hi.status, reply: hi.json.reply, json: hi.json };

const tripMsg = await postItinerary(session, { text: 'Maui March 10-17 2027 with my wife' });
out.tripCreate = { status: tripMsg.status, json: tripMsg.json };
const tripId = tripMsg.json.trip?.id || (await db`
  select id from trips where customer_id = ${customerId} order by created_at desc limit 1
`)[0]?.id;

const tripRow = tripId ? (await db`
  select id, start_date, end_date from trips where id = ${tripId} limit 1
`)[0] : null;
const ent = customerId ? (await db`
  select trip_id from entitlements where customer_id = ${customerId} and status = 'active' limit 1
`)[0] : null;
out.tripRow = tripRow;
out.tripCount = (await db`select count(*)::int as n from trips where customer_id = ${customerId}`)[0].n;
out.entitlement = ent;

const tripTurn = tripId ? await turnPayload(db, tripId, 'Maui March%') : null;
if (tripMsg.status !== 201 || tripMsg.json.error) {
  out.checks[5] = failEvidence('trip-create', tripMsg.status, tripMsg.json, tripTurn);
}

const chrome = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const cPage = await chrome.newPage();
const consoleErrors = [];
const requests = [];
cPage.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
cPage.on('request', (r) => requests.push(r.url()));
await cPage.goto(`${BASE}/vacation-app.html?session=${encodeURIComponent(session)}`, { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));
await mkdir('/workspace/artifacts', { recursive: true });
const screenshot = '/workspace/artifacts/shepherd-cd448cd-trip-site.png';
await cPage.screenshot({ path: screenshot, fullPage: true });
await chrome.close();
out.chrome = { screenshot, consoleErrors, appConfig: requests.filter((u) => /app-config/i.test(u)) };

const before6 = tripId ? await countThings(db, tripId) : 0;
const t6 = await postItinerary(session, { tripId, text: 'recommend taco spots near Kaanapali Maui' });
const after6 = tripId ? await countThings(db, tripId) : 0;
const t6db = tripId ? await turnPayload(db, tripId, 'recommend taco%') : null;
out.check6 = {
  http: t6.status,
  response: t6.json,
  placeSearch: t6.json.placeSearch,
  dbPlaceSearch: t6db?.payload?.placeSearch,
  brave: braveFromProviders(t6.json.placeSearch || t6db?.payload?.placeSearch),
  thingsDelta: after6 - before6,
  before6,
  after6,
  blockedReasons: t6db?.payload?.blockedReasons,
};

const hotel = await postItinerary(session, { tripId, text: 'We are staying at Hyatt Regency Maui in Kaanapali.' });
out.hotel = { status: hotel.status, json: hotel.json };

const before6b = tripId ? await countThings(db, tripId) : 0;
const t6b = await postItinerary(session, { tripId, text: 'best tacos near our hotel' });
const after6b = tripId ? await countThings(db, tripId) : 0;
const t6bdb = tripId ? await turnPayload(db, tripId, 'best tacos%') : null;
const braveNew = tripId ? (await db`
  select title, source, metadata, created_at
  from trip_things
  where trip_id = ${tripId} and source = 'brave'
  order by created_at desc
  limit 10
`) : [];
out.check6b = {
  http: t6b.status,
  response: t6b.json,
  placeSearch: t6b.json.placeSearch,
  dbPlaceSearch: t6bdb?.payload?.placeSearch,
  brave: braveFromProviders(t6b.json.placeSearch || t6bdb?.payload?.placeSearch),
  thingsDelta: after6b - before6b,
  before6b,
  after6b,
  braveSamples: braveNew.slice(0, 5).map((r) => ({
    title: r.title,
    id: r.metadata?.sourceRef?.id || r.metadata?.externalId,
  })),
  blockedReasons: t6bdb?.payload?.blockedReasons,
};

const w7 = await postItinerary(session, { tripId, text: "what's the weather and any events that week" });
const w7db = tripId ? await turnPayload(db, tripId, '%weather%') : null;
const wReply = tripId ? (await db`
  select body from transcript_turns
  where trip_id = ${tripId} and speaker = 'app'
    and created_at > (
      select created_at from transcript_turns
      where trip_id = ${tripId} and body ilike '%weather%' and speaker = 'customer'
      order by created_at desc limit 1
    )
  order by created_at asc limit 1
`)[0]?.body : '';
out.check7 = {
  http: w7.status,
  json: w7.json,
  webSearch: w7db?.payload?.webSearch || w7.json.webSearch,
  replySnippet: wReply?.slice(0, 300),
  hasIdParen: /\(id:/i.test(wReply || ''),
  hasHttp: /https?:\/\//i.test(wReply || ''),
  blockedReasons: w7db?.payload?.blockedReasons,
};

const before8 = tripId ? await countThings(db, tripId) : 0;
const land = await postItinerary(session, { tripId, text: 'we land in Maui at 3pm' });
const after8 = tripId ? await countThings(db, tripId) : 0;
const landDb = tripId ? await turnPayload(db, tripId, 'we land%') : null;
out.check8 = {
  http: land.status,
  placeSearch: landDb?.payload?.placeSearch,
  webSearch: landDb?.payload?.webSearch,
  thingsDelta: after8 - before8,
};

const hash = couponHash('TS-OUF_GMDSNOU-', process.env);
const sct = (await db`select redemption_count, status from checkout_coupons where code_hash = ${hash} limit 1`)[0];
out.sctCoupon = sct;
out.couponUsed = couponCode;

writeFileSync('/tmp/shepherd-cd448-out.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
