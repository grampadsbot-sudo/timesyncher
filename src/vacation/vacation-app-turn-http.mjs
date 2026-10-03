export function vacationAppTurnHadInTurnPlaceSave(queued = {}) {
  const placeSearch = queued.placeSearch;
  if (!placeSearch || typeof placeSearch !== 'object') return false;
  if (String(placeSearch.status || '').trim() !== 'ok') return false;
  const results = Array.isArray(placeSearch.results) ? placeSearch.results : [];
  return results.length > 0;
}

export function vacationAppItineraryPostStatus(queued = {}, hasSelectedTrip = false) {
  if (queued?.ok) return hasSelectedTrip ? 201 : 200;
  if (vacationAppTurnHadInTurnPlaceSave(queued)) return hasSelectedTrip ? 201 : 200;
  return 502;
}

export function vacationAppReplyFailureAfterInTurnSave(base, failure) {
  console.error(JSON.stringify({
    event: 'vacation_app_reply_failed_after_in_turn_save',
    requestId: base?.requestId || null,
    tripId: base?.selectedTripId || null,
    status: failure.failureStatus,
    error: failure.replyFailure,
  }));
  return {
    ...base,
    ok: true,
    status: failure.failureStatus,
    reply: null,
    error: failure.replyFailure,
    replyFailed: true,
    ...(failure.invented ? { invented: failure.invented } : {}),
  };
}

export function vacationAppReplyFailureTurnReturn(base, failure) {
  if (vacationAppTurnHadInTurnPlaceSave(base)) {
    return vacationAppReplyFailureAfterInTurnSave(base, failure);
  }
  return {
    ...base,
    ok: false,
    status: failure.failureStatus,
    error: failure.replyFailure,
    invented: failure.invented,
  };
}

export function vacationAppBlockedReplyTurnReturn(base, blocked) {
  if (vacationAppTurnHadInTurnPlaceSave(base)) {
    return vacationAppReplyFailureAfterInTurnSave(base, {
      failureStatus: blocked.status,
      replyFailure: blocked.error,
    });
  }
  return blocked;
}
