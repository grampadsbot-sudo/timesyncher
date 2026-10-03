import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';
import { normalizePlaceName } from '../src/vacation/intake-lodging-candidate.mjs';
import { loadCollaboratorAppSeatEulaText } from '../src/onboarding/eula-persistent-core.mjs';
import {
  configureSharedUiHelpers,
  runSharedSiteLogoBarChecks,
  runSharedSiteMapBudLogoChecks,
} from './shepherd-staging-smoke-shared-ui.mjs';
import { insertTripThing } from '../src/vacation/trip-things.mjs';

/** @typedef {{ BASE: string, RUN_TS: number, DECOY_TITLE: string, HYATT_CANON: string, REAL_HYATT: { lat: number, lng: number, street: string }, SHA7: string, commerceHits: (text: string) => string[] }} ShepherdHelperConfig */

let BASE = '';
let RUN_TS = 0;
let DECOY_TITLE = '';
let HYATT_CANON = '';
let REAL_HYATT = { lat: 0, lng: 0, street: '' };
let SHA7 = '';
/** @type {(text: string) => string[]} */
let commerceHits = () => [];

export function configureShepherdSmokeHelpers(cfg) {
  configureSharedUiHelpers(cfg);
  BASE = cfg.BASE;
  RUN_TS = cfg.RUN_TS;
  DECOY_TITLE = cfg.DECOY_TITLE;
  HYATT_CANON = cfg.HYATT_CANON;
  REAL_HYATT = cfg.REAL_HYATT;
  SHA7 = cfg.SHA7;
  commerceHits = cfg.commerceHits;
}

export async function customerTurnRow(db, tripId, like) {
  return (await db`
    select id, body, speaker, payload, request_id from transcript_turns
    where trip_id = ${tripId} and speaker='customer' and body ilike ${like}
    order by created_at desc limit 1
  `)[0] || null;
}

function lodgingTagsOk(metadata = {}) {
  const cats = [];
  if (Array.isArray(metadata.providerCategories)) cats.push(...metadata.providerCategories);
  if (metadata.categoryName) cats.push(metadata.categoryName);
  const blob = cats.join(' ').toLowerCase();
  return /lodging|hotel|resort/.test(blob);
}

export function hyattThingPass(thing, rawRow) {
  if (!thing || thing.customerStatedLodging) return false;
  if (normalizePlaceName(thing.title) !== normalizePlaceName(HYATT_CANON)) return false;
  if (!String(thing.address || '').includes(REAL_HYATT.street)) return false;
  const lat = Number(thing.lat); const lng = Number(thing.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !thing.providerId) return false;
  return lodgingTagsOk(rawRow?.metadata || {});
}

export function anchorMatchesRealHyatt(anchor, searchCenter) {
  if (String(anchor?.source || '') !== 'lodging') return false;
  if (String(anchor?.text || '').includes(REAL_HYATT.street)) return true;
  const lat = Number(searchCenter?.lat); const lng = Number(searchCenter?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat - REAL_HYATT.lat) < 0.02 && Math.abs(lng - REAL_HYATT.lng) < 0.02;
}

export function lookupBundle(payload) {
  const rows = payload?.intakeLodgingLookup || payload?.liveTranscript?.intakeLodgingLookup;
  const row = Array.isArray(rows) ? rows[0] : null;
  const brave = row?.providers?.find((p) => p.provider === 'brave');
  return { row, pickRanking: row?.pickRanking || null, rawResults: brave?.rawResults || null };
}

export async function postItineraryTimed(session, body, timeoutMs = 60000) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/vacation-itinerary?app=1&session=${encodeURIComponent(session)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json, elapsedMs: Date.now() - started };
}

