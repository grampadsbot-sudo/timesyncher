import { requireIntakeAuth } from '../src/vacation/auth.mjs';
import { sql } from '../src/vacation/db.mjs';
import { queueOrSendWebEditorInviteEmail } from '../src/vacation/email.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';
import { classifyTurn } from '../src/vacation/turn-tags.mjs';
import {
  acceptWebAccessInvite,
  createOwnerWebsiteSessionByShareToken,
  createWebEditorInvite,
  isAllowedVacationWebsiteUrl,
  loadWebAccessGrantBySessionToken,
  publicTripUrl,
  readCookie,
  requireWebEditAccess,
  webAccessCookieHeader,
  webAccessCookieName,
  webAccessForSession,
} from '../src/vacation/web-access.mjs';
import bindThingMediaHandler from '../src/vacation/bind-thing-media-handler.mjs';
import sharedTripHandler from '../src/vacation/shared-trip-handler.mjs';
import keepsakeStyle2Handler from '../src/vacation/keepsake-style2-handler.mjs';
import handlePdfQrSvg from '../src/vacation/pdf-qr-svg-handler.mjs';
import trekStyle2BundleHandler from '../src/vacation/trek-style2-bundle.mjs';
import { vacationEulaStatus } from '../src/vacation/onboarding.mjs';
import { loadSessionPersistent } from '../src/onboarding/eula-persistent-core.mjs';
import { createPersistentStoreFromEnv } from '../src/onboarding/eula-persistent-store.mjs';
import {
  customerModality,
  FIXED_OPENER_REASON,
  jevStamp,
  LIVE_OPENER_PRODUCER,
  liveTurnRecord,
  onboardingOpenerText,
  produceLiveAppReply,
} from '../src/vacation/live-app-turn.mjs';

function sendHtml(res, status, html, headers = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
  res.end(html);
}

