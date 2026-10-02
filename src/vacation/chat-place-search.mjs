import { placeToTripThing, searchPlaces } from './place-search.mjs';
import { buildProviderEnv } from './provider-env.mjs';
import { placeSearchTelemetry, placeSearchStatusFromProviderAttempts, placeSearchFailureRouteStatus, stampTurnClassifier, turnClassifierFailedTelemetry } from './in-turn-search-telemetry.mjs';
import { applyChatWebResearchForVacationTurn } from './chat-web-research.mjs';
import { loadTripLodgingThing, lodgingAnchorFromThing } from './lodging-anchor.mjs';
import { loadTripPlaceSearchContext, resolvePlaceSearchAreaDetail, resolvePlaceSearchRelevanceArea } from './place-search-anchor.mjs';
import { placeSearchDiagnosticsFromError } from './place-search-failure-diagnostics.mjs';
import {
  inTurnPlaceSearchSoftNoResults,
  placeSearchClientError,
} from './place-search-reply-facts.mjs';
import { queriesFromPlaceClassification } from './place-search-query-plan.mjs';
import { chatPlaceSearchGeocodeDestination } from './place-search-named-target.mjs';
import { unsourcedAgainstInTurnResults } from './provider-result-context.mjs';
import {
  customerChatPlaceSearchNoResults,
  finishCustomerChatPlaceSearch,
  inTurnSearchNoResultsReturn,
  persistTurnPlaceSearchNoResults,
  syncWorkerJobAfterInTurnPlaceSearch,
} from './chat-place-search-outcomes.mjs';
import { insertStampedChatPlaceThings, workerInputAfterInTurnPlaceSearch } from './chat-place-search-when.mjs';
import { maybePersistFirstIntakeLodging } from './intake-lodging-queue-persist.mjs';
function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
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

function intakeLodgingFromClassification(classification) {
  const things = classification?.ok === true && Array.isArray(classification.things) ? classification.things : [];
  const lodging = things.filter((thing) => String(thing?.kind || '').toLowerCase() === 'hotel');
  return lodging.length ? lodging : [];
}

export function intakeExtractedThings(placeSearchTurn, classification, webResearchTurn = false) {
  if (webResearchTurn) return [];
  if (placeSearchTurn) return intakeLodgingFromClassification(classification);
  return classification?.ok === true ? classification.things : [];
}

/** Trip intake ship path: classifier things, else job wantedThings (firstIntake queue). */
export function intakeThingsForPersistence(placeSearchTurn, classification, webResearchTurn = false, wantedThings = []) {
  if (webResearchTurn) return [];
  if (placeSearchTurn) return intakeLodgingFromClassification(classification);
  const things = classification?.ok === true && Array.isArray(classification.things) ? classification.things : [];
  if (things.length) return things;
  return Array.isArray(wantedThings) ? wantedThings : [];
}

function inTurnPlaceResultFromTripThing(inserted) {
  const name = String(inserted?.title || '').trim();
  const id = String(inserted?.id || '').trim();
  if (!name || !id) return null;
  return { name, title: name, sourceRef: { source: 'trip_thing', id } };
}

