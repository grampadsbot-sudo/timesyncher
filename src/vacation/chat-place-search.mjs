import { insertTripThing } from './trip-things.mjs';
import { placeToTripThing, searchPlaces } from './place-search.mjs';
import { buildProviderEnv } from './provider-env.mjs';
import { placeSearchTelemetry, stampTurnClassifier, turnClassifierFailedTelemetry } from './in-turn-search-telemetry.mjs';
import { applyChatWebResearchForVacationTurn } from './chat-web-research.mjs';
import { lodgingAnchorFromThing } from './lodging-anchor.mjs';

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function inferSearchCategory(text = '') {
  const lower = String(text).toLowerCase();
  if (/\b(taco|restaurant|seafood|dinner|lunch|breakfast|brunch|coffee|cafe|food|dining|splurge|kid-?friendly)\b/.test(lower)) return 'restaurant';
  if (/\b(toy|book\s*store|bookstore|shop|store|shopping|boutique)\b/.test(lower)) return 'store';
  return 'activity';
}

function placeSearchDestinationFromClassification(classification, tripDestination = '', lodgingText = '') {
  if (classification?.anchorIsLodging === true && lodgingText) return lodgingText;
  const anchor = clean(classification?.anchor, 180);
  if (anchor) return anchor;
  return clean(tripDestination, 180);
}

function queriesFromPlaceClassification(classification, tripDestination = '', lodgingText = '') {
  const destination = placeSearchDestinationFromClassification(classification, tripDestination, lodgingText);
  const target = clean(classification?.target, 240);
  const category = inferSearchCategory(target || destination);
  const q = target
    ? `${target}${destination ? ` near ${destination}` : ''}`.trim().slice(0, 240)
    : destination.slice(0, 240);
  return {
    destination,
    queries: [{
      category,
      q,
      limit: 5,
      place: true,
    }],
  };
}

async function resolveTripIntakeForCustomerTurn({ text = '', env = process.env, classifyImpl } = {}) {
  const classification = await classifyImpl({ text, env });
  const turnKind = classification?.ok === true ? classification.turnKind : null;
  return {
    classification,
    placeSearchTurn: turnKind === 'place_search',
    webResearchTurn: turnKind === 'web_research',
    turnKind,
    classifierModel: classification?.routerModel || null,
  };
}

export async function classifyVacationAppCustomerTurn(requestText, env, classifyImpl) {
  return resolveTripIntakeForCustomerTurn({ text: requestText, env, classifyImpl });
}

export function intakeExtractedThings(placeSearchTurn, classification, webResearchTurn = false) {
  if (placeSearchTurn || webResearchTurn) return [];
  return classification?.ok === true ? classification.things : [];
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
  placeSearchTurn = false,
  classification = null,
  tripDestination = '',
  lodging = '',
  lodgingPoint = null,
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchPlaces,
} = {}) {
  if (!placeSearchTurn) return { status: 'skip' };
  const providerEnv = buildProviderEnv(env);
  const plan = queriesFromPlaceClassification(classification, tripDestination, lodging);
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
  classification,
  placeSearchTurn = false,
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
  const chatSearch = await runCustomerChatPlaceSearch({
    placeSearchTurn,
    classification,
    tripDestination,
    lodging: lodgingAnchor.text,
    lodgingPoint: lodgingAnchor.point,
    env: buildProviderEnv(env),
    searchImpl,
  });
  if (chatSearch.status === 'skip') return { kind: 'skip', placeResults: [], placeSearchTurn };
  const providerAttempts = Array.isArray(chatSearch.search?.providers) ? chatSearch.search.providers : [];
  const classifierMeta = {
    turnKind: classification?.turnKind || 'place_search',
    classifierModel: classification?.routerModel || null,
  };
  if (chatSearch.status === 'failed') {
    const placeSearch = placeSearchTelemetry({
      status: 'failed',
      error: chatSearch.error,
      things: [],
      providerAttempts,
      ...classifierMeta,
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
    ...classifierMeta,
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

import { unsourcedAgainstInTurnResults } from './provider-result-context.mjs';

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
  classification,
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
  stampTurnClassifier(payload, customerLive, classification);
  if (classification?.ok !== true) {
    const reason = String(classification?.error || 'trip intake classification failed').trim();
    const failedTelemetry = turnClassifierFailedTelemetry(reason);
    payload.placeSearch = failedTelemetry;
    payload.webSearch = failedTelemetry;
    customerLive.placeSearch = failedTelemetry;
    customerLive.webSearch = failedTelemetry;
    await db`
      update transcript_turns
      set payload = ${payload}
      where id = ${turnId}
    `;
    return {
      ok: false,
      status: 'turn_classifier_failed',
      error: reason,
      placeSearch: failedTelemetry,
      webSearch: failedTelemetry,
    };
  }

  const providerEnv = buildProviderEnv(env);
  const searchTurn = await applyChatPlaceSearchForVacationTurn({
    db,
    tripId,
    requestId,
    classification,
    placeSearchTurn,
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
      classification,
      webResearchTurn,
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
