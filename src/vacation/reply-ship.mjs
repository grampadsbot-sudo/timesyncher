import { transcriptCustomerId } from './collaborator-app-seat.mjs';
import { liveTurnRecord } from './live-app-turn.mjs';
import { appReplyTelemetry } from './reply-telemetry.mjs';

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

export function applyLiveAppReplyFailureToPayload(payload, customerLive, produced = {}) {
  const failure = liveAppReplyFailureOutcome(produced);
  payload.replyFailure = failure.replyFailure;
  customerLive.replyFailure = failure.replyFailure;
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

export async function commitShippedRewrite(db, session, pending, finished, { recordCustomerThingNotes, publishIntakeShare }) {
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
