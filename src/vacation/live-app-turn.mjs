import {
  DIALOG_TEST_FINGERPRINT,
  callTieredModel,
  jevPrecall,
  loadVacationAppReplyRules,
} from '../../scripts/vacation-app-reply-rules.mjs';

export const LIVE_TRANSCRIPT_CAPTURE = 'live-vacation-app';
export const LIVE_REPLY_PRODUCER = 'vacation-app-reply-rules';
export const LIVE_DISPATCHER = 'product-gbrain-dispatch';

const CANNED_APP_REPLY = 'Got it. I saved that';

export function customerModality(body) {
  return body?.voiceMode ? 'voice' : 'text';
}

export function targetPersonFromSession(session) {
  const first = String(session?.first_name || session?.firstName || '').trim();
  if (first) return first.split(/\s+/)[0];
  const display = String(session?.display_name || session?.displayName || session?.customerName || '').trim();
  if (display) return display.split(/\s+/)[0];
  return '';
}

export function jevStamp(jev) {
  if (jev?.jevRan === true) {
    return {
      jevRan: true,
      modelTier: jev.modelTier ?? null,
      routeType: jev.routeType || jev.extraContext?.routeType || null,
      extraContext: jev.extraContext ?? null,
      via: jev.via || null,
      responseModel: jev.responseModel || null,
    };
  }
  return {
    jevRan: false,
    reason: String(jev?.error || jev?.reason || 'jev_skipped'),
    via: jev?.via || null,
    modelTier: null,
    routeType: null,
    extraContext: null,
  };
}

export function liveTurnRecord({
  turnIndex,
  role,
  modality,
  text,
  at,
  latencyMs,
  sessionE2eMs,
  jev,
  replyProducer = null,
  model = null,
  rules = null,
}) {
  const record = {
    turnIndex,
    role,
    modality,
    text: String(text || ''),
    at,
    latencyMs,
    sessionE2eMs,
    jev: jevStamp(jev),
  };
  if (role === 'app') {
    record.replyProducer = replyProducer || LIVE_REPLY_PRODUCER;
    record.dispatcher = LIVE_DISPATCHER;
    record.invented = false;
    record.model = model
      ? {
        called: Boolean(model.called),
        via: model.via || null,
        responseModel: model.responseModel || null,
        modelTier: model.modelTier ?? null,
      }
      : null;
  }
  if (rules) {
    record.rules = {
      ok: Boolean(rules.ok),
      via: rules.via || null,
      slug: rules.slug || null,
      contentHash: rules.content_hash || null,
    };
  }
  return record;
}

function appTextBanned(text) {
  const value = String(text || '');
  if (!value.trim()) return 'app reply text is empty';
  if (value.includes(DIALOG_TEST_FINGERPRINT)) return 'app reply carries the dialog test fingerprint';
  if (value.includes(CANNED_APP_REPLY)) return 'app reply is the canned vacation-app bubble';
  if (/dialog_vacation_test_turn/i.test(value)) return 'app reply came from dialog_vacation_test_turn';
  if (/dialog-pdf-openrouter-selfcall|openrouter-selfcall/i.test(value)) return 'app reply came from an OpenRouter self-call pack';
  return '';
}

export async function produceLiveAppReply({ customerTurn, session, env = process.env } = {}) {
  const rules = await loadVacationAppReplyRules(env);
  const jev = await jevPrecall({
    customerTurn,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    session: { seed_id: session?.token || null },
    env,
  });
  if (!rules?.ok) {
    return {
      reply: null,
      rules,
      jev,
      model: null,
      reason: rules?.error || 'reply_rules_unloaded',
    };
  }
  if (!jev?.jevRan) {
    return {
      reply: null,
      rules,
      jev,
      model: null,
      reason: jev?.error || 'jev_skipped',
    };
  }
  const model = await callTieredModel({
    rules,
    jev,
    customerTurn,
    stage: 'vacation_conversation',
    screen: 'vacation-app',
    env,
  });
  const reply = model?.called && model.text ? String(model.text) : '';
  const banned = appTextBanned(reply);
  if (!reply || banned) {
    return {
      reply: null,
      rules,
      jev,
      model,
      reason: banned || model?.reason || 'live dispatcher returned no reply',
    };
  }
  return { reply, rules, jev, model, reason: null };
}

function payloadObject(payload) {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  }
  return typeof payload === 'object' ? payload : {};
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

export function liveTranscriptFromRows({ session, rows }) {
  const targetPerson = targetPersonFromSession(session);
  const turns = (rows || []).map((row) => {
    const payload = payloadObject(row.payload);
    const live = payload.liveTranscript && typeof payload.liveTranscript === 'object' ? payload.liveTranscript : {};
    const text = String(row.body || '');
    return {
      turnIndex: Number(live.turnIndex),
      role: live.role,
      modality: live.modality,
      text,
      storedText: live.text == null ? text : String(live.text),
      at: iso(live.at || row.received_at || row.sent_at || row.created_at),
      latencyMs: Number(live.latencyMs ?? row.response_latency_ms),
      sessionE2eMs: Number(live.sessionE2eMs),
      jev: live.jev && typeof live.jev === 'object' ? live.jev : null,
      replyProducer: live.replyProducer || null,
      dispatcher: live.dispatcher || null,
      invented: live.invented === true,
      model: live.model || null,
      rules: live.rules || null,
    };
  });
  const last = turns[turns.length - 1] || null;
  return {
    live: true,
    capture: LIVE_TRANSCRIPT_CAPTURE,
    sessionToken: session?.token || null,
    targetPerson,
    customerName: session?.display_name || session?.displayName || targetPerson || null,
    tripId: session?.trip_id || session?.tripId || null,
    startedAt: turns[0]?.at || null,
    endedAt: last?.at || null,
    sessionE2eMs: last && Number.isFinite(last.sessionE2eMs) ? last.sessionE2eMs : null,
    turns,
  };
}

export async function loadLiveTranscriptByToken(db, token) {
  const sessions = await db`
    select
      onboarding_sessions.token,
      onboarding_sessions.customer_id,
      onboarding_sessions.trip_id,
      customers.display_name,
      customers.first_name,
      customers.last_name
    from onboarding_sessions
    left join customers on customers.id = onboarding_sessions.customer_id
    where onboarding_sessions.token = ${token}
    limit 1
  `;
  const session = sessions[0];
  if (!session?.customer_id || !session.trip_id) {
    const error = new Error('live transcript session not found');
    error.code = 'LIVE_TRANSCRIPT_MISSING';
    throw error;
  }
  const rows = await db`
    select speaker, body, payload, direction, received_at, sent_at, created_at, response_latency_ms
    from transcript_turns
    where customer_id = ${session.customer_id}
      and trip_id = ${session.trip_id}
      and channel = 'vacation-app'
      and payload->'liveTranscript' is not null
    order by coalesce(received_at, sent_at, created_at) asc
  `;
  return liveTranscriptFromRows({ session, rows });
}

export function transcriptToJsonl(doc) {
  const header = {
    type: 'session',
    live: doc.live === true,
    capture: doc.capture || null,
    sessionToken: doc.sessionToken || null,
    targetPerson: doc.targetPerson || null,
    customerName: doc.customerName || null,
    tripId: doc.tripId || null,
    startedAt: doc.startedAt || null,
    endedAt: doc.endedAt || null,
    sessionE2eMs: doc.sessionE2eMs ?? null,
  };
  const lines = [header, ...(doc.turns || []).map((turn) => ({ type: 'turn', ...turn }))];
  return `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`;
}
