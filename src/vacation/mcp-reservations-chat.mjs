import { cleanText, headerValue } from './http.mjs';
import { seatFromSession, transcriptCustomerId } from './collaborator-app-seat.mjs';
import { asObject } from './mcp-read.mjs';
import { handleAiImportChatTurn, isAiImportChatRequest } from './mcp-chat-import.mjs';
import {
  completeReservationHandshake,
  createReservationConnection,
  getActiveReservationConnectionForAccount,
  getLatestPendingReservationConnectionForAccount,
} from './mcp-reservations-store.mjs';
import {
  createReservationRequest,
  parseReservationRequestText,
} from './mcp-reservations-service.mjs';
import { nextStepMessageForMode } from './mcp-reservations-tools.mjs';
import {
  buildReservationsSetupCopyText,
  isReservationAsk,
  parseReservationsHandshakeText,
  YES_REPLY_RE,
} from './mcp-reservations-handshake.mjs';

function resolveMcpEndpointUrl(req = null, env = process.env) {
  const host = req ? cleanText(headerValue(req, 'x-forwarded-host') || headerValue(req, 'host'), 200) : '';
  if (host) {
    const proto = cleanText(headerValue(req, 'x-forwarded-proto'), 20) || (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? 'http' : 'https');
    return `${proto}://${host}/api/mcp`;
  }
  const base = String(env.TIMESYNCHER_SITE_BASE_URL || env.SITE_BASE_URL || 'https://www.timesyncher.com').replace(/\/+$/, '');
  return `${base}/api/mcp`;
}

async function resolvePersonEmail(db, { session, seat }) {
  const direct = cleanText(session?.email, 180).toLowerCase();
  if (direct && direct.includes('@')) return direct;
  if (!seat) return null;
  try {
    if (seat.inviteId) {
      const rows = await db`
        select metadata from vacation_collaborators
        where invite_id = ${seat.inviteId} and status = 'active'
        limit 1
      `;
      const email = cleanText(rows[0]?.metadata?.email, 180).toLowerCase();
      if (email && email.includes('@')) return email;
    }
  } catch (error) {
    void error;
  }
  return null;
}

async function loadLastAppTurnForPerson(db, { tripId, personCustomerId, personEmail }) {
  if (!tripId) return null;
  const rows = await db`
    select speaker, body, payload, direction
    from transcript_turns
    where trip_id = ${tripId}
    order by coalesce(sent_at, received_at, created_at) desc
    limit 20
  `;
  for (const row of rows) {
    if (row.speaker !== 'app' && row.direction !== 'outbound') continue;
    const payload = asObject(row.payload);
    const targetId = cleanText(payload.forCustomerId, 80);
    const targetEmail = cleanText(payload.forEmail, 180).toLowerCase();
    if (targetId && personCustomerId && targetId !== String(personCustomerId)) continue;
    if (targetEmail && personEmail && targetEmail !== personEmail) continue;
    return row;
  }
  return null;
}

async function recordInboundAndOutbound(db, {
  transcriptOwnerId,
  tripId,
  personCustomerId,
  personEmail,
  personName,
  requestText,
  reply,
  reservationCard = null,
  extraOutboundPayload = {},
  privateToPerson = false,
  started,
  now = () => new Date(),
}) {
  const at = now().toISOString();
  await db`
    insert into transcript_turns (
      customer_id, trip_id, speaker, channel, body, payload, direction, received_at
    )
    values (
      ${transcriptOwnerId}, ${tripId}, 'customer', 'vacation-app', ${requestText},
      ${{
        source: 'vacation_app',
        surface: 'vacation-app',
        selectedTripId: tripId,
        authorName: personName,
        authorId: personCustomerId,
        ...(privateToPerson && personCustomerId ? { forCustomerId: personCustomerId } : {}),
        liveTranscript: { role: 'customer', text: requestText, speakerName: personName, at },
      }},
      'inbound', now()
    )
  `;
  const latencyMs = Math.max(1, Date.now() - started);
  const storedCard = reservationCard ? { ...reservationCard } : null;
  if (storedCard && 'copyText' in storedCard) delete storedCard.copyText;
  await db`
    insert into transcript_turns (
      customer_id, trip_id, speaker, channel, body, payload, direction, sent_at, response_latency_ms
    )
    values (
      ${transcriptOwnerId}, ${tripId}, 'app', 'vacation-app', ${reply},
      ${{
        source: 'vacation_app',
        surface: 'vacation-app',
        selectedTripId: tripId,
        ...(privateToPerson && personCustomerId ? { forCustomerId: personCustomerId } : {}),
        ...(privateToPerson && personEmail ? { forEmail: personEmail } : {}),
        ...(storedCard ? { reservationCard: storedCard } : {}),
        ...extraOutboundPayload,
        liveTranscript: { role: 'app', text: reply, at: now().toISOString() },
      }},
      'outbound', now(), ${latencyMs}
    )
  `;
  return { ok: true, status: 'replied', reply, reservationCard, latencyMs, error: null };
}

