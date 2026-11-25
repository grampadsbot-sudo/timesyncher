import { sayVacationNotTrip } from './customer-visible-copy.mjs';
import { ensurePostIntakeCollabCopy } from './post-intake-collab-copy.mjs';
import { syncFirstIntakeCustomerInputOnTurn } from './first-intake-customer-input.mjs';
import { transcriptCustomerId } from './collaborator-app-seat.mjs';

export function stampCustomerLivePayload(payload, customerLive, { firstIntake, produced } = {}) {
  payload.liveTranscript = customerLive;
  syncFirstIntakeCustomerInputOnTurn(payload, customerLive, { firstIntake, produced });
}
import { liveTurnRecord } from './live-app-turn.mjs';
import { appReplyTelemetry, logVacationAppReplyTelemetry } from './reply-telemetry.mjs';
import { attachBlockedFirstIntakeDraft } from './blocked-turn-payload.mjs';
import { assertCustomerReplyShippable } from './reply-id-citation.mjs';
import { replyClaimContextFromIntent } from './reply-action-claim.mjs';
import { rewriteBlockedActionClaim } from './reply-action-claim-rewrite.mjs';
import { savedThingFieldsForTurn } from './turn-saved-thing-ids.mjs';
import { sessionReplyBackend } from './vk-bot-mcp-reply.mjs';
import { openRouterTurnTelemetry } from './openrouter-call-ledger.mjs';

