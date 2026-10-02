import { transcriptCustomerId } from './collaborator-app-seat.mjs';
import { liveTurnRecord } from './live-app-turn.mjs';
import { appReplyTelemetry } from './reply-telemetry.mjs';
import { attachBlockedFirstIntakeDraft } from './blocked-turn-payload.mjs';
import { assertCustomerReplyShippable } from './reply-id-citation.mjs';

export async function outboundAppReplyForRequest(db, requestId) {
  const id = String(requestId || '').trim();
  if (!id) return null;
  const rows = await db`
    select id, body
    from transcript_turns
    where request_id = ${id}
      and speaker = 'app'
      and channel = 'vacation-app'
      and direction = 'outbound'
    order by sent_at asc
    limit 1
  `;
  return rows[0] || null;
}

export async function markWorkerJobLiveHandled(db, jobId) {
  const id = String(jobId || '').trim();
  if (!id) return;
  await db`
    update worker_jobs
    set status = 'completed',
      result = ${JSON.stringify({ liveAppReply: true })},
      updated_at = now()
    where id = ${id}
      and status in ('pending', 'retry')
  `;
}

export async function storeReplyFailure(db, turnId, payload) {
  await db`
    update transcript_turns
    set payload = ${payload}
    where id = ${turnId}
  `;
}

function liveAppReplyFailureOutcome(produced = {}) {
  const replyFailure = String(produced.reason || 'live dispatcher returned no reply');
  const failureStatus = produced.status === 'unsourced_place' ? 'unsourced_place' : 'reply_unavailable';
  return {
    replyFailure,
    failureStatus,
    invented: produced.status === 'unsourced_place' ? (produced.invented || []) : undefined,
  };
}

export { attachBlockedFirstIntakeDraft, vacationAppTurnPayloadForClient } from './blocked-turn-payload.mjs';

export function applyLiveAppReplyFailureToPayload(payload, customerLive, produced = {}) {
  const failure = liveAppReplyFailureOutcome(produced);
  payload.replyFailure = failure.replyFailure;
  customerLive.replyFailure = failure.replyFailure;
  attachBlockedFirstIntakeDraft(payload, produced);
  if (produced.status === 'unsourced_place') {
    const record = {
      status: produced.status,
      invented: Array.isArray(produced.invented) ? produced.invented : [],
      error: failure.replyFailure,
    };
    payload.unsourcedPlaceReply = record;
    customerLive.unsourcedPlaceReply = record;
  }
  return failure;
}

export async function persistVacationAppOutboundReply({
  db,
  transcriptOwnerId,
  tripId,
  requestId,
  jobId,
  produced,
  base,
  exchangeLatency,
  sessionE2eMs,
  customerTurnIndex,
  speakerName,
  seat,
  classification,
  jobFields,
  firstIntake,
  requestText,
  intakeThings,
  customerTurnId = null,
  recordCustomerThingNotes,
  publishIntakeShare,
  vacationAppTripSummary,
}) {
  const priorApp = await outboundAppReplyForRequest(db, requestId);
  if (priorApp?.id) {
    await markWorkerJobLiveHandled(db, jobId);
    return { ...base, ok: true, status: 'replied', reply: priorApp.body, duplicateSuppressed: true, error: null };
  }
  const appLive = liveTurnRecord({
    turnIndex: customerTurnIndex + 1,
    role: 'app',
    modality: 'text',
    text: produced.reply,
    at: new Date().toISOString(),
    latencyMs: exchangeLatency,
    sessionE2eMs,
    jev: produced.jev,
    model: produced.model,
    rules: produced.rules,
  });
  await db`
    insert into transcript_turns (
      customer_id, trip_id, request_id, speaker, channel, body, payload, direction,
      sent_at, response_latency_ms
    )
    values (
      ${transcriptOwnerId}, ${tripId}, ${requestId}, 'app', 'vacation-app', ${produced.reply},
      ${{ source: 'vacation_app', surface: 'vacation-app', selectedTripId: tripId, liveTranscript: appLive }},
      'outbound', now(), ${exchangeLatency}
    )
  `;
  const itinerary = await recordCustomerThingNotes(
    db,
    tripId,
    requestText,
    {
      collaborator: Boolean(seat),
      speakerName,
      appReply: produced.reply,
      roster: Array.isArray(classification.roster) ? classification.roster : [],
      rosterError: classification.ok === true ? null : (classification.error || 'trip intake classification failed'),
      askRoster: classification.ok !== true || (classification.intake === true && !(classification.roster || []).length),
      extractedDestination: jobFields.destination,
      extractedTitle: jobFields.title,
      destinationError: jobFields.destinationError,
      titleError: jobFields.titleError,
      customerTurnId,
    },
    firstIntake ? requestText : '',
    intakeThings,
  );
  if (itinerary.length) await publishIntakeShare(db, tripId);
  await markWorkerJobLiveHandled(db, jobId);
  const vacationRows = await db`
    select id, title, destination, start_date, end_date, status, metadata
    from trips
    where id = ${tripId}
    limit 1
  `;
  return {
    ...base,
    ok: true,
    status: 'replied',
    reply: produced.reply,
    ...appReplyTelemetry(appLive),
    appTurnIndex: appLive.turnIndex,
    itinerary,
    vacation: vacationRows[0] ? vacationAppTripSummary(vacationRows[0]) : null,
    error: null,
  };
}