export async function runCustomerChatPlaceSearch({
  placeSearchTurn = false,
  classification = null,
  tripDestination = '',
  tripResolvedArea = '',
  tripStatedLodgingArea = '',
  lodging = '',
  lodgingPoint = null,
  tripId = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  searchImpl = searchPlaces,
} = {}) {
  if (!placeSearchTurn) return { status: 'skip' };
  const providerEnv = buildProviderEnv(env);
  const searchAnchor = resolvePlaceSearchAreaDetail({
    classification,
    lodgingText: lodging,
    tripStatedLodgingArea,
    tripDestination,
    tripResolvedArea,
  });
  const plan = queriesFromPlaceClassification(classification, tripDestination, lodging, tripResolvedArea, tripStatedLodgingArea);
  const geocodeDestination = chatPlaceSearchGeocodeDestination({
    planQueries: plan.queries,
    tripDestination,
    tripResolvedArea,
    planDestination: plan.destination,
  });
  if (!geocodeDestination) {
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
      destination: geocodeDestination,
      tripId,
      lodging: classification?.anchorIsLodging === true ? lodging : '',
      lodgingPoint: classification?.anchorIsLodging === true ? lodgingPoint : null,
      keepAreaText: classification?.anchorIsLodging === true && !lodging,
      queries: plan.queries,
      relevanceTarget: clean(classification?.target, 240),
      relevanceArea: resolvePlaceSearchRelevanceArea({
        classification,
        lodgingText: lodging,
        tripStatedLodgingArea,
        tripDestination,
        tripResolvedArea,
      }) || plan.destination,
      searchAnchor,
      env: providerEnv,
      fetchImpl,
    });
    const places = Array.isArray(search?.places) ? search.places : [];
    if (search?.outcomeStatus === 'no_results') return customerChatPlaceSearchNoResults(search);
    if (!places.length) {
      return finishCustomerChatPlaceSearch({
        places: [],
        search,
        errorMessage: `Place search returned no results for ${plan.destination}.`,
      });
    }
    return finishCustomerChatPlaceSearch({ places, search });
  } catch (error) {
    const message = String(error?.message || error || 'place search failed').trim();
    console.error(`customer chat place search failed: ${message}`);
    const code = String(error?.code || '').trim();
    const search = {
      providers: Array.isArray(error?.providers) ? error.providers : [],
      ...placeSearchDiagnosticsFromError(error),
      ...(code ? { code } : {}),
      ...(code === 'relevance_rejected_all' ? { reason: 'relevance_rejected_all' } : {}),
      ...(code === 'prior_db_sole_source' ? { reason: 'prior_db_sole_source' } : {}),
      ...(code === 'relevance_judge_failed' ? { reason: 'relevance_judge_failed' } : {}),
      ...(code === 'all_providers_failed' ? { reason: 'all_providers_failed' } : {}),
      internalError: message,
    };
    return finishCustomerChatPlaceSearch({ places: [], search, errorMessage: message });
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
  const tripPlaceContext = await loadTripPlaceSearchContext(db, tripId);
  const chatSearch = await runCustomerChatPlaceSearch({
    placeSearchTurn,
    classification,
    tripDestination: tripPlaceContext.tripDestination || tripDestination,
    tripResolvedArea: tripPlaceContext.tripResolvedArea,
    tripStatedLodgingArea: tripPlaceContext.tripStatedLodgingArea,
    lodging: lodgingAnchor.text,
    lodgingPoint: lodgingAnchor.point,
    tripId,
    env: buildProviderEnv(env),
    searchImpl,
  });
  if (chatSearch.status === 'skip') return { kind: 'skip', placeResults: [], placeSearchTurn };
  const providerAttempts = Array.isArray(chatSearch.search?.providers) ? chatSearch.search.providers : [];
  const classifierMeta = {
    turnKind: classification?.turnKind || 'place_search',
    targetKind: classification?.targetKind || null,
    classifierModel: classification?.routerModel || null,
  };
  if (chatSearch.status === 'no_results') {
    const placeSearch = await persistTurnPlaceSearchNoResults(db, turnId, {
      payload,
      customerLive,
      providerAttempts,
      classifierMeta,
      search: chatSearch.search,
    });
    return { kind: 'no_results', error: null, placeSearch, placeSearchTurn };
  }
  const outcomeStatus = placeSearchStatusFromProviderAttempts(chatSearch.things);
  if (outcomeStatus === 'failed') {
    const placeSearch = placeSearchTelemetry({
      status: 'failed',
      error: chatSearch.error,
      reason: chatSearch.search?.reason || null,
      relevanceRejections: chatSearch.search?.relevanceRejections || null,
      judgeInput: chatSearch.search?.judgeInput || null,
      searchCenter: chatSearch.search?.searchCenter || null,
      anchor: chatSearch.search?.anchor || null,
      survivingPriorDbTitles: chatSearch.search?.survivingPriorDbTitles || null,
      dedupeMerges: chatSearch.search?.dedupeMerges || null,
      judgeHttpStatus: chatSearch.search?.judgeHttpStatus ?? null,
      judgeBodySnippet: chatSearch.search?.judgeBodySnippet ?? null,
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
  const { placeResults, placeSearchReplyFacts: placeSearchSavedReplyFacts } = await insertStampedChatPlaceThings(db, {
    tripId,
    requestId,
    things: chatSearch.things,
    classification,
  });
  const placeSearch = placeSearchTelemetry({
    status: 'ok',
    things: chatSearch.things,
    providerAttempts,
    relevanceRejections: chatSearch.search?.relevanceRejections?.length ? chatSearch.search.relevanceRejections : null,
    judgeInput: chatSearch.search?.judgeInput || null,
    searchCenter: chatSearch.search?.searchCenter || null,
    anchor: chatSearch.search?.anchor || null,
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
  return {
    kind: 'ok',
    placeResults,
    placeSearch,
    placeSearchTurn,
    ...(placeSearchSavedReplyFacts ? { placeSearchReplyFacts: placeSearchSavedReplyFacts } : {}),
  };
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
  searchImpl = searchPlaces,
} = {}) {
  stampTurnClassifier(payload, customerLive, classification);
  if (classification?.ok === true && workerJobContext?.firstIntake && tripId && !workerJobContext?.seat) {
    await maybePersistFirstIntakeLodging({
      db,
      tripId,
      firstIntake: true,
      classificationOk: true,
      seat: null,
      wantedThings: workerJobContext.jobFields?.wantedThings || [],
      customerTurnId: turnId,
      extractedDestination: workerJobContext.jobFields?.destination || '',
      env,
    });
  }
  if (classification?.ok !== true) {
    const reason = String(classification?.error || 'trip intake classification failed').trim();
    const failedTelemetry = turnClassifierFailedTelemetry(reason, classification);
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
    const soft = inTurnPlaceSearchSoftNoResults({
      classification,
      tripDestination,
      placeSearch: searchTurn.placeSearch,
      turnError: searchTurn.error,
    });
    if (soft) return { ok: true, ...soft };
    const routeStatus = placeSearchFailureRouteStatus(searchTurn.placeSearch?.reason);
    return { ok: false, status: routeStatus, error: placeSearchClientError(searchTurn.placeSearch, searchTurn.error), placeSearch: searchTurn.placeSearch };
  }
  if (searchTurn.kind === 'no_results') {
    return inTurnSearchNoResultsReturn(searchTurn.placeSearch, { classification, tripDestination });
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
    ...(searchTurn.placeSearchReplyFacts ? { placeSearchReplyFacts: searchTurn.placeSearchReplyFacts } : {}),
  };
}

