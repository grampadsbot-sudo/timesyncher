import { requireIntakeAuth } from '../src/vacation/auth.mjs';
import { sql } from '../src/vacation/db.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';
import { getSessionByToken, vacationEulaStatus } from '../src/vacation/onboarding.mjs';
import { blockHighAuthorityRequest } from '../src/safety/high-authority-actions.mjs';

function displayName(user = {}) {
  return cleanText([user.firstName || user.first_name, user.lastName || user.last_name].filter(Boolean).join(' ') || user.username || `telegram:${user.id}`, 160);
}

async function findSessionForTelegram(db, telegramChatId, telegramUserId) {
  const rows = await db`
    select *
    from telegram_sessions
    where telegram_chat_id = ${telegramChatId}
       or (${telegramUserId} <> '' and telegram_user_id = ${telegramUserId})
    order by updated_at desc
    limit 1
  `;
  return rows[0] || null;
}

async function ensureTelegramSession(db, { onboarding, telegramChatId, telegramUserId, user, payload }) {
  const rows = await db`
    insert into telegram_sessions (
      customer_id, trip_id, onboarding_session_id, telegram_chat_id, telegram_user_id,
      current_step, last_message_at, metadata, updated_at
    )
    values (
      ${onboarding?.customer_id || null}, ${onboarding?.trip_id || null}, ${onboarding?.id || null},
      ${telegramChatId}, ${telegramUserId || null}, 'awaiting_vacation_identity', now(),
      ${{
        telegramUsername: user.username || null,
        displayName: displayName(user),
        ...payload,
      }}, now()
    )
    on conflict (telegram_chat_id) do update set
      customer_id = coalesce(excluded.customer_id, telegram_sessions.customer_id),
      trip_id = coalesce(excluded.trip_id, telegram_sessions.trip_id),
      onboarding_session_id = coalesce(excluded.onboarding_session_id, telegram_sessions.onboarding_session_id),
      telegram_user_id = coalesce(excluded.telegram_user_id, telegram_sessions.telegram_user_id),
      current_step = coalesce(excluded.current_step, telegram_sessions.current_step),
      last_message_at = now(),
      metadata = telegram_sessions.metadata || excluded.metadata,
      updated_at = now()
    returning *
  `;

  if (onboarding?.customer_id && telegramUserId) {
    await db`
      update customers
      set telegram_user_id = ${telegramUserId},
        display_name = coalesce(display_name, ${displayName(user)}),
        metadata = metadata || ${{
          telegramUsername: user.username || null,
          telegramLinkedAt: new Date().toISOString(),
        }},
        updated_at = now()
      where id = ${onboarding.customer_id}
    `;
    await db`
      update onboarding_sessions
      set status = 'telegram_started',
        current_step = 'telegram_started',
        started_at = coalesce(started_at, now()),
        updated_at = now()
      where id = ${onboarding.id}
    `;
  }

  return rows[0];
}

async function recordTranscript(db, { session, speaker, direction, body, channel = 'telegram_vacation_bot', telegramMessageId, payload, receivedAt, sentAt, responseLatencyMs, onboardingStep }) {
  const rows = await db`
    insert into transcript_turns (
      customer_id, trip_id, telegram_session_id, speaker, channel, body, payload, direction,
      telegram_message_id, received_at, sent_at, response_latency_ms, onboarding_step
    )
    values (
      ${session?.customer_id || null}, ${session?.trip_id || null}, ${session?.id || null},
      ${speaker}, ${channel}, ${body}, ${payload || {}}, ${direction},
      ${telegramMessageId || null}, ${receivedAt || null}, ${sentAt || null},
      ${responseLatencyMs || null}, ${onboardingStep || session?.current_step || null}
    )
    returning id
  `;
  return rows[0].id;
}

function requestKind(text) {
  const lower = cleanText(text, 1000).toLowerCase();
  if (/^(yes|yep|yeah|ok|okay|sure|go ahead|do it|continue|next pass|yes do next pass)[\s.!?]*$/i.test(lower)) {
    return {
      requestType: 'itinerary_research_update',
      jobType: 'itinerary_research_update',
      intent: 'continue_or_next_pass',
    };
  }
  if (/\b(next pass|research|update|refine|revise|change|add|remove|swap|rank|compare|web itinerary)\b/i.test(lower)) {
    return {
      requestType: 'itinerary_research_update',
      jobType: 'itinerary_research_update',
      intent: 'itinerary_update',
    };
  }
  return {
    requestType: 'onboarding_setup',
    jobType: 'onboarding_setup',
    intent: 'initial_or_additional_intake',
  };
}

