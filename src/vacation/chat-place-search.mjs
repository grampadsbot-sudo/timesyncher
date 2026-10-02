import { insertTripThing } from './trip-things.mjs';
import { placeToTripThing, searchPlaces } from './place-search.mjs';
import { buildProviderEnv } from './provider-env.mjs';
import { inTurnSearchTelemetry, placeSearchTelemetry } from './in-turn-search-telemetry.mjs';
import { applyChatWebResearchForVacationTurn } from './chat-web-research.mjs';
import {
  isCustomerPlaceSearchTurn,
  lodgingAnchorFromThing,
  resolvePlaceSearchAnchorText,
  PLAN_INTAKE,
  WEB_RESEARCH,
} from './place-search-intent.mjs';

function inferSearchCategory(text = '') {
  const lower = String(text).toLowerCase();
  if (/\b(taco|restaurant|seafood|dinner|lunch|breakfast|brunch|coffee|cafe|food|dining|splurge|kid-?friendly)\b/.test(lower)) return 'restaurant';
  if (/\b(toy|book\s*store|bookstore|shop|store|shopping|boutique)\b/.test(lower)) return 'store';
  return 'activity';
}

function searchAnchorFromTurn(text = '', tripDestination = '', lodgingText = '') {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  const near = source.match(/\b(?:near|around|within(?:\s+walking\s+distance\s+of)?|close to|by)\s+(.+?)(?:[,.!?]|$)/i);
  if (near?.[1]) {
    return resolvePlaceSearchAnchorText(near[1], lodgingText, tripDestination);
  }
  const inCity = source.match(/\b(?:in|for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4})\b/);
  if (inCity?.[1]) return resolvePlaceSearchAnchorText(inCity[1], lodgingText, tripDestination);
  return String(tripDestination || '').trim().slice(0, 180);
}

export { isCustomerPlaceSearchTurn };

function emptyTripIntakeClassification() {
  return {
    ok: true,
    intake: false,
    things: [],
    roster: [],
    destination: '',
    hasDates: false,
    title: '',
    error: null,
  };
}

function isCustomerWebResearchTurn(text = '') {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source || source.length < 15) return false;
  if (isCustomerPlaceSearchTurn(source)) return false;
  if (PLAN_INTAKE.test(source)) return false;
  return /\?/.test(source) && WEB_RESEARCH.test(source);
}

async function resolveTripIntakeForCustomerTurn({ text = '', env = process.env, classifyImpl } = {}) {
  const placeSearchTurn = isCustomerPlaceSearchTurn(text);
  const webResearchTurn = !placeSearchTurn && isCustomerWebResearchTurn(text);
  const classification = placeSearchTurn || webResearchTurn
    ? emptyTripIntakeClassification()
    : await classifyImpl({ text, env });
  return { classification, placeSearchTurn, webResearchTurn };
}

export async function classifyVacationAppCustomerTurn(requestText, env, classifyImpl) {
  return resolveTripIntakeForCustomerTurn({ text: requestText, env, classifyImpl });
}

export function intakeExtractedThings(placeSearchTurn, classification, webResearchTurn = false) {
  if (placeSearchTurn || webResearchTurn) return [];
  return classification?.ok === true ? classification.things : [];
}

function customerPlaceQueryText(customerTurn = '', tripDestination = '', lodgingText = '') {
  const text = String(customerTurn || '').replace(/\s+/g, ' ').trim();
  const destination = searchAnchorFromTurn(text, tripDestination, lodgingText);
  if (!destination) return text.slice(0, 240);
  const replaced = text.replace(
    /\b(?:near|around|within(?:\s+walking\s+distance\s+of)?|close to|by)\s+(?:our|my)\s+(?:hotel|place|lodging|accommodation|stay)(?:\s+(?:in|at)\s+[^,.!?]+)?/i,
    (match) => match.replace(/\b(?:our|my)\s+(?:hotel|place|lodging|accommodation|stay)(?:\s+(?:in|at)\s+[^,.!?]+)?/i, destination),
  );
  if (replaced !== text) return replaced.slice(0, 240);
  if (!text.toLowerCase().includes(destination.toLowerCase())) {
    return `${text} near ${destination}`.slice(0, 240);
  }
  return text.slice(0, 240);
}

