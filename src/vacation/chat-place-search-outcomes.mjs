import { placeSearchTelemetry } from './in-turn-search-telemetry.mjs';
import { placeSearchReplyFacts } from './place-search-reply-facts.mjs';
import { pickPlaceSearchDiagnostics } from './place-search-diagnostics-pick.mjs';

export function customerChatPlaceSearchNoResults(search) {
  return {
    status: 'no_results',
    error: null,
    placeResults: [],
    things: [],
    search,
  };
}

export async function persistTurnPlaceSearchNoResults(db, turnId, {
  payload,
  customerLive,
  providerAttempts = [],
  classifierMeta = {},
  search = null,
  providerErrors = null,
  judgeInput = null,
  searchCenter = null,
  anchor = null,
} = {}) {
  const diagnostics = pickPlaceSearchDiagnostics(search);
  const placeSearch = placeSearchTelemetry({
    status: 'no_results',
    error: null,
    things: [],
    providerAttempts,
    providerErrors: providerErrors ?? diagnostics.providerErrors ?? null,
    judgeInput: judgeInput ?? diagnostics.judgeInput ?? null,
    searchCenter: searchCenter ?? diagnostics.searchCenter ?? null,
    anchor: anchor ?? diagnostics.anchor ?? null,
    braveLookups: diagnostics.braveLookups ?? null,
    anchorRadiusPolicy: diagnostics.anchorRadiusPolicy ?? null,
    anchorRadiusRejections: diagnostics.anchorRadiusRejections ?? null,
    relevanceRejections: diagnostics.relevanceRejections ?? null,
    dedupeMerges: diagnostics.dedupeMerges ?? null,
    ...classifierMeta,
    ...(Number(diagnostics.anchorRadiusRejected) > 0
      ? { anchorRadiusRejected: diagnostics.anchorRadiusRejected }
      : {}),
  });
  payload.placeSearch = placeSearch;
  customerLive.placeSearch = placeSearch;
  await db`
    update transcript_turns
    set payload = ${payload}
    where id = ${turnId}
  `;
  return placeSearch;
}

export async function syncWorkerJobAfterInTurnPlaceSearch(db, jobId, input) {
  await db`
    update worker_jobs
    set input = ${input}
    where id = ${jobId}
  `;
}

export function inTurnSearchNoResultsReturn(placeSearch, { classification = null, tripDestination = '' } = {}) {
  const target = String(classification?.target || '').trim();
  const area = String(classification?.anchor || tripDestination || '').trim();
  return {
    ok: true,
    inTurnProviderResults: [],
    enforceInTurnSearch: false,
    placeSearch,
    webResearchTurn: false,
    placeSearchReplyFacts: placeSearchReplyFacts({
      target,
      area,
      destination: tripDestination,
      code: 'all_providers_failed',
    }),
  };
}