function sessionMetadata(session) {
  return session?.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata) ? session.metadata : {};
}

function hasVacationIdentity(session) {
  const metadata = sessionMetadata(session);
  return Boolean(cleanText(metadata.vacationName, 160) && cleanText(metadata.unforgettableGoal, 1000));
}

function parseVacationIdentity(text) {
  const cleaned = cleanText(text, 2000);
  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const nameMatch = cleaned.match(/(?:call|name|title)\s+(?:it|the vacation|this vacation)?\s*[:\-]?\s*["“]?([^"\n”]+)["”]?/i);
  const goalMatch = cleaned.match(/(?:unforgettable|special|goal|going for|want)\s*[:\-]?\s*([^"\n]+(?:\n[^"\n]+)?)/i);
  let vacationName = cleanText(nameMatch?.[1] || '', 160);
  let unforgettableGoal = cleanText(goalMatch?.[1] || '', 1000);

  if (!vacationName && lines.length >= 2) {
    vacationName = cleanText(lines[0].replace(/^name\s*[:\-]\s*/i, ''), 160);
    unforgettableGoal = cleanText(lines.slice(1).join(' ').replace(/^(goal|unforgettable)\s*[:\-]\s*/i, ''), 1000);
  }
  if (!vacationName && /^.{3,80}$/.test(cleaned) && !/\b(fly|hotel|restaurant|budget|date|july|august|maui|oahu|kona|waikiki|honolulu)\b/i.test(cleaned)) {
    vacationName = cleaned;
  }
  if (!unforgettableGoal && vacationName && cleaned.length > vacationName.length + 5) {
    unforgettableGoal = cleanText(cleaned.replace(vacationName, ''), 1000);
  }
  return { vacationName, unforgettableGoal };
}

function identityPrompt() {
  return [
    'First, what would you like to call this vacation?',
    '',
    'Also tell me what you are going for — what would make it unforgettable?',
    '',
    'Example: “Hawaii 2026 — classic Waikiki beach energy, great local food, surf lesson, and a few special sunset experiences.”',
  ].join('\n');
}

function voiceNoteIntro() {
  return [
    'Your TimeSyncher Vacation purchase is linked.',
    '',
    'Welcome. We are so excited to help you create your next unforgettable vacation.',
    '',
    'Before we start, I want to make sure you know you can send voice notes here. You can type in the message box below, or press and hold the microphone button while you talk. Keep holding it for as long as you want, and anything you say will be included as we set up your unforgettable vacation.',
    '',
    'One quick thing to try: tap the microphone icon and see how it changes to the video icon, then tap it again so it changes back to the microphone. If it ever switches to video by accident, that is why the voice-note button seems to disappear.',
    '',
    'Try that now and send me a quick reply when you have it back on the microphone.',
  ].join('\n');
}

function eulaRequiredReply(eula) {
  return [
    'Your TimeSyncher Vacation purchase is linked.',
    '',
    'Before we start Telegram onboarding, please review and accept TimeSyncher Terms & Privacy:',
    eula.acceptUrl,
    '',
    'After you accept it, come back here and send /start with your purchase link again. Then I will unlock the voice-note onboarding flow.',
  ].join('\n');
}

async function markVoiceNotePracticePrompted(db, session) {
  const rows = await db`
    update telegram_sessions
    set current_step = 'awaiting_voice_note_practice',
      metadata = metadata || ${{
        voiceNotePracticePromptedAt: new Date().toISOString(),
      }},
      updated_at = now()
    where id = ${session.id}
    returning *
  `;
  return rows[0];
}

async function markEulaAcceptanceRequired(db, session, eula) {
  const rows = await db`
    update telegram_sessions
    set current_step = 'pending_eula_acceptance',
      metadata = metadata || ${{
        eulaRequiredAt: new Date().toISOString(),
        eulaAcceptUrl: eula.acceptUrl,
        eulaSessionId: eula.sessionId,
      }},
      updated_at = now()
    where id = ${session.id}
    returning *
  `;
  return rows[0];
}

async function markVoiceNotePracticeComplete(db, session) {
  const rows = await db`
    update telegram_sessions
    set current_step = 'awaiting_vacation_identity',
      metadata = metadata || ${{
        voiceNotePracticeCompletedAt: new Date().toISOString(),
      }},
      updated_at = now()
    where id = ${session.id}
    returning *
  `;
  return rows[0];
}