function queriesFromCustomerSearchTurn(customerTurn = '', tripDestination = '', lodgingText = '') {
  const text = String(customerTurn || '').replace(/\s+/g, ' ').trim();
  const category = inferSearchCategory(text);
  const destination = searchAnchorFromTurn(text, tripDestination, lodgingText);
  return {
    destination,
    queries: [{
      category,
      q: customerPlaceQueryText(text, tripDestination, lodgingText),
      limit: 5,
      place: true,
    }],
  };
}

function placesToChatResultRows(places = []) {
  return (Array.isArray(places) ? places : []).flatMap((place) => {
    const thing = placeToTripThing(place);
    const sourceRef = thing?.metadata?.sourceRef;
    const id = String(sourceRef?.id || '').trim();
    const name = String(thing?.title || '').trim();
    if (!id || !name) return [];
    return [{ name, title: name, sourceRef: { source: String(sourceRef.source || thing.source || ''), id } }];
  });
}

async function loadTripLodgingThing(db, tripId) {
  if (!db || !tripId) return null;
  const rows = await db`
    select title, category, location, description
    from trip_things
    where trip_id = ${tripId}
      and category = 'hotel'
    order by created_at desc
    limit 1
  `;
  return rows[0] || null;
}

export async function runCustomerChatPlaceSearch({
  customerTurn = '',
  tripDestination = '',
  lodging = '',
  lodgingPoint = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchPlaces,
} = {}) {
  if (!isCustomerPlaceSearchTurn(customerTurn)) return { status: 'skip' };
  const providerEnv = buildProviderEnv(env);
  const plan = queriesFromCustomerSearchTurn(customerTurn, tripDestination, lodging);
  if (!plan.destination) {
    const error = 'Place search needs a trip destination or a named area in the message.';
    console.error(`customer chat place search refused: ${error}`);
    return {
      status: 'failed',
      error,
      placeResults: [],
      things: [],
      search: { providers: [{ provider: 'nominatim', status: 'error', reason: error, resultCount: 0 }] },
    };
  }
  try {
    const search = await searchImpl({
      destination: plan.destination,
      lodging,
      lodgingPoint,
      queries: plan.queries,
      env: providerEnv,
      fetchImpl,
    });
    const places = Array.isArray(search?.places) ? search.places : [];
    if (!places.length) {
      const error = `Place search returned no results for ${plan.destination}.`;
      console.error(`customer chat place search failed: ${error}`);
      return { status: 'failed', error, placeResults: [], things: [], search };
    }
    const things = places.map((place) => placeToTripThing(place));
    const placeResults = placesToChatResultRows(places);
    return { status: 'ok', error: null, places, things, placeResults, search };
  } catch (error) {
    const message = String(error?.message || error || 'place search failed').trim();
    console.error(`customer chat place search failed: ${message}`);
    const search = { providers: Array.isArray(error?.providers) ? error.providers : [] };
    return { status: 'failed', error: message, placeResults: [], things: [], search };
  }
}