async function storePostReplyCallTelemetry(db, requestId, appLive) {
  const telemetry = openRouterTurnTelemetry();
  if (telemetry.openrouterTotals?.calls === appLive.openrouterTotals?.calls) return;
  await db`
    update transcript_turns
    set payload = jsonb_set(payload, '{liveTranscript}', (payload->'liveTranscript') || ${telemetry}::jsonb)
    where request_id = ${requestId} and speaker = 'app' and channel = 'vacation-app' and direction = 'outbound'
  `.catch(() => console.error('vacation_app_openrouter_telemetry_store_failed'));
}

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
  vacationAppTripSummary, replyBackend = '',
  postStartedMs = null,
  postBudgetMs = null,
  activityCommitDecisionsImpl = null,
}) {
  const judgedQuality = produced?.model?.quality?.judged === true
    ? produced.model.quality
    : (produced?.quality?.judged === true ? produced.quality : null);
  if (!judgedQuality) {
    return {
      ...base,
      ok: false,
      status: 'reply_unavailable',
      reply: null,
      error: String(produced?.quality?.reason || produced?.reason || 'quality_not_judged'),
    };
  }
  if (firstIntake && produced?.reply) produced.reply = ensurePostIntakeCollabCopy(produced.reply);
  if (produced?.reply) produced.reply = sayVacationNotTrip(produced.reply);
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
    model: produced.model?.quality?.judged === true ? produced.model : { ...(produced.model || {}), quality: judgedQuality },
    rules: produced.rules, backend: replyBackend,
  });
  Object.assign(appLive, openRouterTurnTelemetry());
  logVacationAppReplyTelemetry(appLive);
  await db`
    insert into transcript_turns (
      customer_id, trip_id, request_id, speaker, channel, body, payload, direction,
      sent_at, response_latency_ms
    )
    values (
      ${transcriptOwnerId}, ${tripId}, ${requestId}, 'app', 'vacation-app', ${produced.reply},
      ${{
        source: 'vacation_app',
        surface: 'vacation-app',
        selectedTripId: tripId,
        liveTranscript: appLive,
        ...(base?.turnActionResults?.invite?.ok === false ? { inviteActionFailed: true } : {}),
      }},
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
      wantedThings: Array.isArray(jobFields.wantedThings) ? jobFields.wantedThings : [],
      requestId,
      postStartedMs,
      postBudgetMs,
      activityCommitDecisionsImpl,
    },
    firstIntake ? requestText : '',
    intakeThings,
  );
  if (itinerary.length) await publishIntakeShare(db, tripId);
  await storePostReplyCallTelemetry(db, requestId, appLive);
  const savedFields = await savedThingFieldsForTurn(db, tripId, itinerary?.savedThingIds || []);
  const deferredWork = itinerary?.deferredWork?.deferred ? itinerary.deferredWork : null;
  const postReplyTimings = itinerary?.postReplyTimings || null;
  if (customerTurnId) {
    await db`
      update transcript_turns
      set payload = coalesce(payload, '{}'::jsonb) || ${{
        thingId: savedFields.thingId,
        sharedDayIds: savedFields.sharedDayIds,
        savedThings: savedFields.savedThings,
        ...(deferredWork ? { deferredWork } : {}),
        ...(postReplyTimings ? { postReplyTimings } : {}),
      }}
      where id = ${customerTurnId}
    `;
  }
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
    thingId: savedFields.thingId,
    sharedDayIds: savedFields.sharedDayIds,
    savedThings: savedFields.savedThings,
    ...(deferredWork ? { deferredWork } : {}),
    ...(postReplyTimings ? { postReplyTimings } : {}),
    vacation: vacationRows[0] ? vacationAppTripSummary(vacationRows[0]) : null,
    error: null,
  };
}

export async function commitShippedRewrite(db, session, pending, finished, { recordCustomerThingNotes, publishIntakeShare, postStartedMs = null, postBudgetMs = null }) {
  const claimContext = replyClaimContextFromIntent({
    ...(pending.intent && typeof pending.intent === 'object' ? pending.intent : {}),
    turnActionResults: pending.turnActionResults || null,
    classification: pending.turnActionResults?.invite
      ? { inviteeName: pending.turnActionResults.invite.inviteeName }
      : null,
  });
  try {
    assertCustomerReplyShippable(finished.reply, pending.tripId, pending.turnActionResults || null, claimContext);
  } catch (error) {
    if (error?.name !== 'reply_action_claim_blocked') throw error;
    const recovered = await rewriteBlockedActionClaim({
      draft: finished.reply,
      reason: error.reason,
      customerTurn: pending.customerTurn || '',
      customerTurnId: pending.customerTurnId || '',
      tripId: pending.tripId || '',
      turnActionResults: pending.turnActionResults || null,
      replyClaimContext: claimContext,
      jev: finished.jev || pending.jev || null,
      rules: finished.rules || null,
    });
    if (!recovered.reply || recovered.reason) {
      return { ok: false, status: 'reply_unavailable', reply: null, error: 'reply_unavailable' };
    }
    finished = { ...finished, reply: recovered.reply, model: recovered.model || finished.model };
  }
  const judgedQuality = finished?.model?.quality?.judged === true
    ? finished.model.quality
    : (finished?.quality?.judged === true ? finished.quality : null);
  if (!judgedQuality) {
    return { ok: false, status: 'reply_unavailable', reply: null, error: String(finished?.quality?.reason || finished?.reason || 'quality_not_judged') };
  }
  finished = { ...finished, reply: sayVacationNotTrip(finished.reply) };
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
    model: finished.model?.quality?.judged === true ? finished.model : { ...(finished.model || {}), quality: judgedQuality },
    rules: finished.rules, backend: sessionReplyBackend(session),
    speakerName: pending.speakerName || null,
  });
  Object.assign(appLive, openRouterTurnTelemetry());
  logVacationAppReplyTelemetry(appLive);
  await db`
    insert into transcript_turns (
      customer_id, trip_id, request_id, speaker, channel, body, payload, direction,
      sent_at, response_latency_ms
    )
    values (
      ${transcriptCustomerId(session)}, ${pending.tripId}, ${pending.requestId}, 'app', 'vacation-app', ${finished.reply},
      ${{
        source: 'vacation_app',
        surface: 'vacation-app',
        selectedTripId: pending.tripId,
        liveTranscript: appLive,
        ...(pending?.turnActionResults?.invite?.ok === false ? { inviteActionFailed: true } : {}),
      }},
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
      customerTurnId: pending.customerTurnId || null,
      requestId: pending.requestId || null,
      postStartedMs,
      postBudgetMs,
    },
    pending.postIntake === true ? pending.customerTurn : '',
    pending.wantedThings || [],
  );
  if (itinerary.length) await publishIntakeShare(db, pending.tripId);
  await storePostReplyCallTelemetry(db, pending.requestId, appLive);
  const savedFields = await savedThingFieldsForTurn(db, pending.tripId, itinerary?.savedThingIds || []);
  const deferredWork = itinerary?.deferredWork?.deferred ? itinerary.deferredWork : null;
  const postReplyTimings = itinerary?.postReplyTimings || null;
  if (pending.customerTurnId) {
    await db`
      update transcript_turns
      set payload = coalesce(payload, '{}'::jsonb) || ${{
        thingId: savedFields.thingId,
        sharedDayIds: savedFields.sharedDayIds,
        savedThings: savedFields.savedThings,
        ...(deferredWork ? { deferredWork } : {}),
        ...(postReplyTimings ? { postReplyTimings } : {}),
      }}
      where id = ${pending.customerTurnId}
    `;
  }
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
    thingId: savedFields.thingId,
    sharedDayIds: savedFields.sharedDayIds,
    savedThings: savedFields.savedThings,
    ...(deferredWork ? { deferredWork } : {}),
    ...(postReplyTimings ? { postReplyTimings } : {}),
    error: null,
  };
}