async function saveVacationIdentity(db, session, text) {
  const parsed = parseVacationIdentity(text);
  const existing = sessionMetadata(session);
  const vacationName = cleanText(parsed.vacationName || existing.vacationName, 160);
  const unforgettableGoal = cleanText(parsed.unforgettableGoal || existing.unforgettableGoal, 1000);
  if (!vacationName || !unforgettableGoal) {
    return { complete: false, vacationName, unforgettableGoal };
  }
  const rows = await db`
    update telegram_sessions
    set current_step = 'awaiting_trip_details',
      metadata = metadata || ${{
        vacationName,
        unforgettableGoal,
        vacationIdentityCapturedAt: new Date().toISOString(),
      }},
      updated_at = now()
    where id = ${session.id}
    returning *
  `;
  return { complete: true, session: rows[0], vacationName, unforgettableGoal };
}

async function queueSetupRequest(db, session, text, payload, kind) {
  if (!session?.customer_id || !session?.trip_id || !text) return null;
  const request = kind || requestKind(text);
  const metadata = sessionMetadata(session);
  const requestRows = await db`
    insert into vacation_requests (
      customer_id, trip_id, source, request_type, request_text, normalized_intent, payload,
      status, queued_at
    )
    values (
      ${session.customer_id}, ${session.trip_id}, 'telegram_vacation_bot', ${request.requestType},
      ${text}, ${{
        onboardingStep: session.current_step,
        source: 'telegram',
        intent: request.intent,
        vacationName: cleanText(metadata.vacationName, 160) || null,
        unforgettableGoal: cleanText(metadata.unforgettableGoal, 1000) || null,
      }}, ${payload}, 'queued', now()
    )
    returning id
  `;
  const requestId = requestRows[0].id;
  await db`
    insert into vacation_request_events (request_id, event_type, actor, details)
    values (${requestId}, 'telegram_setup_received', 'customer', ${payload})
  `;
  const jobRows = await db`
    insert into worker_jobs (request_id, trip_id, job_type, input)
    values (${requestId}, ${session.trip_id}, ${request.jobType}, ${{
      customerId: session.customer_id,
      tripId: session.trip_id,
      requestId,
      source: 'telegram_vacation_bot',
      requestType: request.requestType,
      requestText: text,
      payload: {
        ...payload,
        vacationName: cleanText(metadata.vacationName, 160) || null,
        unforgettableGoal: cleanText(metadata.unforgettableGoal, 1000) || null,
      },
    }})
    returning id
  `;
  return { requestId, jobId: jobRows[0].id };
}