export async function commitShippedRewrite(db, session, pending, finished, { recordCustomerThingNotes, publishIntakeShare }) {
  assertCustomerReplyShippable(finished.reply, pending.tripId, pending.turnActionResults || null);
  const wallMs = Math.max(1, Date.now() - (Number(pending.wallStarted) || Date.now()));
  const appLive = liveTurnRecord({
    turnIndex: Number(pending.customerTurnIndex) + 1,
    role: 'app',
    modality: 'text',
    text: finished.reply,
    at: new Date().toISOString(),
    latencyMs: wallMs,
    sessionE2eMs: Math.max(1, Date.now() - (Number(pending.sessionStartedMs) || Date.now())),
    jev: finished.jev,
    model: finished.model,
    rules: finished.rules,
    speakerName: pending.speakerName || null,
  });
  await db`
    insert into transcript_turns (
      customer_id, trip_id, request_id, speaker, channel, body, payload, direction,
      sent_at, response_latency_ms
    )
    values (
      ${transcriptCustomerId(session)}, ${pending.tripId}, ${pending.requestId}, 'app', 'vacation-app', ${finished.reply},
      ${{ source: 'vacation_app', surface: 'vacation-app', selectedTripId: pending.tripId, liveTranscript: appLive }},
      'outbound', now(), ${wallMs}
    )
  `;
  const itinerary = await recordCustomerThingNotes(
    db,
    pending.tripId,
    pending.customerTurn,
    {
      collaborator: pending.collaborator === true,
      speakerName: pending.speakerName || '',
      appReply: finished.reply,
      roster: Array.isArray(pending.roster) ? pending.roster : [],
      rosterError: pending.rosterError || null,
      askRoster: Boolean(pending.rosterError),
      extractedDestination: pending.extractedDestination || '',
      extractedTitle: pending.extractedTitle || '',
      destinationError: pending.destinationError || null,
      titleError: pending.titleError || null,
    },
    pending.postIntake === true ? pending.customerTurn : '',
    pending.wantedThings || [],
  );
  if (itinerary.length) await publishIntakeShare(db, pending.tripId);
  await db`
    update onboarding_sessions
    set metadata = coalesce(metadata, '{}'::jsonb) - 'pendingRewrite',
      updated_at = now()
    where id = ${session.id}
  `;
  return {
    ok: true,
    status: 'replied',
    reply: finished.reply,
    ...appReplyTelemetry(appLive),
    interimReply: finished.log?.interimReply || pending.interimReply || null,
    itinerary,
    error: null,
  };
}