export async function applyChatPlaceSearchForVacationTurn({
  db,
  tripId,
  requestId,
  customerTurn,
  tripDestination,
  payload,
  customerLive,
  turnId,
  env = process.env,
  publishShare,
  searchImpl,
  workerJobId = null,
  workerJobContext = null,
} = {}) {
  const placeSearchTurn = isCustomerPlaceSearchTurn(customerTurn);
  if (placeSearchTurn) {
    payload.wantedThings = [];
    payload.placeSearchTurn = true;
    customerLive.placeSearchTurn = true;
    if (workerJobId && workerJobContext) {
      await syncWorkerJobAfterInTurnPlaceSearch(db, workerJobId, workerInputAfterInTurnPlaceSearch(workerJobContext));
    }
  }
  const lodgingThing = await loadTripLodgingThing(db, tripId);
  const lodgingAnchor = lodgingAnchorFromThing(lodgingThing);
  const lodgingText = lodgingAnchor.text;
  const lodgingPoint = lodgingAnchor.point;
  const chatSearch = await runCustomerChatPlaceSearch({
    customerTurn,
    tripDestination,
    lodging: lodgingText,
    lodgingPoint,
    env: buildProviderEnv(env),
    searchImpl,
  });
  if (chatSearch.status === 'skip') return { kind: 'skip', placeResults: [], placeSearchTurn };
  const providerAttempts = Array.isArray(chatSearch.search?.providers) ? chatSearch.search.providers : [];
  if (chatSearch.status === 'failed') {
    const placeSearch = placeSearchTelemetry({
      status: 'failed',
      error: chatSearch.error,
      things: [],
      providerAttempts,
    });
    payload.placeSearch = placeSearch;
    customerLive.placeSearch = placeSearch;
    await db`
      update transcript_turns
      set payload = ${payload}
      where id = ${turnId}
    `;
    return { kind: 'failed', error: chatSearch.error, placeSearch, placeSearchTurn };
  }
  for (const thing of chatSearch.things) {
    await insertTripThing(db, { tripId, requestId, thing });
  }
  const placeSearch = placeSearchTelemetry({
    status: 'ok',
    things: chatSearch.things,
    providerAttempts,
  });
  payload.placeSearch = placeSearch;
  customerLive.placeSearch = placeSearch;
  if (chatSearch.things.length && publishShare) await publishShare(db, tripId);
  await db`
    update transcript_turns
    set payload = ${payload}
    where id = ${turnId}
  `;
  return { kind: 'ok', placeResults: chatSearch.placeResults, placeSearch, placeSearchTurn };
}

function inTurnPlaceRows(sources) {
  return (Array.isArray(sources) ? sources : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const ref = item.sourceRef && typeof item.sourceRef === 'object' ? item.sourceRef : null;
    const id = String(ref?.id ?? item.id ?? '').trim();
    const name = String(item.name ?? item.title ?? '').trim();
    return id && name ? [{ id, name }] : [];
  });
}

function spokenPlaceName(text, index) {
  const before = String(text || '').slice(Math.max(0, index - 80), index);
  return (before.match(/([\p{Lu}][\p{L}\p{M}'’.-]*(?:\s+[\p{Lu}][\p{L}\p{M}'’.-]*)*)\s*$/u) || [])[1] || '';
}