function setupReply({ startLinked, hasSession, text, kind }) {
  if (startLinked) {
    return voiceNoteIntro();
  }
  if (!hasSession) {
    return [
      'Welcome to TimeSyncher Vacation.',
      '',
      'I can start a planning note, but I do not see a linked paid onboarding session yet. Use the bot link from your purchase email if you have one.',
    ].join('\n');
  }
  if (/^\/help\b/i.test(text)) {
    return 'First send the vacation name and what would make it unforgettable. After that, send destination, rough dates, people traveling, budget range, must-dos, and anything you want avoided.';
  }
  if (kind?.requestType === 'itinerary_research_update') {
    return [
      'Got it. I am updating the hosted TimeSyncher Vacation itinerary now.',
      '',
      'I will send the itinerary link when the next pass is ready. You can keep sending changes or priorities here while I work.',
    ].join('\n');
  }
  return [
    'I am turning the information you sent into a hosted TimeSyncher Vacation itinerary.',
    '',
    'I will send the itinerary link when the first pass is ready. You can keep sending any updates, must-do experiences, reservations, or preferences here while I work.',
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });

  try {
    requireIntakeAuth(req, process.env);
    const body = await readJson(req);
    const db = sql(process.env);
    const event = cleanText(body.event || 'message', 80);

    if (event === 'delivery') {
      const transcriptId = cleanText(body.transcriptId || body.transcript_id, 80);
      if (!transcriptId) return sendJson(res, 400, { ok: false, error: 'transcriptId is required.' });
      await db`
        update transcript_turns
        set sent_at = coalesce(sent_at, ${body.sentAt || new Date().toISOString()}),
          telegram_message_id = coalesce(telegram_message_id, ${cleanText(body.telegramMessageId || body.telegram_message_id, 120) || null})
        where id = ${transcriptId}
      `;
      return sendJson(res, 200, { ok: true });
    }

    const message = body.message || {};
    const user = body.user || {};
    const telegramChatId = cleanText(body.telegramChatId || message.chatId || message.chat_id, 120);
    const telegramUserId = cleanText(body.telegramUserId || user.id, 120);
    if (event === 'bot_error') {
      const session = telegramChatId
        ? await findSessionForTelegram(db, telegramChatId, telegramUserId ? `telegram:${telegramUserId}` : '')
        : null;
      const stage = cleanText(body.stage || 'telegram_bot', 120);
      const errorMessage = cleanText(body.error || body.errorMessage || 'Unknown bot error', 1000);
      const transcriptId = await recordTranscript(db, {
        session,
        speaker: 'system',
        direction: 'system',
        body: `Bot error (${stage}): ${errorMessage}`,
        channel: 'telegram_vacation_bot_error',
        telegramMessageId: cleanText(body.telegramMessageId || message.messageId || message.message_id, 120),
        payload: {
          stage,
          error: errorMessage,
          updateId: cleanText(body.updateId || body.update_id, 120) || null,
          retryPolicy: body.retryPolicy || null,
          telegramChatId: telegramChatId || null,
          telegramUserId: telegramUserId || null,
          details: body.details || {},
        },
        receivedAt: body.failedAt || new Date().toISOString(),
        onboardingStep: session?.current_step || 'bot_error',
      });
      return sendJson(res, 200, { ok: true, transcriptId, telegramSessionId: session?.id || null });
    }

    const text = cleanText(body.text || message.text, 12000);
    const receivedAt = body.receivedAt || new Date().toISOString();
    const startMatch = /^\/start(?:\s+(.+))?/i.exec(text);
    const startToken = cleanText(body.onboardingToken || (startMatch ? startMatch[1] : ''), 160);
    if (!telegramChatId) return sendJson(res, 400, { ok: false, error: 'telegramChatId is required.' });

    const onboarding = startToken ? await getSessionByToken(db, startToken) : null;
    if (startToken && onboarding) {
      const eula = await vacationEulaStatus(onboarding, process.env);
      if (!eula.ok) {
        let pendingSession = await ensureTelegramSession(db, {
          onboarding: null,
          telegramChatId,
          telegramUserId: telegramUserId ? `telegram:${telegramUserId}` : '',
          user,
          payload: {
            ...(body.payload || {}),
            onboardingSessionId: onboarding.id,
            eulaSessionId: eula.sessionId,
          },
        });
        pendingSession = await markEulaAcceptanceRequired(db, pendingSession, eula);
        const inboundTranscriptId = await recordTranscript(db, {
          session: pendingSession,
          speaker: 'customer',
          direction: 'inbound',
          body: text,
          telegramMessageId: cleanText(body.telegramMessageId || message.messageId || message.message_id, 120),
          payload: body.payload || {},
          receivedAt,
          onboardingStep: pendingSession.current_step,
        });
        const reply = eulaRequiredReply(eula);
        const respondedAt = new Date();
        const latency = Math.max(0, respondedAt.getTime() - new Date(receivedAt).getTime());
        const outboundTranscriptId = await recordTranscript(db, {
          session: pendingSession,
          speaker: 'assistant',
          direction: 'outbound',
          body: reply,
          payload: { eulaRequired: true, eulaAcceptUrl: eula.acceptUrl, eulaSessionId: eula.sessionId },
          receivedAt,
          sentAt: respondedAt.toISOString(),
          responseLatencyMs: Number.isFinite(latency) ? latency : null,
          onboardingStep: pendingSession.current_step,
        });
        return sendJson(res, 200, {
          ok: true,
          reply,
          eulaRequired: true,
          eulaAcceptUrl: eula.acceptUrl,
          telegramSessionId: pendingSession.id,
          inboundTranscriptId,
          outboundTranscriptId,
          queued: null,
          responseLatencyMs: Number.isFinite(latency) ? latency : null,
        });
      }
    }
    const existingSession = onboarding ? null : await findSessionForTelegram(db, telegramChatId, telegramUserId ? `telegram:${telegramUserId}` : '');
    let session;
    if (existingSession && !onboarding) {
      const rows = await db`
        update telegram_sessions
        set last_message_at = now(),
          metadata = metadata || ${{
            telegramUsername: user.username || null,
            displayName: displayName(user),
            ...(body.payload || {}),
          }},
          updated_at = now()
        where id = ${existingSession.id}
        returning *
      `;
      session = rows[0];
    } else {
      session = await ensureTelegramSession(db, {
        onboarding,
        telegramChatId,
        telegramUserId: telegramUserId ? `telegram:${telegramUserId}` : '',
        user,
        payload: body.payload || {},
      });
    }

    const inboundTranscriptId = await recordTranscript(db, {
      session,
      speaker: 'customer',
      direction: 'inbound',
      body: text,
      telegramMessageId: cleanText(body.telegramMessageId || message.messageId || message.message_id, 120),
      payload: body.payload || {},
      receivedAt,
      onboardingStep: session.current_step,
    });

    const blockedAction = blockHighAuthorityRequest(text, process.env);
    if (blockedAction.blocked) {
      const respondedAt = new Date();
      const latency = Math.max(0, respondedAt.getTime() - new Date(receivedAt).getTime());
      const reply = blockedAction.message;
      const outboundTranscriptId = await recordTranscript(db, {
        session,
        speaker: 'assistant',
        direction: 'outbound',
        body: reply,
        channel: 'system_guard',
        payload: {
          blocked: true,
          code: 'HIGH_AUTHORITY_ACTION_BLOCKED',
          kinds: blockedAction.kinds,
        },
        receivedAt,
        sentAt: respondedAt.toISOString(),
        responseLatencyMs: Number.isFinite(latency) ? latency : null,
        onboardingStep: session.current_step,
      });
      return sendJson(res, 200, {
        ok: true,
        reply,
        telegramSessionId: session.id,
        inboundTranscriptId,
        outboundTranscriptId,
        queued: null,
        blocked: true,
        blockedKinds: blockedAction.kinds,
        responseLatencyMs: Number.isFinite(latency) ? latency : null,
      });
    }

    let kind = requestKind(text);
    let queued = null;
    let reply;
    let replyPayload = {};

    if (startMatch) {
      if (onboarding) session = await markVoiceNotePracticePrompted(db, session);
      reply = setupReply({ startLinked: Boolean(onboarding), hasSession: Boolean(session?.customer_id), text, kind });
    } else if (session?.customer_id && session.current_step === 'awaiting_voice_note_practice') {
      session = await markVoiceNotePracticeComplete(db, session);
      reply = identityPrompt();
    } else if (session?.customer_id && !hasVacationIdentity(session)) {
      const saved = await saveVacationIdentity(db, session, text);
      if (saved.complete) {
        session = saved.session;
        replyPayload = { vacationName: saved.vacationName, unforgettableGoal: saved.unforgettableGoal };
        reply = [
          `Perfect. I will call it “${saved.vacationName}.”`,
          '',
          'Now send me the destination, rough dates, who is traveling, budget range, must-do experiences, and anything you want avoided. Voice notes are fine.',
        ].join('\n');
      } else {
        replyPayload = { vacationName: saved.vacationName || null, unforgettableGoal: saved.unforgettableGoal || null };
        reply = [
          identityPrompt(),
          '',
          saved.vacationName ? `I caught the name as “${saved.vacationName}”; I still need what would make it unforgettable.` : 'Please include both the vacation name and what would make it unforgettable.',
        ].join('\n');
      }
    } else {
      queued = await queueSetupRequest(db, session, text, {
        ...(body.payload || {}),
        vacationName: cleanText(sessionMetadata(session).vacationName, 160) || null,
        unforgettableGoal: cleanText(sessionMetadata(session).unforgettableGoal, 1000) || null,
        inboundTranscriptId,
        telegramChatId,
        telegramUserId,
      }, kind);
      reply = setupReply({ startLinked: Boolean(onboarding), hasSession: Boolean(session?.customer_id), text, kind });
    }
    const respondedAt = new Date();
    const latency = Math.max(0, respondedAt.getTime() - new Date(receivedAt).getTime());
    const outboundTranscriptId = await recordTranscript(db, {
      session,
      speaker: 'assistant',
      direction: 'outbound',
      body: reply,
      payload: { queued, ...replyPayload },
      receivedAt,
      sentAt: respondedAt.toISOString(),
      responseLatencyMs: Number.isFinite(latency) ? latency : null,
      onboardingStep: session.current_step,
    });

    return sendJson(res, 200, {
      ok: true,
      reply,
      telegramSessionId: session.id,
      inboundTranscriptId,
      outboundTranscriptId,
      queued,
      responseLatencyMs: Number.isFinite(latency) ? latency : null,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to record Telegram turn.' });
  }
}
