import { searchPlaces } from './place-search.mjs';
import { buildProviderEnv } from './provider-env.mjs';
import { resolvePlaceSearchAreaDetail, resolvePlaceSearchRelevanceArea } from './place-search-anchor.mjs';
import { placeSearchDiagnosticsFromError } from './place-search-failure-diagnostics.mjs';
import { queriesFromPlaceClassification } from './place-search-query-plan.mjs';
import { chatPlaceSearchGeocodeDestination } from './place-search-named-target.mjs';
import {
  customerChatPlaceSearchNoResults,
  finishCustomerChatPlaceSearch,
} from './chat-place-search-outcomes.mjs';

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function runCustomerChatPlaceSearch({
  placeSearchTurn = false,
  classification = null,
  tripDestination = '',
  tripResolvedArea = '',
  tripStatedLodgingArea = '',
  lodging = '',
  lodgingPoint = null,
  statedLodgingArea = '',
  tripId = '',
  tripDestinationCenter = null,
  db = null,
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
      tripDestinationLabel: clean(tripDestination, 180),
      tripId,
      db,
      tripDestinationCenter,
      lodging: classification?.anchorIsLodging === true ? lodging : '',
      lodgingPoint: classification?.anchorIsLodging === true ? lodgingPoint : null,
      relevanceStatedLodgingArea: classification?.anchorIsLodging === true
        ? (String(statedLodgingArea || tripStatedLodgingArea || '').trim())
        : '',
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
      ...(code === 'relevance_judge_failed' ? {
        reason: 'relevance_judge_failed',
        ...(error?.judgeTimedOut === true ? { judgeTimedOut: true } : {}),
        ...(Number.isFinite(Number(error?.judgeTimeoutMs)) ? { judgeTimeoutMs: Number(error.judgeTimeoutMs) } : {}),
        ...(Number.isFinite(Number(error?.judgeStageBudgetMs)) ? { judgeStageBudgetMs: Number(error.judgeStageBudgetMs) } : {}),
      } : {}),
      ...(code === 'all_providers_failed' ? { reason: 'all_providers_failed' } : {}),
      ...(code === 'geocode_failed' ? { reason: 'geocode_failed' } : {}),
      internalError: message,
    };
    return finishCustomerChatPlaceSearch({ places: [], search, errorMessage: message });
  }
}