function acceptedHtml({ grant }) {
  const trip = cleanText(grant.trip_title || 'this vacation', 180);
  const url = cleanText(grant.public_url || '', 500);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Website editing enabled</title>
<style>body{margin:0;min-height:100vh;background:#070706;color:#fffaf0;font-family:Inter,system-ui,sans-serif;display:grid;place-items:center;padding:24px}main{max-width:640px;border:1px solid rgba(245,211,123,.28);border-radius:8px;padding:28px;background:#12110f}h1{font-family:Georgia,serif;color:#f5d37b;margin:0 0 12px}p{color:#cfc2a9;line-height:1.5}a{color:#f5d37b}</style></head>
<body><main><h1>Website editing enabled</h1><p>You can now edit ${trip} on the website when this browser is used.</p>${url ? `<p><a href="${url}">Open ${trip}</a></p>` : ''}</main></body></html>`;
}

async function handleWebAccess(req, res, db, url) {
  const action = cleanText(url.searchParams.get('action'), 80);
  if (req.method === 'GET' && action === 'accept') {
    const token = cleanText(url.searchParams.get('token'), 220);
    const accepted = await acceptWebAccessInvite(db, token, process.env);
    return sendHtml(res, 200, acceptedHtml(accepted), {
      'set-cookie': webAccessCookieHeader(accepted.sessionToken, process.env),
    });
  }

  if (req.method === 'GET' && action === 'telegram_launch') {
    const token = cleanText(url.searchParams.get('token'), 220);
    const requestedRedirect = cleanText(url.searchParams.get('redirect'), 600);
    const grant = await loadWebAccessGrantBySessionToken(db, token, process.env);
    if (!grant) return sendHtml(res, 404, '<!doctype html><title>Link expired</title><p>This Telegram website-edit link is invalid or expired. Ask the bot for a fresh vacation website link.</p>');
    const fallbackUrl = cleanText(grant.public_url, 600) || 'https://travel.timesyncher.com';
    const redirectUrl = requestedRedirect && isAllowedVacationWebsiteUrl(requestedRedirect, process.env)
      ? requestedRedirect
      : fallbackUrl;
    res.statusCode = 302;
    res.setHeader('cache-control', 'no-store');
    res.setHeader('set-cookie', webAccessCookieHeader(token, process.env));
    res.setHeader('location', redirectUrl);
    res.end('');
    return;
  }

  if (req.method === 'GET' && action === 'status') {
    const tripId = cleanText(url.searchParams.get('tripId'), 80);
    const shareToken = cleanText(url.searchParams.get('shareToken') || url.searchParams.get('publicSlug'), 240);
    const sessionToken = readCookie(req, webAccessCookieName()) || req.headers['x-timesyncher-web-access-token'] || '';
    const grant = await webAccessForSession(db, { sessionToken, tripId, shareToken, env: process.env });
    return sendJson(res, 200, {
      ok: true,
      canEdit: Boolean(grant),
      role: grant ? grant.role : 'viewer',
      email: grant?.email || null,
      tripId: tripId || grant?.trip_id || null,
      shareToken: shareToken || null,
    });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    if (body.action === 'create_web_editor_invite') {
      requireIntakeAuth(req, process.env);
      const invite = await createWebEditorInvite(db, {
        ownerCustomerId: cleanText(body.ownerCustomerId || body.customerId, 80),
        tripId: cleanText(body.tripId, 80),
        email: cleanText(body.email, 180),
        displayName: cleanText(body.displayName || body.name, 180),
        metadata: {
          source: 'vacation_web_access_api',
          requestedBy: cleanText(body.requestedBy, 120) || null,
        },
        env: process.env,
      });
      const email = await queueOrSendWebEditorInviteEmail(db, invite, process.env);
      return sendJson(res, 200, {
        ok: true,
        grantId: invite.grant.id,
        status: invite.grant.status,
        acceptUrl: invite.acceptUrl,
        email,
      });
    }

    if (body.action === 'create_owner_website_session') {
      requireIntakeAuth(req, process.env);
      const session = await createOwnerWebsiteSessionByShareToken(db, {
        shareToken: cleanText(body.shareToken || body.publicSlug || body.token, 240),
        email: cleanText(body.email, 180),
        displayName: cleanText(body.displayName || body.name, 180),
        env: process.env,
      });
      return sendJson(res, 200, {
        ok: true,
        grantId: session.grant.id,
        status: session.grant.status,
        role: session.grant.role,
        publicUrl: session.grant.public_url,
        launchUrl: session.launchUrl || session.acceptUrl,
      });
    }

    if (body.action === 'assert_can_edit') {
      const result = await requireWebEditAccess(db, req, {
        tripId: cleanText(body.tripId, 80),
        ownerCustomerId: cleanText(body.ownerCustomerId, 80),
        env: process.env,
      });
      return sendJson(res, 200, { ok: true, canEdit: true, role: result.role });
    }
  }

  return sendJson(res, 404, { ok: false, error: 'unknown website access action' });
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const value = item[key] || 'other';
    groups[value] = groups[value] || [];
    groups[value].push(item);
    return groups;
  }, {});
}

function builtVacationSiteUrl(metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const explicit = String(meta.publicUrl || meta.public_url || meta.webItineraryUrl || '').trim();
  const slug = String(meta.sharedToken || meta.shareToken || meta.publicSlug || meta.source_token || meta.slug || '').trim();
  if (!explicit && !slug) return '';
  const url = publicTripUrl({ metadata: meta }, process.env);
  try {
    const parsed = new URL(url);
    if (!parsed.pathname || parsed.pathname === '/') return '';
  } catch {
    return '';
  }
  return url;
}

function vacationAppTripSummary(row) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const url = builtVacationSiteUrl(metadata);
  return {
    id: row.id,
    title: row.title || '',
    destination: row.destination || '',
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    status: row.status || 'planning',
    current: Boolean(row.current),
    publicUrl: url,
    shareToken: metadata.sharedToken || metadata.shareToken || metadata.publicSlug || metadata.source_token || metadata.slug || null,
  };
}

async function loadVacationAppSession(db, token) {
  const rows = await db`
    select
      onboarding_sessions.id,
      onboarding_sessions.token,
      onboarding_sessions.customer_id,
      onboarding_sessions.trip_id,
      onboarding_sessions.status,
      customers.display_name,
      customers.first_name,
      customers.last_name,
      customers.email
    from onboarding_sessions
    left join customers on customers.id = onboarding_sessions.customer_id
    where onboarding_sessions.token = ${token}
    limit 1
  `;
  return rows[0] || null;
}

async function loadVacationAppTrips(db, session) {
  const rows = await db`
    select
      trips.id,
      trips.title,
      trips.destination,
      trips.start_date,
      trips.end_date,
      trips.status,
      trips.metadata,
      (trips.id = ${session.trip_id}) as current
    from trips
    where trips.customer_id = ${session.customer_id}
    order by
      (trips.id = ${session.trip_id}) desc,
      trips.updated_at desc nulls last,
      trips.created_at desc nulls last
  `;
  return rows.map(vacationAppTripSummary);
}

async function loadVacationAppTurns(db, session, tripId) {
  if (!session?.customer_id || !tripId) return [];
  const rows = await db`
    select speaker, body, channel, payload, direction, received_at, sent_at, created_at
    from transcript_turns
    where customer_id = ${session.customer_id}
      and trip_id = ${tripId}
      and channel in ('vacation-app', 'vacation_app', 'telegram_vacation_bot', 'telegram_vacation_media')
    order by coalesce(received_at, sent_at, created_at) desc nulls last
    limit 120
  `;
  return rows.reverse().map((row) => ({
    speaker: row.speaker || 'customer',
    body: row.body || '',
    channel: row.channel || '',
    direction: row.direction || '',
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
    at: row.received_at || row.sent_at || row.created_at || null,
  }));
}

async function ensureOnboardingOpener(db, session, trip) {
  const text = onboardingOpenerText(Boolean(trip?.publicUrl));
  const live = liveTurnRecord({
    turnIndex: 1,
    role: 'app',
    modality: 'text',
    text,
    at: new Date().toISOString(),
    latencyMs: 0,
    sessionE2eMs: 0,
    jev: { jevRan: false, error: FIXED_OPENER_REASON },
    replyProducer: LIVE_OPENER_PRODUCER,
  });
  const payload = {
    source: 'vacation_app',
    surface: 'vacation-app',
    selectedTripId: trip.id,
    liveTranscript: live,
  };
  await db`
    insert into transcript_turns (
      customer_id, trip_id, speaker, channel, body, payload, direction,
      sent_at, response_latency_ms
    )
    select
      ${session.customer_id}, ${trip.id}, 'app', 'vacation-app', ${text}, ${payload}, 'outbound',
      now(), 0
    where not exists (
      select 1
      from transcript_turns
      where customer_id = ${session.customer_id}
        and trip_id = ${trip.id}
        and channel = 'vacation-app'
        and payload->'liveTranscript' is not null
    )
  `;
}

async function queueVacationAppTurn(db, session, trip, body) {
  const tripId = trip.id;
  await ensureOnboardingOpener(db, session, trip);
  const started = Date.now();
  const text = cleanText(body.text || body.message, 12000);
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.slice(0, 20).map((item) => ({
      name: cleanText(item?.name, 240),
      type: cleanText(item?.type, 160),
      size: Number.parseInt(item?.size || '0', 10) || 0,
      lastModified: Number.parseInt(item?.lastModified || '0', 10) || null,
      inline: Boolean(item?.inline),
      contentDataUrl: cleanText(item?.contentDataUrl, 3_000_000) || null,
      note: cleanText(item?.note, 240) || null,
    }))
    : [];
  if (!text && attachments.length === 0) {
    throw Object.assign(new Error('Message text or an attachment is required.'), { statusCode: 400 });
  }

  const requestText = text || `Uploaded ${attachments.length} vacation file${attachments.length === 1 ? '' : 's'}.`;
  const modality = customerModality(body);
  const prior = await db`
    select count(*)::int as n,
      min(coalesce(received_at, created_at)) as started_at
    from transcript_turns
    where customer_id = ${session.customer_id}
      and trip_id = ${tripId}
      and channel = 'vacation-app'
      and payload->'liveTranscript' is not null
  `;
  const priorCount = Number(prior[0]?.n || 0);
  const sessionStartedMs = prior[0]?.started_at ? new Date(prior[0].started_at).getTime() : started;
  const sessionE2eMs = () => Math.max(0, Date.now() - (Number.isFinite(sessionStartedMs) ? sessionStartedMs : started));
  const customerTurnIndex = priorCount + 1;
  const receivedAt = new Date().toISOString();
  const customerLive = liveTurnRecord({
    turnIndex: customerTurnIndex,
    role: 'customer',
    modality,
    text: requestText,
    at: receivedAt,
    latencyMs: Date.now() - started,
    sessionE2eMs: sessionE2eMs(),
    jev: { jevRan: false, error: 'classify_pending' },
  });
  const payload = {
    source: 'vacation_app',
    surface: 'vacation-app',
    attachments,
    voiceMode: modality === 'voice',
    browserTranscription: Boolean(body.browserTranscription) && modality === 'voice',
    selectedTripId: tripId,
    liveTranscript: customerLive,
  };
  const turnTag = classifyTurn({
    text: requestText,
    speaker: 'customer',
    direction: 'inbound',
    channel: 'vacation-app',
    payload,
  });
  const requestRows = await db`
    insert into vacation_requests (
      customer_id, trip_id, source, request_type, request_text, normalized_intent, payload,
      status, queued_at
    )
    values (
      ${session.customer_id}, ${tripId}, 'vacation-app', 'trip_intake', ${requestText},
      ${{ turnTag }}, ${payload}, 'queued', now()
    )
    returning id, received_at, queued_at
  `;
  const requestId = requestRows[0].id;
  const intakeLatency = Date.now() - started;
  const turnRows = await db`
    insert into transcript_turns (
      customer_id, trip_id, request_id, speaker, channel, body, payload, direction,
      received_at, response_latency_ms,
      turn_category, turn_tags, turn_tag_source, turn_tag_confidence, turn_tagged_at
    )
    values (
      ${session.customer_id}, ${tripId}, ${requestId}, 'customer', 'vacation-app', ${requestText}, ${payload}, 'inbound',
      now(), ${intakeLatency},
      ${turnTag.category}, ${turnTag.tags}, ${turnTag.source}, ${turnTag.confidence}, now()
    )
    returning id
  `;
  await db`
    insert into vacation_request_events (request_id, event_type, actor, details)
    values
      (${requestId}, 'received', 'customer', ${payload}),
      (${requestId}, 'queued', 'system', ${{ surface: 'vacation-app', turnTag }})
  `;
  const jobRows = await db`
    insert into worker_jobs (request_id, trip_id, job_type, input)
    values (${requestId}, ${tripId}, 'trip_intake', ${{
      customerId: session.customer_id,
      tripId,
      requestId,
      source: 'vacation-app',
      requestType: 'trip_intake',
      requestText,
      payload,
    }})
    returning id
  `;

  const memoryRows = await db`
    select speaker, body
    from transcript_turns
    where customer_id = ${session.customer_id}
      and trip_id = ${tripId}
      and channel = 'vacation-app'
      and payload->'liveTranscript' is not null
    order by coalesce(received_at, sent_at, created_at) asc
    limit 40
  `;
  const priorTurns = memoryRows.map((row) => ({
    role: row.speaker === 'app' ? 'app' : 'customer',
    text: row.body || '',
  }));
  let produced;
  try {
    produced = await produceLiveAppReply({
      customerTurn: requestText,
      session,
      priorTurns,
      tripTitle: trip?.title || '',
      env: process.env,
    });
  } catch (error) {
    produced = {
      reply: null,
      rules: null,
      jev: { jevRan: false, error: error?.message || 'live dispatcher failed' },
      model: null,
      reason: error?.message || 'live dispatcher failed',
    };
  }
  customerLive.jev = jevStamp(produced.jev);
  customerLive.rules = produced.rules
    ? { ok: Boolean(produced.rules.ok), via: produced.rules.via || null, slug: produced.rules.slug || null }
    : null;
  payload.liveTranscript = customerLive;
  await db`
    update transcript_turns
    set payload = ${payload}
    where id = ${turnRows[0].id}
  `;

  const exchangeLatency = Date.now() - started;
  const base = {
    requestId,
    jobId: jobRows[0].id,
    receivedAt: requestRows[0].received_at,
    queuedAt: requestRows[0].queued_at,
    turnTag,
    modality,
    turnIndex: customerTurnIndex,
    latencyMs: exchangeLatency,
    sessionE2eMs: sessionE2eMs(),
    jev: customerLive.jev,
    reply: null,
  };
  if (!produced.reply) {
    return { ...base, ok: false, status: 'reply_unavailable', error: produced.reason || 'live dispatcher returned no reply' };
  }

  const appLive = liveTurnRecord({
    turnIndex: customerTurnIndex + 1,
    role: 'app',
    modality: 'text',
    text: produced.reply,
    at: new Date().toISOString(),
    latencyMs: exchangeLatency,
    sessionE2eMs: sessionE2eMs(),
    jev: produced.jev,
    model: produced.model,
    rules: produced.rules,
  });
  const appPayload = {
    source: 'vacation_app',
    surface: 'vacation-app',
    selectedTripId: tripId,
    liveTranscript: appLive,
  };
  await db`
    insert into transcript_turns (
      customer_id, trip_id, request_id, speaker, channel, body, payload, direction,
      sent_at, response_latency_ms
    )
    values (
      ${session.customer_id}, ${tripId}, ${requestId}, 'app', 'vacation-app', ${produced.reply}, ${appPayload}, 'outbound',
      now(), ${exchangeLatency}
    )
  `;
  return {
    ...base,
    ok: true,
    status: 'replied',
    reply: produced.reply,
    appTurnIndex: appLive.turnIndex,
    error: null,
  };
}

async function vacationAppEula(session, env = process.env) {
  const status = await vacationEulaStatus(session, env);
  const accepted = Boolean(status.ok || status.status === 'accepted');
  const payload = {
    accepted,
    status: accepted ? 'accepted' : (status.status || 'pending'),
    sessionId: status.sessionId || null,
    version: null,
    text: '',
  };
  if (accepted || !payload.sessionId) return payload;
  const store = createPersistentStoreFromEnv(env);
  const eulaSession = await loadSessionPersistent(store, payload.sessionId);
  payload.version = eulaSession?.eula?.version || null;
  payload.text = eulaSession?.eula?.text || '';
  return payload;
}

async function handleVacationApp(req, res, db, url) {
  const token = cleanText(url.searchParams.get('session') || url.searchParams.get('token'), 180);
  if (!token) return sendJson(res, 400, { ok: false, error: 'session is required.' });

  const session = await loadVacationAppSession(db, token);
  if (!session?.customer_id) return sendJson(res, 404, { ok: false, error: 'Vacation app session not found.' });

  if (req.method === 'GET') {
    const vacations = await loadVacationAppTrips(db, session);
    const requestedTripId = cleanText(url.searchParams.get('tripId') || url.searchParams.get('trip_id'), 80);
    const selected = vacations.find((trip) => trip.id === requestedTripId)
      || vacations.find((trip) => trip.id === session.trip_id)
      || vacations[0]
      || null;
    const eula = await vacationAppEula(session, process.env);
    if (selected && eula.accepted) await ensureOnboardingOpener(db, session, selected);
    const turns = selected ? await loadVacationAppTurns(db, session, selected.id) : [];
    return sendJson(res, 200, {
      ok: true,
      session: {
        token: session.token,
        status: session.status,
        customerName: session.display_name || [session.first_name, session.last_name].filter(Boolean).join(' '),
        email: session.email || null,
        currentTripId: selected?.id || session.trip_id || vacations[0]?.id || null,
      },
      eula,
      vacations,
      turns,
    });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    const vacations = await loadVacationAppTrips(db, session);
    const requestedTripId = cleanText(body.tripId || body.trip_id, 80);
    const selected = vacations.find((trip) => trip.id === requestedTripId)
      || vacations.find((trip) => trip.id === session.trip_id)
      || vacations[0];
    if (!selected) return sendJson(res, 409, { ok: false, error: 'No vacation is available for this session yet.' });
    const eula = await vacationAppEula(session, process.env);
    if (!eula.accepted) return sendJson(res, 409, { ok: false, error: 'Accept the terms before sending a message.' });
    const queued = await queueVacationAppTurn(db, session, selected, body);
    return sendJson(res, queued.ok ? 201 : 502, {
      trip: selected,
      ...queued,
    });
  }

  return sendJson(res, 405, { ok: false, error: 'method not allowed' });
}

function isStagingHost(req) {
  const host = String(req.headers.host || '').toLowerCase();
  return host.includes('vacation-staging.timesyncher.com')
    || host.includes('timesyncher-vacation-staging');
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'https://timesyncher.com');
    if (url.searchParams.get('app') === '1') {
      return await handleVacationApp(req, res, sql(process.env), url);
    }
    if (url.searchParams.get('trekBundle') === '1') {
      return await trekStyle2BundleHandler(req, res);
    }
    if (url.searchParams.get('pdfQr') === '1' || /\/api\/pdf\/qr\.svg$/i.test(url.pathname)) {
      return handlePdfQrSvg(req, res);
    }
    if (url.searchParams.get('keepsakePdf') === '1' || /\/api\/pdf\/shared(?:\/|$)/.test(url.pathname)) {
      return await keepsakeStyle2Handler(req, res);
    }
    if (url.searchParams.has('trekPath') || /\/api\/shared(?:-trip)?(?:\/|$)/.test(url.pathname)) {
      return await sharedTripHandler(req, res);
    }
    if (url.searchParams.get('mediaBind') === '1' || url.pathname.endsWith('/bind-thing-media')) {
      return await bindThingMediaHandler(req, res);
    }
    const db = sql(process.env);
    if (url.searchParams.get('webAccess') === '1' || url.pathname.endsWith('/vacation-web-access')) {
      return await handleWebAccess(req, res, db, url);
    }

    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
    const token = cleanText(url.searchParams.get('session') || url.searchParams.get('token'), 160);
    if (!token) return sendJson(res, 400, { ok: false, error: 'session is required.' });

    const sessions = await db`
      select
        onboarding_sessions.token,
        onboarding_sessions.status as onboarding_status,
        trips.id as trip_id,
        trips.title,
        trips.start_date,
        trips.end_date,
        trips.destination,
        trips.status,
        customers.display_name,
        customers.first_name,
        customers.last_name
      from onboarding_sessions
      join trips on trips.id = onboarding_sessions.trip_id
      left join customers on customers.id = onboarding_sessions.customer_id
      where onboarding_sessions.token = ${token}
      limit 1
    `;
    const session = sessions[0];
    if (!session) return sendJson(res, 404, { ok: false, error: 'Itinerary not found.' });

    const things = await db`
      select id, category, subtype, title, description, starts_at, ends_at, cost_estimate_cents,
        currency, location, links, ratings, metadata, created_at
      from trip_things
      where trip_id = ${session.trip_id}
      order by
        coalesce(starts_at, created_at) asc,
        case category
          when 'transport' then 1
          when 'hotel' then 2
          when 'activity' then 3
          when 'restaurant' then 4
          else 9
        end,
        created_at asc
    `;
    const budgets = await db`
      select category, label, amount_cents, currency, metadata, created_at
      from budget_items
      where trip_id = ${session.trip_id}
      order by created_at asc
    `;
    await db`
      create table if not exists vacation_media_uploads (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid references customers(id) on delete set null,
        trip_id uuid references trips(id) on delete cascade,
        telegram_session_id uuid references telegram_sessions(id) on delete set null,
        public_token text not null unique,
        media_kind text not null,
        attachment_scope text not null default 'trip',
        thing_id uuid references trip_things(id) on delete set null,
        day_date date,
        caption text,
        mime_type text,
        original_name text,
        file_size_bytes bigint,
        width integer,
        height integer,
        duration_seconds integer,
        telegram_file_id text,
        telegram_file_unique_id text,
        telegram_file_path text,
        telegram_message_id text,
        telegram_chat_id text,
        telegram_user_id text,
        storage_provider text not null default 'telegram',
        status text not null default 'active',
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    const media = await db`
      select id, public_token, media_kind, attachment_scope, day_date, caption, mime_type,
        file_size_bytes, width, height, duration_seconds, created_at
      from vacation_media_uploads
      where trip_id = ${session.trip_id}
        and status = 'active'
      order by created_at desc
      limit 200
    `;
    const origin = `https://${req.headers.host || 'vacation.timesyncher.com'}`;

    if (isStagingHost(req)) {
      res.setHeader('cache-control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    }

    return sendJson(res, 200, {
      ok: true,
      trip: {
        title: session.title,
        destination: session.destination,
        startDate: session.start_date,
        endDate: session.end_date,
        status: session.status,
        travelerName: session.display_name || [session.first_name, session.last_name].filter(Boolean).join(' '),
      },
      sections: groupBy(things, 'category'),
      things,
      budgets,
      media: media.map((item) => ({
        id: item.id,
        kind: item.media_kind,
        attachmentScope: item.attachment_scope,
        dayDate: item.day_date,
        caption: item.caption,
        mimeType: item.mime_type,
        fileSizeBytes: item.file_size_bytes,
        width: item.width,
        height: item.height,
        durationSeconds: item.duration_seconds,
        createdAt: item.created_at,
        url: `${origin}/api/vacation-telegram-turn?action=media-download&id=${encodeURIComponent(item.id)}&token=${encodeURIComponent(item.public_token)}`,
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to load itinerary.' });
  }
}