export async function tryHandleReservationsChatTurn(db, {
  session,
  trip,
  requestText,
  httpReq = null,
  env = process.env,
  now = () => new Date(),
  fetchImpl = globalThis.fetch,
}) {
  const text = cleanText(requestText, 4000);
  if (!text) return null;
  const started = Date.now();
  const seat = seatFromSession(session);
  const transcriptOwnerId = transcriptCustomerId(session);
  const personCustomerId = cleanText(session?.customer_id, 80) || null;
  const personName = cleanText(
    seat?.displayName || [session?.first_name, session?.last_name].filter(Boolean).join(' ') || session?.display_name,
    120,
  ) || (seat ? 'Collaborator' : 'Owner');
  const personEmail = await resolvePersonEmail(db, { session, seat });
  const tripId = trip?.id ? String(trip.id) : null;
  const vacationTitle = cleanText(trip?.title || trip?.destination, 180) || 'this vacation';

  const pendingConn = await getLatestPendingReservationConnectionForAccount(db, {
    accountCustomerId: personCustomerId,
    accountEmail: personEmail,
  });
  const hasPendingHandshake = Boolean(pendingConn && pendingConn.status === 'pending_handshake');
  const parsedHandshake = parseReservationsHandshakeText(text, { hasPendingConnection: hasPendingHandshake });

  if (parsedHandshake.matched) {
    if (!parsedHandshake.valid) {
      return recordInboundAndOutbound(db, {
        transcriptOwnerId,
        tripId,
        personCustomerId,
        personEmail,
        personName,
        requestText: text,
        reply: parsedHandshake.errorMessage,
        reservationCard: { kind: 'ai_reservation_handshake_error', message: parsedHandshake.errorMessage },
        privateToPerson: true,
        started,
        now,
      });
    }
    if (!pendingConn) {
      const noConnReply = 'Ask to set up your AI for reservations first so I can create a reservations connection for your account.';
      return recordInboundAndOutbound(db, {
        transcriptOwnerId,
        tripId,
        personCustomerId,
        personEmail,
        personName,
        requestText: text,
        reply: noConnReply,
        privateToPerson: true,
        started,
        now,
      });
    }
    const updated = await completeReservationHandshake(db, {
      connectionId: pendingConn.id,
      mode: parsedHandshake.mode,
      webhookUrl: parsedHandshake.webhookUrl,
      pollIntervalMinutes: parsedHandshake.pollIntervalMinutes,
      clientName: parsedHandshake.clientName,
      lastVacationId: tripId,
    });
    const nextStep = nextStepMessageForMode(updated.mode, updated.pollIntervalMinutes);
    const reply = `You're set up for reservations. ${nextStep}`;
    return recordInboundAndOutbound(db, {
      transcriptOwnerId,
      tripId,
      personCustomerId,
      personEmail,
      personName,
      requestText: text,
      reply,
      reservationCard: {
        kind: 'ai_reservation_connected',
        connectionId: updated.id,
        mode: updated.mode,
        modeLabel: updated.modeLabel,
        pollIntervalMinutes: updated.pollIntervalMinutes,
        headline: "You're set up for reservations",
        nextStep,
      },
      privateToPerson: true,
      started,
      now,
    });
  }

  const lastAppTurn = await loadLastAppTurnForPerson(db, { tripId, personCustomerId, personEmail });
  const lastPayload = asObject(lastAppTurn?.payload);
  if (lastPayload.reservationOffer === true && YES_REPLY_RE.test(text)) {
    const created = await createReservationConnection(db, {
      accountCustomerId: personCustomerId || transcriptOwnerId,
      accountEmail: personEmail,
      label: `${personName} Reservations AI`,
      lastVacationId: tripId,
      pendingRequestText: lastPayload.pendingRequestText || '',
      now,
      env,
    });
    const mcpEndpoint = resolveMcpEndpointUrl(httpReq, env);
    const copyText = buildReservationsSetupCopyText({ mcpEndpoint, token: created.token });
    const card = {
      kind: 'ai_reservation_setup',
      connectionId: created.record.id,
      tokenPrefix: created.record.tokenPrefix,
      maskedToken: created.maskedToken,
      expiresAt: created.record.expiresAt,
      mcpEndpoint,
      options: [
        '(a) Webhook or inbox URL Vacay Keepsake can ping',
        '(b) Scheduled polling of the Vacay Keepsake MCP',
        '(c) Manual — paste "check my VK reservations" into your AI each time',
      ],
      copyText,
    };
    const reply = 'Here is your AI reservations setup card. Copy and paste it into your AI, then paste your AI\'s short handshake reply right back here (or your AI can finish setup directly through MCP).';
    return recordInboundAndOutbound(db, {
      transcriptOwnerId,
      tripId,
      personCustomerId,
      personEmail,
      personName,
      requestText: text,
      reply,
      reservationCard: card,
      privateToPerson: true,
      started,
      now,
    });
  }

  if (!isReservationAsk(text)) return null;

  const activeConn = await getActiveReservationConnectionForAccount(db, {
    accountCustomerId: personCustomerId,
    accountEmail: personEmail,
  });

  if (!activeConn) {
    const reply = "Vacay Keepsake doesn't book reservations directly, but your own AI can handle bookings for your vacation and send confirmations right back here. Would you like to set up your AI for reservations?";
    return recordInboundAndOutbound(db, {
      transcriptOwnerId,
      tripId,
      personCustomerId,
      personEmail,
      personName,
      requestText: text,
      reply,
      reservationCard: { kind: 'ai_reservation_offer', pendingRequestText: text },
      extraOutboundPayload: { reservationOffer: true, pendingRequestText: text },
      privateToPerson: true,
      started,
      now,
    });
  }

  if (!tripId) {
    const reply = 'Tell me which vacation this reservation is for first, and I will send the request to your AI.';
    return recordInboundAndOutbound(db, {
      transcriptOwnerId,
      tripId: null,
      personCustomerId,
      personEmail,
      personName,
      requestText: text,
      reply,
      privateToPerson: true,
      started,
      now,
    });
  }

  const parsed = parseReservationRequestText(text);
  const created = await createReservationRequest(db, {
    connection: activeConn,
    tripId,
    vacationTitle,
    requesterCustomerId: personCustomerId,
    requesterEmail: personEmail,
    requesterName: personName,
    venueName: parsed.venueName,
    category: parsed.category,
    requestedDate: parsed.requestedDate,
    requestedTime: parsed.requestedTime,
    partySize: parsed.partySize,
    requestText: text,
    fetchImpl,
  });

  const mode = String(activeConn.mode || 'manual');
  const pollMinutes = Math.max(1, Math.round(Number(activeConn.poll_interval_minutes) || 5));
  let reply = '';
  if (mode === 'webhook') {
    reply = `Reservation request for ${parsed.venueName} is waiting — I notified your AI and will post the confirmation here once it is booked.`;
  } else if (mode === 'polling') {
    reply = `Reservation request for ${parsed.venueName} is waiting — your AI will pick it up within about ${pollMinutes} ${pollMinutes === 1 ? 'minute' : 'minutes'} and post the confirmation here.`;
  } else {
    reply = `Reservation request for ${parsed.venueName} is waiting. Copy "check my VK reservations" and paste it into your AI when you are ready.`;
  }

  const statusCard = {
    kind: 'ai_reservation_status',
    status: 'waiting',
    mode,
    ...(mode === 'polling' ? { pollIntervalMinutes: pollMinutes } : {}),
    ...(mode === 'manual' ? { manualPrompt: 'check my VK reservations' } : {}),
    requestId: created.request.request_id,
    vacationId: tripId,
    venueName: parsed.venueName,
    requestedDate: parsed.requestedDate,
    requestedTime: parsed.requestedTime,
    partySize: parsed.partySize,
    webhookStatus: created.webhook.status,
  };

  return recordInboundAndOutbound(db, {
    transcriptOwnerId,
    tripId,
    personCustomerId,
    personEmail,
    personName,
    requestText: text,
    reply,
    reservationCard: statusCard,
    privateToPerson: false,
    started,
    now,
  });
}

export async function tryHandleAiMcpChatTurn(db, opts) {
  const reservationReply = await tryHandleReservationsChatTurn(db, opts);
  if (reservationReply) return reservationReply;
  if (isAiImportChatRequest(opts.requestText)) {
    return handleAiImportChatTurn(db, opts);
  }
  return null;
}
