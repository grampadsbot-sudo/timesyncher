#!/usr/bin/env node

import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const DEFAULT_REGISTRY = '/home/timesyncher-agent/timestopper-vacation-worker/travel-source-adapter-registry.json';
const ALLOWED_ENABLED_CLASSES = new Set(['approved_public_search', 'approved_public_read_only', 'unofficial_read_only']);
const BLOCKED_CLASSES = new Set(['experimental_hidden_api', 'authenticated_customer_account', 'forbidden_booking_payment']);
const execFileAsync = promisify(execFile);

function text(value, max = 5000) {
  return String(value || '').trim().slice(0, max);
}

function publicUrl(value) {
  try {
    const parsed = new URL(text(value, 1000));
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function addDaysIso(baseIso, days) {
  const date = new Date(baseIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function dateText(value) {
  return text(value, 40).slice(0, 10);
}

function envFromSecretFiles(adapter = {}) {
  const env = {};
  for (const [key, filePath] of Object.entries(adapter.secretFiles || {})) {
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    try {
      const value = fs.readFileSync(filePath, 'utf8').trim();
      if (value) env[key] = value;
    } catch {
      // Missing secret files keep the adapter gated by producing an ordinary CLI failure.
    }
  }
  return env;
}

async function execJson(command, args, { timeout = 60000, runAsUser = '', env = {} } = {}) {
  const finalCommand = runAsUser ? 'sudo' : command;
  const envPairs = Object.entries(env).map(([key, value]) => `${key}=${value}`);
  const finalArgs = runAsUser ? ['-n', '-u', runAsUser, 'env', ...envPairs, command, ...args] : args;
  const execEnv = runAsUser ? process.env : { ...process.env, ...env };
  const { stdout } = await execFileAsync(finalCommand, finalArgs, { timeout, maxBuffer: 4 * 1024 * 1024, env: execEnv });
  return JSON.parse(stdout);
}

export function loadAdapterRegistry(registryPath = DEFAULT_REGISTRY) {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const errors = [];
  const seen = new Set();
  for (const adapter of registry.adapters || []) {
    if (!adapter.id) errors.push({ adapterMissingId: adapter.label || adapter.kind || 'unknown' });
    if (seen.has(adapter.id)) errors.push({ duplicateAdapterId: adapter.id });
    seen.add(adapter.id);
    if (adapter.enabled && !ALLOWED_ENABLED_CLASSES.has(adapter.safetyClass)) errors.push({ enabledUnsafeAdapter: adapter.id, safetyClass: adapter.safetyClass });
    if (adapter.enabled && adapter.allowsBookingOrPayment) errors.push({ enabledBookingPaymentAdapter: adapter.id });
  }
  return { registry, errors };
}

export function approvedAdapters(registry, { includeFixtureOnly = false } = {}) {
  return (registry.adapters || []).filter((adapter) => {
    if (!adapter.enabled) return false;
    if (BLOCKED_CLASSES.has(adapter.safetyClass)) return false;
    if (!ALLOWED_ENABLED_CLASSES.has(adapter.safetyClass)) return false;
    if (adapter.allowsBookingOrPayment) return false;
    if (adapter.fixtureOnly && !includeFixtureOnly) return false;
    if (adapter.kind === 'provider') return false;
    return true;
  });
}

function fixtureRecentTravelerSentiment(adapter, context = {}) {
  const now = text(context.retrievedAt || new Date().toISOString(), 40);
  const destination = text(context.destination || context.artifacts?.destination || 'the destination', 120);
  const expiresAt = addDaysIso(now, 14);
  return [{
    category: 'decision',
    title: `${destination} recent traveler sentiment check`,
    summary: `Recent-traveler sentiment should be checked before final ranking so the itinerary avoids stale, overhyped, or logistically risky picks.`,
    details: `Adapter fixture proving TimeSyncher can attach recent-sentiment quality metadata to Things. Live production should replace this with a registered read-only source such as last30days-style public chatter research, review-source trends, or destination-specific traveler reports.`,
    website: 'https://github.com/mvanhorn/last30days-skill',
    sources: [{
      label: 'last30days skill pattern',
      url: 'https://github.com/mvanhorn/last30days-skill',
      retrievedAt: now,
      adapterId: adapter.id,
    }],
    verificationStatus: 'source_checked',
    sourceBacked: true,
    caveats: ['Fixture sentiment adapter only; live traveler-sentiment source must be enabled separately after source-policy approval.'],
    sourceCaveats: ['Fixture-only adapter proves schema and persistence; not a destination-specific recommendation.'],
    adapterSources: [{
      adapterId: adapter.id,
      sourceId: 'last30days-pattern',
      safetyClass: adapter.safetyClass,
      fetchedAt: now,
      status: 'fixture_source_checked',
    }],
    sourceQuality: {
      sourceCount: 1,
      adapterCount: 1,
      safetyClass: adapter.safetyClass,
      confidence: 'fixture',
      lastVerifiedAt: now,
      expiresAt,
    },
    qualitySignals: {
      freshness: 'fixture_recent_sentiment_lane',
      specificity: 'schema_proof',
      caveatCount: 1,
      recentSentiment: 'required_before_final_ranking',
    },
    fitScores: {
      family: null,
      couple: null,
      solo: null,
      weatherSensitive: null,
      reservationDifficulty: null,
      distanceRisk: null,
    },
    verifiedAt: now,
    expiresAt,
  }];
}

async function runHotelGoat(adapter, context = {}) {
  const artifacts = context.artifacts || {};
  const destination = text(context.destination || artifacts.destination || '', 120);
  const checkin = dateText(artifacts.dates?.startDate || artifacts.startDate || '');
  const checkout = dateText(artifacts.dates?.endDate || artifacts.endDate || '');
  if (!destination || !checkin || !checkout) return [];
  const now = text(context.retrievedAt || new Date().toISOString(), 40);
  const expiresAt = addDaysIso(now, 3);
  const body = await execJson(adapter.binaryPath || '/home/ubishere9995/.local/bin/hotel-goat-pp-cli', [
    'hotels',
    destination,
    checkin,
    checkout,
    '--limit', '3',
    '--agent',
    '--select', 'results.name,results.rating,results.price_per_night,results.booking_urls.primary',
  ], { timeout: Number(adapter.timeoutMs || 120000), runAsUser: adapter.runAsUser || 'ubishere9995' });
  return (Array.isArray(body.results) ? body.results : []).map((hotel, index) => {
    const url = publicUrl(hotel.booking_urls?.primary);
    const price = hotel.price_per_night ? `$${hotel.price_per_night}/night benchmark` : '';
    return {
      category: 'hotel',
      title: text(hotel.name || `Hotel GOAT option ${index + 1}`, 160),
      summary: `${text(hotel.name || 'Hotel option', 120)} surfaced by Hotel GOAT for ${destination}${price ? ` at about ${price}` : ''}; compare location, rating, total fees, and cancellation terms before booking.`,
      details: [
        `Hotel GOAT live read-only search for ${destination} ${checkin} to ${checkout}.`,
        hotel.rating ? `Visible rating: ${hotel.rating}.` : '',
        price ? `Visible nightly benchmark: ${price}.` : '',
        'This is a research candidate only. TimeSyncher does not book, reserve, hold, or pay.',
      ].filter(Boolean).join('\n'),
      website: url,
      sources: url ? [{ label: 'Hotel GOAT source URL', url, retrievedAt: now, adapterId: adapter.id }] : [],
      verificationStatus: 'needs_price_check',
      caveats: ['Verify live total, taxes/fees, room type, cancellation policy, and neighborhood fit before relying on this hotel.'],
      sourceCaveats: ['Hotel GOAT is an unofficial read-only source adapter over public hotel search surfaces.'],
      adapterSources: [{ adapterId: adapter.id, sourceId: url || text(hotel.name, 120), safetyClass: adapter.safetyClass, fetchedAt: now, status: 'live_read_only_smoke_passed' }],
      sourceQuality: { sourceCount: url ? 1 : 0, adapterCount: 1, safetyClass: adapter.safetyClass, confidence: url ? 'medium' : 'needs_source_url', lastVerifiedAt: now, expiresAt },
      qualitySignals: { freshness: 'live_price_snapshot', specificity: 'destination_and_dates', caveatCount: 2 },
      fitScores: { reservationDifficulty: 'needs_live_booking_site_check', distanceRisk: 'needs_neighborhood_check' },
      verifiedAt: now,
      expiresAt,
    };
  });
}

async function runWanderlustGoat(adapter, context = {}) {
  const artifacts = context.artifacts || {};
  const destination = text(context.destination || artifacts.destination || '', 120);
  if (!destination) return [];
  const criteria = text(
    artifacts.preferences?.activityCriteria ||
    artifacts.preferences?.criteria ||
    artifacts.requestText ||
    context.requestText ||
    'local food culture viewpoints unusual activities',
    240,
  );
  const now = text(context.retrievedAt || new Date().toISOString(), 40);
  const expiresAt = addDaysIso(now, 7);
  const body = await execJson(adapter.binaryPath || '/home/ubishere9995/.local/bin/wanderlust-goat-pp-cli', [
    'goat',
    destination,
    '--criteria', criteria,
    '--minutes', '15',
    '--top', '5',
    '--agent',
  ], { timeout: Number(adapter.timeoutMs || 120000), runAsUser: adapter.runAsUser || 'ubishere9995', env: envFromSecretFiles(adapter) });
  return (Array.isArray(body.results) ? body.results : []).map((place, index) => {
    const url = publicUrl(place.google_maps_uri);
    const walkingMinutes = Number.isFinite(Number(place.walking_minutes)) ? `${Number(place.walking_minutes).toFixed(1)} min walk` : '';
    const why = text(place.why || '', 240);
    const category = /\b(chocolate|restaurant|cafe|coffee|bar|bakery|food)\b/i.test(place.name || '') ? 'restaurant' : 'activity';
    return {
      category,
      title: text(place.name || `Wanderlust GOAT option ${index + 1}`, 160),
      summary: `${text(place.name || 'Local discovery candidate', 120)} surfaced near ${destination}${walkingMinutes ? ` (${walkingMinutes})` : ''}${why ? `; ${why}` : ''}.`,
      details: [
        `Wanderlust GOAT read-only discovery for ${destination}.`,
        place.address ? `Address: ${text(place.address, 240)}.` : '',
        walkingMinutes ? `Walking estimate: ${walkingMinutes}.` : '',
        place.business_status ? `Business status: ${text(place.business_status, 80)}.` : '',
        why ? `Source signal: ${why}.` : '',
        'This is a research candidate only; verify hours, reservations/tickets, accessibility, and itinerary fit before relying on it.',
      ].filter(Boolean).join('\n'),
      website: url,
      sources: url ? [{ label: 'Google Places / Maps source URL', url, retrievedAt: now, adapterId: adapter.id }] : [],
      verificationStatus: place.business_status === 'OPERATIONAL' ? 'source_checked' : 'needs_status_check',
      caveats: ['Google Places snapshot only; verify hours, closures, ticketing, and whether this fits the trip style before final itinerary placement.'],
      sourceCaveats: ['Wanderlust GOAT is an unofficial read-only source adapter using Google Places seed data and deterministic local scoring.'],
      adapterSources: [{ adapterId: adapter.id, sourceId: url || text(place.name, 120), safetyClass: adapter.safetyClass, fetchedAt: now, status: 'live_read_only_google_places_passed' }],
      sourceQuality: { sourceCount: url ? 1 : 0, adapterCount: 1, safetyClass: adapter.safetyClass, confidence: url ? 'medium' : 'needs_source_url', lastVerifiedAt: now, expiresAt },
      qualitySignals: {
        freshness: 'live_google_places_snapshot',
        specificity: 'destination_walk_radius_and_criteria',
        caveatCount: 2,
        score: place.score?.total ?? null,
        walkingMinutes: place.walking_minutes ?? null,
      },
      fitScores: { reservationDifficulty: 'needs_activity_specific_check', distanceRisk: walkingMinutes || 'needs_route_check' },
      verifiedAt: now,
      expiresAt,
    };
  });
}

async function runMasterParkQuote(adapter, context = {}) {
  const artifacts = context.artifacts || {};
  const requestText = text(artifacts.requestText || context.requestText || '', 2000);
  if (!/\b(masterpark|seatac|sea\b|seattle airport|airport parking)\b/i.test(requestText)) return [];
  const now = text(context.retrievedAt || new Date().toISOString(), 40);
  const expiresAt = addDaysIso(now, 3);
  const quote = await execJson(adapter.binaryPath || '/home/ubishere9995/.local/bin/masterpark-pp-cli', [
    'quote',
    '--lot', 'B',
    '--dropoff', '2030-06-11 07:00',
    '--pickup', '2030-06-13 18:30',
    '--json',
  ], { timeout: Number(adapter.timeoutMs || 60000), runAsUser: adapter.runAsUser || 'ubishere9995' });
  const first = Array.isArray(quote) ? quote[0] : quote;
  if (!first) return [];
  const total = first.grand_total || first.balance_due || first.due_at_lot || '';
  return [{
    category: 'transport',
    title: 'MasterPark SEA parking quote benchmark',
    summary: `Read-only MasterPark quote benchmark for SEA parking${total ? `: about $${total}` : ''}; useful when a trip includes Seattle airport parking logistics.`,
    details: [
      'MasterPark read-only quote smoke used Lot B with future benchmark dates to prove the source adapter can return prices without creating a reservation.',
      first.location_information?.name ? `Location: ${first.location_information.name}.` : '',
      first.location_information?.address ? `Address: ${String(first.location_information.address).replace(/<\/?br[^>]*>/gi, ' ')}.` : '',
      total ? `Grand total benchmark: $${total}.` : '',
      'Reservation creation remains blocked; this adapter may quote only.',
    ].filter(Boolean).join('\n'),
    website: 'https://masterparking.com/',
    sources: [{ label: 'MasterPark', url: 'https://masterparking.com/', retrievedAt: now, adapterId: adapter.id }],
    verificationStatus: 'needs_price_check',
    caveats: ['Benchmark quote only; verify actual trip dates, vehicle type, fees, availability, and lot rules before relying on it.'],
    sourceCaveats: ['MasterPark CLI has a reserve command, but the Vacation adapter blocks reservation/auth commands and uses quote only.'],
    adapterSources: [{ adapterId: adapter.id, sourceId: 'masterpark-lot-b-quote', safetyClass: adapter.safetyClass, fetchedAt: now, status: 'live_read_only_quote_passed' }],
    sourceQuality: { sourceCount: 1, adapterCount: 1, safetyClass: adapter.safetyClass, confidence: 'medium', lastVerifiedAt: now, expiresAt },
    qualitySignals: { freshness: 'live_quote_snapshot', specificity: 'sea_airport_parking', caveatCount: 2 },
    fitScores: { distanceRisk: 'airport_specific', reservationDifficulty: 'quote_only_no_reservation' },
    verifiedAt: now,
    expiresAt,
  }];
}

async function runRoadsideAmerica(adapter, context = {}) {
  const artifacts = context.artifacts || {};
  const destination = text(context.destination || artifacts.destination || '', 120);
  if (!destination) return [];
  const now = text(context.retrievedAt || new Date().toISOString(), 40);
  const expiresAt = addDaysIso(now, 14);
  const body = await execJson(adapter.binaryPath || '/home/ubishere9995/.local/bin/roadside-america-pp-cli', [
    'near',
    destination,
    '--radius', '25',
    '--limit', '5',
    '--agent',
    '--select', 'name,city,distance,source_url',
  ], { timeout: Number(adapter.timeoutMs || 75000), runAsUser: adapter.runAsUser || 'ubishere9995' });
  return (Array.isArray(body.attractions) ? body.attractions : []).map((attraction, index) => {
    const url = publicUrl(attraction.source_url);
    const city = text(attraction.city || body.query?.place || destination, 160);
    const distance = text(attraction.distance || '', 80);
    return {
      category: 'activity',
      title: text(attraction.name || `Roadside America option ${index + 1}`, 160),
      summary: `${text(attraction.name || 'Offbeat attraction', 120)} surfaced near ${destination}${distance ? ` (${distance})` : ''}; useful as a quirky stop, backup activity, or route detour.`,
      details: [
        `Roadside America read-only nearby-attractions search for ${destination}.`,
        city ? `Location signal: ${city}.` : '',
        distance ? `Distance signal: ${distance}.` : '',
        'This is a research candidate only; verify hours, accessibility, current status, and whether it is worth itinerary time.',
      ].filter(Boolean).join('\n'),
      website: url,
      sources: url ? [{ label: 'Roadside America source URL', url, retrievedAt: now, adapterId: adapter.id }] : [],
      verificationStatus: url ? 'source_checked' : 'needs_source_check',
      caveats: ['Community-sourced offbeat attraction data; verify current status, hours, and fit before putting it on an itinerary.'],
      sourceCaveats: ['Roadside America is an unofficial read-only source adapter over public/community attraction listings.'],
      adapterSources: [{ adapterId: adapter.id, sourceId: url || text(attraction.name, 120), safetyClass: adapter.safetyClass, fetchedAt: now, status: 'live_read_only_nearby_attractions_passed' }],
      sourceQuality: { sourceCount: url ? 1 : 0, adapterCount: 1, safetyClass: adapter.safetyClass, confidence: url ? 'medium' : 'needs_source_url', lastVerifiedAt: now, expiresAt },
      qualitySignals: { freshness: 'live_nearby_attraction_snapshot', specificity: 'destination_radius', caveatCount: 2 },
      fitScores: { reservationDifficulty: 'none_expected', distanceRisk: distance || 'needs_route_check' },
      verifiedAt: now,
      expiresAt,
    };
  });
}

export async function runApprovedSourceAdapters(input = {}) {
  const includeFixtureOnly = Boolean(input.fixtureMode || input.mode === 'fixture' || input.fixturePath || process.env.TIMESYNCHER_PUBLIC_RESEARCH_FIXTURE);
  const { registry, errors } = loadAdapterRegistry(input.registryPath || process.env.TIMESYNCHER_TRAVEL_SOURCE_ADAPTER_REGISTRY || DEFAULT_REGISTRY);
  if (errors.length) return { status: 'registry_invalid', adaptersRun: [], candidates: [], errors };
  const adapters = approvedAdapters(registry, { includeFixtureOnly });
  const candidates = [];
  const adaptersRun = [];
  const adapterErrors = [];
  async function runAdapter(adapter, fn, emptyStatus) {
    try {
      const out = await fn();
      candidates.push(...out);
      adaptersRun.push({ adapterId: adapter.id, status: out.length ? 'live_read_only_complete' : emptyStatus, safetyClass: adapter.safetyClass, candidateCount: out.length });
    } catch (error) {
      adapterErrors.push({ adapterId: adapter.id, error: text(error?.message || error, 500) });
      adaptersRun.push({ adapterId: adapter.id, status: 'adapter_failed', safetyClass: adapter.safetyClass, candidateCount: 0 });
    }
  }
  for (const adapter of adapters) {
    if (adapter.id === 'fixture-recent-traveler-sentiment') {
      candidates.push(...fixtureRecentTravelerSentiment(adapter, input));
      adaptersRun.push({ adapterId: adapter.id, status: 'fixture_complete', safetyClass: adapter.safetyClass });
    } else if (adapter.id === 'printingpress-wanderlust-goat') {
      await runAdapter(adapter, () => runWanderlustGoat(adapter, input), 'skipped_missing_destination');
    } else if (adapter.id === 'printingpress-hotel-goat') {
      await runAdapter(adapter, () => runHotelGoat(adapter, input), 'skipped_missing_destination_or_dates');
    } else if (adapter.id === 'printingpress-masterpark-quote') {
      await runAdapter(adapter, () => runMasterParkQuote(adapter, input), 'skipped_not_relevant');
    } else if (adapter.id === 'printingpress-roadside-america') {
      await runAdapter(adapter, () => runRoadsideAmerica(adapter, input), 'skipped_missing_destination');
    } else {
      adaptersRun.push({ adapterId: adapter.id, status: 'not_implemented', safetyClass: adapter.safetyClass });
    }
  }
  return { status: candidates.length ? 'adapters_complete' : 'no_adapters_selected', adaptersRun, candidates, errors: adapterErrors };
}

async function main() {
  let data = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) data += chunk;
  const input = JSON.parse(data || '{}');
  console.log(JSON.stringify(await runApprovedSourceAdapters(input)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message || String(error)); process.exit(1); });
}