export async function postItinerary(session, body) {
  const res = await fetch(`${BASE}/api/vacation-itinerary?app=1&session=${encodeURIComponent(session)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

export async function getApp(session) {
  const res = await fetch(`${BASE}/api/vacation-itinerary?app=1&session=${encodeURIComponent(session)}`);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

export function braveFromProviders(ps) {
  return ps?.providers?.find((p) => p.provider === 'brave') || null;
}

export function persistedTurnClassifier(payload) {
  const p = payload || {};
  const tc = p.turnClassifier || p.liveTranscript?.turnClassifier || {};
  return { targetKind: tc.targetKind || p.targetKind || null, category: tc.category || p.category || null, reason: tc.reason || p.placeSearch?.error || null };
}

export { runSharedSiteLogoBarChecks, runSharedSiteMapBudLogoChecks };

export function inviteUiHits(html) {
  const hits = [];
  if (/id="collaboratorInviteForm"/.test(html)) hits.push('#collaboratorInviteForm');
  if (/id="collaboratorInviteOpen"/.test(html)) hits.push('#collaboratorInviteOpen');
  if (/Invite collaborator/.test(html)) hits.push('Invite collaborator');
  if (/id="collaboratorInviteDialog"/.test(html)) hits.push('#collaboratorInviteDialog');
  return hits;
}

export function classifierSnapshot(payload) {
  const p = payload || {};
  const tc = p.liveTranscript?.turnClassifier || p.turnClassifier || {};
  return {
    targetKind: p.targetKind || tc.targetKind || null,
    category: p.category || tc.category || null,
    turnKind: p.placeSearch?.turnKind || tc.turnKind || p.turnKind || null,
    intakeError: p.intakeError || null,
    reason: p.placeSearch?.reason || tc.reason || null,
  };
}

export function fullDiag(payload, ps) {
  const p = payload || {};
  const place = ps || p.placeSearch || {};
  return {
    dedupeMerges: place.dedupeMerges ?? null,
    relevanceRejections: place.relevanceRejections ?? null,
    judgeInput: place.judgeInput ?? null,
    anchor: place.anchor ?? p.anchor ?? null,
    searchCenter: place.searchCenter ?? null,
    survivingPriorDbTitles: place.survivingPriorDbTitles ?? null,
    blockedReasons: p.blockedReasons ?? null,
    replyFailure: p.replyFailure ?? null,
    intakeLodgingLookup: p.intakeLodgingLookup ?? p.liveTranscript?.intakeLodgingLookup ?? null,
    placeSearchStatus: place.status ?? null,
    error: place.error ?? p.intakeError ?? null,
    classifier: classifierSnapshot(p),
  };
}

function looksLikeTaco(t) { return /taco/i.test(String(t || '')); }

export const ERROR_REPLY_RE = /(?:stack trace|Place search failed|nominatim:|overpass|openstreetmap|brave:|tavily:|HTTP\s*\d{3}|statusCode|provider:\s*\w+\s+failed)/i;
export const OUTSIDE_KIHEI_RE = /ka'?anapali|lahaina/i;

export function customerVisibleReplies(dbTurns, jsonReplies = []) {
  const bodies = [];
  for (const r of jsonReplies) if (r) bodies.push(String(r));
  for (const t of dbTurns || []) {
    if (t.speaker === 'app') bodies.push(String(t.body || ''));
  }
  return bodies;
}

export function scanErrorText(bodies) {
  const hits = [];
  for (const b of bodies) {
    if (ERROR_REPLY_RE.test(b)) hits.push(b.slice(0, 240));
  }
  return hits;
}

export async function collabAcceptFlow({ inviteId, acceptedByName, ownerFirstName, tripTitleForWelcome = 'this vacation', audience = 'collaborator_no_site', tripSiteUrl = '' }) {
  const eulaSessionId = `vacation-collaborator-${inviteId}`;
  const acceptPage = await fetch(`${BASE}/accept/${encodeURIComponent(eulaSessionId)}`);
  const acceptHtml = await acceptPage.text();
  const termsCount = (acceptHtml.match(/Review & continue/g) || []).length;
  const acceptPost = await fetch(`${BASE}/api/eula?action=accept&sessionId=${encodeURIComponent(eulaSessionId)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ acceptedByName, checkboxConfirmed: true }),
  });
  const acceptJson = await acceptPost.json().catch(() => ({}));
  const collabToken = acceptJson.redirectUrl?.match(/session=([^&]+)/)?.[1] || '';
  const appGet = collabToken ? await getApp(collabToken) : { status: 0, json: {} };
  const ownerTurns = (appGet.json.turns || []).filter((t) => t.speaker === 'customer' && /owner planning/i.test(t.body || ''));
  const turns = appGet.json.turns || [];
  const missingAuthorLabel = turns.filter((t) => !String(t.authorLabel || '').trim());
  const labeledOwner = turns.filter((t) => t.speaker === 'customer' && t.authorLabel);
  const acceptHtmlForP = acceptHtml;
  const collabEulaText = loadCollaboratorAppSeatEulaText(process.env);
  const appReplyBodies = turns.filter((t) => t.speaker === 'app').map((t) => t.body || '').join('\n');
  const commerce = {
    acceptPage: commerceHits(acceptHtmlForP),
    eula: commerceHits(collabEulaText),
    chat: commerceHits(appReplyBodies),
  };
  return {
    collabToken,
    acceptPageStatus: acceptPage.status,
    termsCount,
    acceptPostStatus: acceptPost.status,
    acceptJson,
    appGetStatus: appGet.status,
    ownerTurnsFound: ownerTurns.length,
    labeledOwnerCount: labeledOwner.length,
    labeledOwnerSample: labeledOwner.slice(0, 3).map((t) => ({ body: t.body?.slice(0, 80), authorLabel: t.authorLabel })),
    missingAuthorLabelCount: missingAuthorLabel.length,
    missingAuthorLabelSample: missingAuthorLabel.slice(0, 5).map((t) => ({ speaker: t.speaker, body: t.body?.slice(0, 60) })),
    commerce,
    collabEulaSnippet: collabEulaText.slice(0, 200),
  };
}

