import { placeSearchTelemetry } from './in-turn-search-telemetry.mjs';

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
} = {}) {
  const placeSearch = placeSearchTelemetry({
    status: 'no_results',
    error: null,
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
  return placeSearch;
}

export function workerInputAfterInTurnPlaceSearch({
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
    startDate: jobFields.startDate,
    endDate: jobFields.endDate,
    title: jobFields.title,
    titleError: jobFields.titleError,
    intakeError: jobFields.intakeError,
    placeSearchHandledInTurn: true,
  };
}

export async function syncWorkerJobAfterInTurnPlaceSearch(db, jobId, input) {
  await db`
    update worker_jobs
    set input = ${input}
    where id = ${jobId}
  `;
}

export function inTurnSearchNoResultsReturn(placeSearch) {
  return {
    ok: true,
    inTurnProviderResults: [],
    enforceInTurnSearch: false,
    placeSearch,
    webResearchTurn: false,
  };
}