function unsourcedAgainstInTurnResults(reply, sources) {
  const text = String(reply || '');
  const rows = inTurnPlaceRows(sources);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const flagged = [];
  const cited = new Set();
  for (const match of text.matchAll(/\(id:([^)\s]+)\)/g)) {
    const id = match[1];
    cited.add(id);
    const row = byId.get(id);
    const spoken = spokenPlaceName(text, match.index);
    if (!row) flagged.push(spoken || id);
    else if (spoken && spoken.toLowerCase() !== row.name.toLowerCase()) flagged.push(spoken);
  }
  for (const row of rows) {
    const named = new RegExp(`(^|[^\\p{L}\\p{N}])${row.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'iu').test(text);
    if (named && !cited.has(row.id)) flagged.push(row.name);
  }
  return [...new Set(flagged)];
}

export function inTurnPlaceReplyViolation(reply, inTurnPlaceResults) {
  const sources = Array.isArray(inTurnPlaceResults) ? inTurnPlaceResults : [];
  if (!sources.length) return null;
  const invented = unsourcedAgainstInTurnResults(String(reply || ''), sources);
  if (!invented.length) return null;
  return {
    status: 'unsourced_place',
    invented,
    error: `reply cites place not from in-turn provider results: ${invented.join(', ')}`,
  };
}

export function blockInTurnPlaceReply(reply, enforceInTurnPlaces, inTurnPlaceResults, carry = {}) {
  if (!enforceInTurnPlaces) return null;
  const violation = inTurnPlaceReplyViolation(reply, inTurnPlaceResults);
  if (!violation) return null;
  console.error(`place search reply blocked: ${violation.error}`);
  return {
    reply: null,
    status: violation.status,
    reason: violation.error,
    invented: violation.invented,
    ...carry,
  };
}

function workerInputAfterInTurnPlaceSearch({
  customerId,
  tripId,
  requestId,
  queuedJobType,
  requestText,
  payload,
  jobFields,
}) {
  return {
    customerId,
    tripId,
    requestId,
    source: 'vacation-app',
    requestType: queuedJobType,
    requestText,
    payload,
    intakeEvent: jobFields.intakeEvent,
    wantedThings: [],
    roster: jobFields.roster,
    rosterError: jobFields.rosterError,
    destination: jobFields.destination,
    hasDates: jobFields.hasDates,
    title: jobFields.title,
    titleError: jobFields.titleError,
    intakeError: jobFields.intakeError,
    placeSearchHandledInTurn: true,
  };
}

export function buildLiveAppRewritePending({
  customerTurn,
  originalDraft,
  draftModel,
  quality,
  jevNote,
  jev,
  upsell,
  postIntake,
  intake,
  wantedThings,
  rosterList,
  rosterError,
  extractedDestination,
  extractedTitle,
  destinationError,
  titleError,
  destination,
  corpus,
  modelPlaceSources,
  inTurnProviderResults,
  enforceInTurnPlaces,
  tripContext,
  tripFacts,
  planTable,
  planLine,
  intent,
  seatDollars,
  seat,
  model,
  failureReason,
  draftLatencyMs,
  draftQualityMs,
}) {
  return {
    customerTurn,
    draft: originalDraft,
    draftModel,
    draftScore: quality.score,
    jevNote,
    quality,
    jev,
    upsell,
    postIntake,
    intake: intake === true,
    wantedThings: Array.isArray(wantedThings) ? wantedThings : [],
    roster: rosterList,
    rosterError: rosterError || null,
    extractedDestination: String(extractedDestination || ''),
    extractedTitle: String(extractedTitle || ''),
    destinationError: destinationError || null,
    titleError: titleError || null,
    destination,
    corpus,
    placeResults: modelPlaceSources,
    inTurnPlaceResults: inTurnProviderResults,
    enforceInTurnPlaces,
    tripContext,
    tripFacts,
    planTable,
    planLine,
    intent,
    seatDollars,
    seat,
    rawModelText: model?.text == null ? null : String(model.text),
    failureReason,
    interimReply: { text: null, model: null, ms: null },
    draftLatencyMs,
    qualityJevMs: draftQualityMs,
    model: {
      called: Boolean(model?.called),
      via: model?.via || null,
      responseModel: model?.responseModel || null,
      modelTier: model?.modelTier ?? null,
      genLatencyMs: draftLatencyMs,
      maxTokens: model?.maxTokens ?? null,
      beats: model?.beats || null,
    },
  };
}

export async function runVacationAppInTurnSearch({
  db,
  tripId,
  requestId,
  customerTurn,
  tripDestination,
  payload,
  customerLive,
  turnId,
  env = process.env,
  publishShare,
  workerJobId,
  workerJobContext,
  placeSearchTurn,
  webResearchTurn,
} = {}) {
  const providerEnv = buildProviderEnv(env);
  const searchTurn = await applyChatPlaceSearchForVacationTurn({
    db,
    tripId,
    requestId,
    customerTurn,
    tripDestination,
    payload,
    customerLive,
    turnId,
    env: providerEnv,
    publishShare,
    workerJobId,
    workerJobContext,
    searchImpl: searchPlaces,
  });
  if (searchTurn.kind === 'failed') {
    return { ok: false, status: 'place_search_failed', error: searchTurn.error, placeSearch: searchTurn.placeSearch };
  }
  const webTurn = searchTurn.kind === 'skip'
    ? await applyChatWebResearchForVacationTurn({
      db,
      tripId,
      requestId,
      customerTurn,
      payload,
      customerLive,
      turnId,
      env: providerEnv,
    })
    : { kind: 'skip', webResults: [], webResearchTurn: false };
  if (webTurn.kind === 'failed') {
    return { ok: false, status: 'web_search_failed', error: webTurn.error, webSearch: webTurn.webSearch };
  }
  const inTurnProviderResults = [...(searchTurn.placeResults || []), ...(webTurn.webResults || [])];
  return {
    ok: true,
    inTurnProviderResults,
    enforceInTurnSearch: (placeSearchTurn === true || webResearchTurn === true) && inTurnProviderResults.length > 0,
    webResearchTurn: webTurn.webResearchTurn,
  };
}

async function syncWorkerJobAfterInTurnPlaceSearch(db, jobId, input) {
  await db`
    update worker_jobs
    set input = ${input}
    where id = ${jobId}
  `;
}