export async function turnRow(db, tripId, like) {
  return (await db`
    select id, body, speaker, payload, request_id from transcript_turns
    where trip_id = ${tripId} and body ilike ${like} order by created_at desc limit 1
  `)[0] || null;
}

export async function braveTacos(db, tripId, reqId) {
  const rows = await db`
    select title, source, metadata, source_request_id from trip_things
    where trip_id=${tripId} and source='brave' and source_request_id=${reqId} order by created_at`;
  return rows.filter((r) => looksLikeTaco(r.title)).map((r) => ({
    title: r.title,
    provenance: { source: r.source, providerId: r.metadata?.sourceRef?.id || r.metadata?.externalId, source_request_id: r.source_request_id },
  }));
}

export function thingReport(row) {
  if (!row) return null;
  const m = row.metadata || {};
  const loc = row.location || {};
  const src = String(row.source || m.source || '').trim();
  return {
    title: row.title,
    address: loc.address || row.description || '',
    lat: loc.lat,
    lng: loc.lng,
    addressSource: m.addressSource || null,
    coordsSource: m.coordsSource || null,
    source: row.source,
    metadataSource: m.source || null,
    providerId: m.sourceRef?.id || m.externalId || null,
    customerStatedLodging: m.customerStatedLodging === true,
  };
}

async function transcriptWelcomes(db, customerId) {
  const turns = await db`
    select id, body, speaker, created_at from transcript_turns
    where customer_id=${customerId} and channel='vacation-app' order by created_at asc`;
  const exp = renderOnboardingWelcome({ audience: 'owner_no_site', firstName: 'Shepherd' }).replace(/\s+/g, ' ').trim().slice(0, 50);
  const rows = (turns || []).filter((t) => t.speaker === 'app' && String(t.body || '').replace(/\s+/g, ' ').includes(exp.slice(0, 30)));
  return { count: rows.length, ids: rows.map((r) => r.id), hasLink: rows.some((r) => /https?:\/\//i.test(r.body || '')) };
}

export async function welcomeClaimRows(db, onboardingSessionId) {
  if (!onboardingSessionId) return [];
  return await db`
    select id, onboarding_session_id, welcome_for, trip_id, created_at
    from vacation_onboarding_welcomes where onboarding_session_id=${onboardingSessionId} order by created_at`;
}

export { transcriptWelcomes };

export async function seedDecoy(db) {
  const decoyCustomerId = randomUUID();
  const decoyTripId = randomUUID();
  await db`
    insert into customers (id, email, first_name, last_name, display_name, metadata)
    values (${decoyCustomerId}, ${`decoy-4eff9d1-${RUN_TS}@resend.dev`}, 'D', 'O', 'Decoy', '{}'::jsonb)`;
  await db`
    insert into trips (id, customer_id, title, destination, status) values (${decoyTripId}, ${decoyCustomerId}, 'Decoy', 'Kaanapali', 'intake')`;
  await insertTripThing(db, {
    tripId: decoyTripId,
    requestId: null,
    thing: {
      category: 'restaurant',
      title: DECOY_TITLE,
      source: 'brave',
      location: { lat: 20.9250, lng: -156.6899, address: 'Kaanapali, Maui' },
      metadata: {},
    },
  });
  return { decoyCustomerId, decoyTripId };
}
