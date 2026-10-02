import { requireIntakeAuth } from '../src/vacation/auth.mjs';
import { sql } from '../src/vacation/db.mjs';
import { queueOrSendWebEditorInviteEmail } from '../src/vacation/email.mjs';
import { cleanText, readJson, sendJson, vacationAppErrorBody } from '../src/vacation/http.mjs';
import { classifyTurn, classifyTurnWithModel } from '../src/vacation/turn-tags.mjs';
import {
  acceptWebAccessInvite,
  createOwnerWebsiteSessionByShareToken,
  createWebEditorInvite,
  loadWebAccessGrantByInviteToken,
  publicTripUrl,
  readCookie,
  requireWebEditAccess,
  webAccessCookieHeader,
  webAccessCookieName,
  webAccessForSession,
} from '../src/vacation/web-access.mjs';
import { collaboratorEulaAcceptUrl } from '../src/vacation/collaborators.mjs';
import bindThingMediaHandler from '../src/vacation/bind-thing-media-handler.mjs';
import sharedTripHandler from '../src/vacation/shared-trip-handler.mjs';
import keepsakeStyle2Handler from '../src/vacation/keepsake-style2-handler.mjs';
import handlePdfQrSvg from '../src/vacation/pdf-qr-svg-handler.mjs';
import trekStyle2BundleHandler from '../src/vacation/trek-style2-bundle.mjs';
import { configuredSeatDollars } from '../src/vacation/seat-price.mjs';
import { storePreCollaboratorSnapshot } from '../src/vacation/pre-collaborator-snapshot.mjs';
import { assignTripSiteUrl, vacationEulaStatus } from '../src/vacation/onboarding.mjs';
import { createVacationFromChatMessage } from '../src/vacation/vacation-from-chat-intake.mjs';
import { onboardingWelcomeFailure, welcomeFailureBody } from '../src/vacation/welcome-failure.mjs';
import { loadSessionPersistent } from '../src/onboarding/eula-persistent-core.mjs';
import { createPersistentStoreFromEnv } from '../src/onboarding/eula-persistent-store.mjs';
import { customerModality, jevStamp, liveTurnRecord, intakeSpan, firstMarkedIntake, produceLiveAppReply, finishTierRewrite, activityCommitDecisions, applyAgreedAppSwim, applyCustomerNotes, completeRosterParty } from '../src/vacation/live-app-turn.mjs';
import { queueVacationAppTurn as runQueueVacationAppTurn } from './vacation-app-chat-queue.mjs';
// Live queue turn (see vacation-app-chat-queue.mjs): runVacationAppInTurnSearch, authorId: session.customer_id, classifyVacationAppCustomerTurn, classifyTripIntake, intakeExtractedThings(placeSearchTurn, classification), applyChatPlaceSearchForVacationTurn, workerJobId: jobRows[0].id, placeSearchTurn, placeSearchTurn,, worker_jobs, insert into worker_jobs (request_id, trip_id, job_type, input), const queuedJobType = 'trip_intake', wantedThings: jobFields.wantedThings, intakeEvent: jobFields.intakeEvent, thingsFromIntake, wantedThings, intakeEvent, resolveIntakePlace, transcript_turns, applyLiveAppReplyFailureToPayload, produceLiveAppReply, persistVacationAppOutboundReply(, contentDataUrl, liveTranscript, jevStamp, classifyTurn, error: failure.replyFailure
import { cannedWelcomeLiveTurn, missingWelcomeFields, renderOnboardingWelcome } from '../src/vacation/onboarding-welcome.mjs';
import { authorPeopleFromTrip, transcriptAuthorMissingError, turnAuthorLabel } from '../src/vacation/turn-author.mjs';
import { appReplyTelemetry, logVacationAppReplyTelemetry } from '../src/vacation/reply-telemetry.mjs';
import {
  applyLiveAppReplyFailureToPayload,
  commitShippedRewrite,
  markWorkerJobLiveHandled,
  persistVacationAppOutboundReply,
  storeReplyFailure,
  vacationAppTurnPayloadForClient,
} from '../src/vacation/reply-ship.mjs';
import { persistIntakeLodgingLookupOnCustomerTurn, persistIntakeLodgingThings } from '../src/vacation/intake-lodging-thing.mjs';
import {
  classifyTripIntake,
  intakeActivityThings,
  intakeLodgingThings,
  intakeLodgingWanted,
  mergeWantedThings,
  resolveIntakePlace,
  tripIntakeJobFields,
} from '../src/vacation/trip-intake-classify.mjs';
import {
  classifyVacationAppCustomerTurn,
  intakeExtractedThings,
  runVacationAppInTurnSearch,
} from '../src/vacation/chat-place-search.mjs';
import { openRouterDestinationComplete, resolveTripDestination } from '../src/vacation/trip-destination.mjs';
import { openCollaboratorAppSeats, recordDialogParty, seatFromSession, collaboratorSeatJoinEvent, transcriptCustomerId } from '../src/vacation/collaborator-app-seat.mjs';
import {
  collaboratorSessionForAccept,
  vacationAppEulaForCollaboratorSeat,
} from '../src/vacation/collaborator-eula-accept.mjs';
import { collaboratorEulaSessionId } from '../src/vacation/collaborators.mjs';
import { runCollaboratorInviteAction } from '../src/vacation/collaborator-invite-action.mjs';
import { blockVacationAppReplyIdCitation } from '../src/vacation/reply-id-citation.mjs';
import { loadSessionOwnerReplyPlan } from '../src/vacation/reply-plan-entitlement.mjs';

let vacationAppDatabase = null;

export function useVacationAppDatabase(db) {
  vacationAppDatabase = db || null;
}

function openVacationAppDb() {
  if (vacationAppDatabase) return vacationAppDatabase;
  return sql(process.env);
}

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
    const pending = await loadWebAccessGrantByInviteToken(db, token, process.env);
    const pendingMeta = pending?.metadata && typeof pending.metadata === 'object' ? pending.metadata : {};
    const collaboratorInviteId = cleanText(pendingMeta.collaboratorInviteId, 80);
    if (collaboratorInviteId) {
      res.statusCode = 302;
      res.setHeader('location', collaboratorEulaAcceptUrl({ id: collaboratorInviteId }, process.env));
      res.setHeader('cache-control', 'no-store');
      return res.end();
    }
    const accepted = await acceptWebAccessInvite(db, token, process.env);
    return sendHtml(res, 200, acceptedHtml(accepted), {
      'set-cookie': webAccessCookieHeader(accepted.sessionToken, process.env),
    });
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
    intakeShare: metadata.intakeShare === true,
    intakeRule: metadata.intakeRule || '',
    intakeSpan: metadata.intakeSpan || '',
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
      onboarding_sessions.order_id,
      customers.display_name,
      customers.first_name,
      customers.last_name,
      customers.email,
      onboarding_sessions.metadata
    from onboarding_sessions
    left join customers on customers.id = onboarding_sessions.customer_id
    where onboarding_sessions.token = ${token}
    limit 1
  `;
  return rows[0] || null;
}

async function loadVacationAppTrips(db, session) {
  const seat = seatFromSession(session);
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
      or (${seat?.ownerTripId || null}::uuid is not null and trips.id = ${seat?.ownerTripId || null})
    order by
      (trips.id = ${session.trip_id}) desc,
      trips.updated_at desc nulls last,
      trips.created_at desc nulls last
  `;
  return rows.map(vacationAppTripSummary);
}

async function loadTranscriptAuthorPeople(db, customerId, tripKey) {
  const owners = await db`
    select id, first_name, display_name
    from customers
    where id = ${customerId}
    limit 1
  `;
  const owner = owners[0] || null;
  let party = {};
  let collabRows = [];
  if (tripKey) {
    const tripRows = await db`select metadata from trips where id = ${tripKey} limit 1`;
    const tripMeta = tripRows[0]?.metadata && typeof tripRows[0].metadata === 'object' ? tripRows[0].metadata : {};
    party = tripMeta.dialogParty && typeof tripMeta.dialogParty === 'object' ? tripMeta.dialogParty : {};
    collabRows = await db`
      select c.display_name, c.metadata, i.metadata as invite_metadata
      from vacation_collaborators c
      left join vacation_collaborator_invites i on i.id = c.invite_id
      where c.owner_customer_id = ${customerId}
        and c.trip_id = ${tripKey}
        and c.status = 'active'
    `;
  } else {
    collabRows = await db`
      select c.display_name, c.metadata, i.metadata as invite_metadata
      from vacation_collaborators c
      left join vacation_collaborator_invites i on i.id = c.invite_id
      where c.owner_customer_id = ${customerId}
        and c.trip_id is null
        and c.status = 'active'
    `;
  }
  const partyWithOwner = owner
    ? {
      ...party,
      primary: party?.primary || {
        id: owner.id,
        first_name: owner.first_name,
        display_name: owner.display_name,
      },
    }
    : party;
  return authorPeopleFromTrip(partyWithOwner, collabRows, customerId);
}

async function loadVacationAppTurns(db, session, tripId) {
  const customerId = transcriptCustomerId(session);
  if (!customerId) return [];
  const tripKey = tripId || null;
  const people = await loadTranscriptAuthorPeople(db, customerId, tripKey);
  const labelSession = {
    ...session,
    viewerId: session.viewerId || session.customer_id || null,
  };
  const rows = tripKey
    ? await db`
      select speaker, body, channel, payload, direction, received_at, sent_at, created_at
      from transcript_turns
      where customer_id = ${customerId}
        and trip_id = ${tripKey}
        and channel in ('vacation-app', 'vacation_app', 'telegram_vacation_bot', 'telegram_vacation_media')
      order by coalesce(received_at, sent_at, created_at) desc nulls last
      limit 120
    `
    : await db`
      select speaker, body, channel, payload, direction, received_at, sent_at, created_at
      from transcript_turns
      where customer_id = ${customerId}
        and trip_id is null
        and channel in ('vacation-app', 'vacation_app', 'telegram_vacation_bot', 'telegram_vacation_media')
      order by coalesce(received_at, sent_at, created_at) desc nulls last
      limit 120
    `;
  return rows.reverse().map((row) => {
    const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const clientPayload = vacationAppTurnPayloadForClient(payload);
    const live = clientPayload.liveTranscript && typeof clientPayload.liveTranscript === 'object' ? clientPayload.liveTranscript : {};
    const inbound = row.speaker === 'customer' || row.direction === 'inbound';
    const turn = {
      speaker: row.speaker || 'customer',
      body: row.body || '',
      channel: row.channel || '',
      direction: row.direction || '',
      payload: clientPayload,
      authorName: String(clientPayload.authorName || live.speakerName || ''),
      authorId: (() => {
        const explicit = String(clientPayload.authorId || '').trim();
        if (explicit) return explicit;
        const spoken = String(clientPayload.authorName || live.speakerName || '').trim();
        if (inbound && !spoken) return String(customerId);
        return '';
      })(),
      at: row.received_at || row.sent_at || row.created_at || null,
    };
    const named = turnAuthorLabel(turn, labelSession, people);
    turn.authorLabel = named.label;
    if (named.reason) turn.authorLabelReason = named.reason;
    if (named.reason === 'author_name_missing' && inbound) {
      const missing = transcriptAuthorMissingError(turn, labelSession, tripKey);
      console.error(JSON.stringify(missing));
      throw Object.assign(new Error('transcript_author_missing'), { code: 'transcript_author_missing', details: missing });
    }
    if (row.speaker === 'app' || live.role === 'app') Object.assign(turn, appReplyTelemetry(live));
    return turn;
  });
}

function welcomeFirstName(value) {
  const text = String(value || '').trim();
  return text ? text.split(/\s+/)[0] : '';
}

function tripHasVacationSite(trip) {
  return Boolean(String(trip?.shareToken || '').trim());
}

function tripWelcomeSiteUrl(trip) {
  if (!tripHasVacationSite(trip)) return '';
  const direct = String(trip?.publicUrl || '').trim();
  if (direct) return direct;
  return builtVacationSiteUrl({
    sharedToken: trip.shareToken,
    shareToken: trip.shareToken,
    publicUrl: trip.publicUrl,
  });
}

async function welcomeInputs(db, session, trip) {
  const seat = seatFromSession(session);
  const hasSite = tripHasVacationSite(trip);
  const tripSiteUrl = hasSite ? tripWelcomeSiteUrl(trip) : '';
  const tripTitle = String(trip?.title || '').trim();
  if (seat) {
    const owners = await db`
      select first_name, display_name
      from customers
      where id = ${seat.ownerCustomerId}
      limit 1
    `;
    const owner = owners[0] || {};
    const collabFirstName = welcomeFirstName(session.first_name || seat.displayName || session.display_name);
    const ownerFirstName = welcomeFirstName(owner.first_name || owner.display_name);
    if (hasSite) {
      return {
        audience: 'collaborator',
        ownerFirstName,
        collabFirstName,
        tripTitle,
        tripSiteUrl,
      };
    }
    return {
      audience: 'collaborator_no_site',
      ownerFirstName,
      collabFirstName,
      tripTitle: tripTitle || 'this vacation',
    };
  }
  const firstName = welcomeFirstName(session.first_name || session.display_name);
  if (hasSite) {
    return { audience: 'owner', firstName, tripSiteUrl };
  }
  return { audience: 'owner_no_site', firstName };
}

export async function ensureOnboardingOpener(db, session, trip, deps) {
  const seat = seatFromSession(session);
  const tripId = trip?.id || seat?.ownerTripId || null;
  const onboardingSessionId = session?.id;
  if (!onboardingSessionId) return;
  const customerId = seat ? transcriptCustomerId(session) : session.customer_id;
  const welcomeFor = seat ? String(session.customer_id) : 'owner';
  const welcomeAudience = seat ? 'collaborator' : 'owner';
  const welcomeTrip = trip || { id: null, shareToken: '', publicUrl: '', title: '' };
  const claimed = await db`
    insert into vacation_onboarding_welcomes (onboarding_session_id, welcome_for, trip_id)
    values (${onboardingSessionId}, ${welcomeFor}, ${tripId})
    on conflict (onboarding_session_id, welcome_for) do nothing
    returning id
  `;
  if (!claimed.length) return;
  const inputs = await welcomeInputs(db, session, welcomeTrip);
  const missing = missingWelcomeFields(inputs);
  const started = Date.now();
  let text;
  try {
    if (missing.length) throw onboardingWelcomeFailure(`onboarding welcome missing ${missing[0]}`, tripId);
    text = renderOnboardingWelcome(inputs, deps);
  } catch (error) {
    const failed = error?.code === 'onboarding_welcome_failed' ? error : onboardingWelcomeFailure(error?.message, tripId);
    const welcomeError = { reason: String(failed.reason || failed.message || ''), tripId: String(tripId || ''), missing };
    console.error(JSON.stringify({ event: 'onboarding_welcome_failed', ...welcomeError }));
    failed.welcomeError = welcomeError;
    throw failed;
  }
  const elapsed = Math.max(1, Date.now() - started);
  const live = cannedWelcomeLiveTurn({
    text,
    at: new Date().toISOString(),
    latencyMs: elapsed,
    sessionE2eMs: elapsed,
  });
  logVacationAppReplyTelemetry(live);
  const payload = {
    source: 'vacation_app',
    surface: 'vacation-app',
    selectedTripId: tripId,
    welcomeAudience,
    welcomeFor,
    liveTranscript: live,
  };
  const inserted = await db`
    insert into transcript_turns (
      customer_id, trip_id, speaker, channel, body, payload, direction,
      sent_at, response_latency_ms
    )
    values (
      ${customerId}, ${tripId}, 'app', 'vacation-app', ${text}, ${payload}, 'outbound',
      now(), 0
    )
    returning id
  `;
  if (inserted.length) {
    console.log(JSON.stringify({
      event: 'canned_welcome',
      customerId: String(customerId || ''),
      tripId: tripId ? String(tripId) : null,
      welcomeAudience,
      welcomeFor,
      telemetry: live.telemetry,
    }));
  }
}

function queueVacationAppHooks() {
  return {
    ensureOnboardingOpener,
    publishIntakeShare,
    recordCustomerThingNotes,
    vacationAppTripSummary,
  };
}

async function queueVacationAppTurn(db, session, trip, body) {
  if (!seatFromSession(session)) await ensureOnboardingOpener(db, session, trip || null);
  const requestText = cleanText(body.text || body.message, 12000);
  const { classification, placeSearchTurn, webResearchTurn } = await classifyVacationAppCustomerTurn(
    requestText,
    process.env,
    (opts) => classifyTripIntake({ ...opts, requireExtractedTripDates: false }),
  );
  return runQueueVacationAppTurn(db, session, trip, body, queueVacationAppHooks(), {
    requestText,
    classification,
    placeSearchTurn,
    webResearchTurn,
  });
}

function thingView(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const notes = Array.isArray(meta.notes) ? meta.notes : [];
  const collaboratorNotes = Array.isArray(meta.collaboratorNotes) ? meta.collaboratorNotes : [];
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description || '',
    location: row.location && typeof row.location === 'object' ? row.location : {},
    metadata: meta,
    source: meta.source || '',
    who: meta.who || '',
    whenLabel: meta.whenLabel || '',
    customerWhen: meta.customerWhen || '',
    askWhichDay: meta.askWhichDay === true,
    notes,
    collaboratorNotes,
  };
}

async function publishIntakeShare(db, tripId) {
  const things = await db`select count(*)::int as n from trip_things where trip_id = ${tripId}`;
  if (!Number(things[0]?.n)) return;
  await assignTripSiteUrl(db, tripId, process.env);
  await storePreCollaboratorSnapshot(db, tripId);
}

async function loadTripThings(db, tripId) {
  if (!tripId) return [];
  const rows = await db`
    select id, category, title, description, metadata, location
    from trip_things
    where trip_id = ${tripId}
    order by created_at asc
  `;
  return rows.map(thingView);
}

async function ensureIntakeItinerary(db, tripId, text, extracted, { roster = null, rosterError = null, askRoster = false, extractedDestination = '', extractedTitle = '', destinationError = null, titleError = null, searchImpl, searchPlacesImpl, env = process.env, fetchImpl = globalThis.fetch, customerTurnId = null, wantedThings = [] } = {}) {
  const planned = intakeActivityThings(extracted);
  const lodgingWanted = intakeLodgingWanted(extracted, wantedThings);
  const existing = await db`select count(*)::int as n from trip_things where trip_id = ${tripId}`;
  if (Number(existing[0]?.n) > 0) {
    if (lodgingWanted.length) {
      const current = await loadTripThings(db, tripId);
      const lodgingOutcome = await persistIntakeLodgingThings(db, tripId, null, lodgingWanted, {
        destinationHint: extractedDestination,
        areaHint: extractedDestination,
        env,
        fetchImpl,
        searchImpl: searchPlacesImpl,
        existingThings: current,
      });
      if (customerTurnId && (lodgingOutcome?.lodgingOutcome || lodgingOutcome?.lookups?.length)) {
        await persistIntakeLodgingLookupOnCustomerTurn(
          db,
          customerTurnId,
          lodgingOutcome.lookups || [],
          lodgingOutcome.lodgingOutcome || null,
        );
      }
    }
    return loadTripThings(db, tripId);
  }
  const span = intakeSpan(text);
  const priorRows = await db`select destination, metadata from trips where id = ${tripId} limit 1`;
  const priorMeta = priorRows[0]?.metadata && typeof priorRows[0].metadata === 'object' ? priorRows[0].metadata : {};
  const priorDestination = String(priorRows[0]?.destination || '').trim();
  const resolvedDestination = priorDestination
    ? { destination: priorDestination, ask: false, source: 'saved-trip' }
    : await resolveTripDestination({
      saved: '',
      texts: [text],
      complete: (corpus) => openRouterDestinationComplete(corpus, process.env),
    });
  const priorParty = priorMeta.dialogParty && typeof priorMeta.dialogParty === 'object' ? priorMeta.dialogParty : {};
  const party = completeRosterParty({
    party: priorParty,
    customerName: priorParty.primary?.name || '',
    turns: [{ role: 'customer', text }],
    ...(Array.isArray(roster) || rosterError ? {
      roster: Array.isArray(roster) ? roster : [],
      rosterError,
      askRoster: askRoster === true,
    } : {}),
  });
  if (!party.primary?.name && priorParty.primary?.name) party.primary = priorParty.primary;
  const resolved = await resolveIntakePlace({
    destination: extractedDestination || resolvedDestination.destination,
    title: extractedTitle,
    destinationError,
    titleError,
    searchImpl,
  });
  const tripTitle = resolved.title;
  const tripDestination = resolved.destination || resolvedDestination.destination || '';
  const missingTitle = tripTitle ? null : resolved.titleError;
  const dated = span?.start ? 'yes' : '';
  await db`
    update trips
    set title = case
          when ${tripTitle} <> '' then ${tripTitle}
          else title
        end,
        destination = case
          when coalesce(destination, '') = '' and ${tripDestination} <> '' then ${tripDestination}
          else destination
        end,
        start_date = coalesce(start_date, ${span?.start || null}::date),
        end_date = coalesce(end_date, ${span?.end || null}::date),
        status = case when status = 'onboarding' and ${dated} = 'yes' then 'planning' else status end,
        metadata = coalesce(metadata, '{}'::jsonb) || ${{
          ...(span?.spanLabel ? { intakeSpan: span.spanLabel, intakeBadge: span.badge || '' } : {}),
          dialogParty: party,
          ...(tripDestination ? { destinationSource: resolved.destination ? 'chat_extraction' : resolvedDestination.source } : { destinationError: resolved.destinationError || (resolvedDestination.ask ? 'missing' : null) }),
          ...(tripTitle ? { titleSource: 'chat_extraction' } : { titleError: missingTitle }),
        }},
        updated_at = now()
    where id = ${tripId}
  `;
  for (const thing of planned) {
    await db`
      insert into trip_things (trip_id, category, title, description, currency, location, links, ratings, metadata)
      values (
        ${tripId}, ${thing.category}, ${thing.title}, ${thing.description},
        'usd', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, ${{
          source: thing.source || 'chat_extraction',
          who: thing.who || '',
          whenLabel: thing.whenLabel || '',
          customerWhen: '',
          askWhichDay: thing.askWhichDay === true,
          notes: thing.notes || [],
          collaboratorNotes: [],
        }}
      )
    `;
  }
  if (lodgingWanted.length) {
    const current = await loadTripThings(db, tripId);
    const lodgingOutcome = await persistIntakeLodgingThings(db, tripId, null, lodgingWanted, {
      destinationHint: extractedDestination,
      areaHint: extractedDestination,
      env,
      fetchImpl,
      searchImpl: searchPlacesImpl,
      existingThings: current,
    });
    if (customerTurnId && (lodgingOutcome?.lodgingOutcome || lodgingOutcome?.lookups?.length)) {
      await persistIntakeLodgingLookupOnCustomerTurn(
        db,
        customerTurnId,
        lodgingOutcome.lookups || [],
        lodgingOutcome.lodgingOutcome || null,
      );
    }
  }
  return loadTripThings(db, tripId);
}

async function recordCustomerThingNotes(db, tripId, text, { collaborator = false, speakerName = '', appReply = '', roster = null, rosterError = null, askRoster = false, extractedDestination = '', extractedTitle = '', destinationError = null, titleError = null, searchImpl, searchPlacesImpl, env = process.env, fetchImpl = globalThis.fetch, customerTurnId = null, wantedThings = [] } = {}, intakeText = '', extracted = []) {
  if (intakeText) {
    await ensureIntakeItinerary(db, tripId, intakeText, extracted, {
      roster, rosterError, askRoster, extractedDestination, extractedTitle, destinationError, titleError,
      searchImpl, searchPlacesImpl, env, fetchImpl, customerTurnId, wantedThings,
    });
  }
  let current = await loadTripThings(db, tripId);
  const lodgingLookups = [];
  if (!intakeText) {
    const lodgingWanted = intakeLodgingWanted(extracted, wantedThings);
    if (lodgingWanted.length) {
      const lodgingOutcome = await persistIntakeLodgingThings(db, tripId, null, lodgingWanted, {
        destinationHint: extractedDestination,
        areaHint: extractedDestination,
        env,
        fetchImpl,
        searchImpl: searchPlacesImpl,
        existingThings: current,
      });
      if (Array.isArray(lodgingOutcome?.lookups)) lodgingLookups.push(...lodgingOutcome.lookups);
      if (lodgingOutcome?.lodgingOutcome) {
        await persistIntakeLodgingLookupOnCustomerTurn(db, customerTurnId, lodgingOutcome.lookups || [], lodgingOutcome.lodgingOutcome);
      }
      current = await loadTripThings(db, tripId);
    }
    if (customerTurnId && lodgingLookups.length) {
      await persistIntakeLodgingLookupOnCustomerTurn(db, customerTurnId, lodgingLookups);
    }
  }
  const wanted = intakeActivityThings(extracted);
  if (!current.length && !wanted.length) return current;
  if (!String(text || '').trim() && !wanted.length) return current;
  const tripRows = await db`
    select start_date, end_date
    from trips
    where id = ${tripId}
    limit 1
  `;
  const start = tripRows[0]?.start_date || null;
  const end = tripRows[0]?.end_date || null;
  const year = start ? new Date(start).getUTCFullYear() : null;
  let next = mergeWantedThings(current, wanted);
  let commits = null;
  try {
    commits = await activityCommitDecisions(text);
  } catch (error) {
    commits = { __ask: true, error: String(error?.message || error) };
  }
  next = applyCustomerNotes(next, text, { collaborator, speakerName, commits });
  next = applyAgreedAppSwim(next, text, appReply, { start, end, year: Number.isFinite(year) ? year : null });
  for (const thing of next) {
    const prior = current.find((item) => item.id && item.id === thing.id);
    if (!prior) {
      if (current.some((item) => item.title === thing.title)) continue;
      await db`
        insert into trip_things (trip_id, category, title, description, currency, location, links, ratings, metadata)
        values (
          ${tripId}, ${thing.category || 'activity'}, ${thing.title}, ${thing.description || ''},
          'usd', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, ${{
            source: thing.source || 'customer-turn',
            who: thing.who || '',
            whenLabel: thing.whenLabel || '',
            customerWhen: thing.customerWhen || '',
            askWhichDay: thing.askWhichDay === true,
            notes: thing.notes || [],
            collaboratorNotes: thing.collaboratorNotes || [],
          }}
        )
      `;
      continue;
    }
    if (JSON.stringify({
      notes: prior.notes, collaboratorNotes: prior.collaboratorNotes, customerWhen: prior.customerWhen, who: prior.who, askWhichDay: prior.askWhichDay === true,
    }) === JSON.stringify({
      notes: thing.notes, collaboratorNotes: thing.collaboratorNotes, customerWhen: thing.customerWhen, who: thing.who, askWhichDay: thing.askWhichDay === true,
    })) continue;
    await db`
      update trip_things
      set description = '',
          metadata = coalesce(metadata, '{}'::jsonb) || ${{
            who: thing.who || '',
            whenLabel: thing.whenLabel || prior.whenLabel || '',
            customerWhen: thing.customerWhen || '',
            askWhichDay: thing.askWhichDay === true,
            notes: thing.notes || [],
            collaboratorNotes: thing.collaboratorNotes || [],
          }},
          updated_at = now()
      where id = ${thing.id}
    `;
  }
  return loadTripThings(db, tripId);
}

async function vacationAppEula(session, env = process.env) {
  const seat = seatFromSession(session);
  if (seat?.inviteId) return vacationAppEulaForCollaboratorSeat(session, seat, env);
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
  const seatForEula = seatFromSession(session);
  if (seatForEula?.inviteId) {
    const store = createPersistentStoreFromEnv(process.env);
    await collaboratorSessionForAccept(store, db, collaboratorEulaSessionId({ id: seatForEula.inviteId }), process.env);
  }

  if (req.method === 'GET') {
    let vacations = await loadVacationAppTrips(db, session);
    const requestedTripId = cleanText(url.searchParams.get('tripId') || url.searchParams.get('trip_id'), 80);
    let selected = vacations.find((trip) => trip.id === requestedTripId)
      || vacations.find((trip) => trip.id === session.trip_id)
      || vacations[0]
      || null;
    const eula = await vacationAppEula(session, process.env);
    if (eula.accepted) {
      await ensureOnboardingOpener(db, session, selected || null);
    }
    const turns = await loadVacationAppTurns(db, session, selected?.id || null);
    if (selected) await publishIntakeShare(db, selected.id);
    const published = selected ? await loadVacationAppTrips(db, session) : vacations;
    const itinerary = selected ? await loadTripThings(db, selected.id) : [];
    const seat = seatFromSession(session);
    return sendJson(res, 200, {
      ok: true,
      session: {
        token: session.token,
        status: session.status,
        customerName: seat?.displayName || session.display_name || [session.first_name, session.last_name].filter(Boolean).join(' '),
        viewerId: session.customer_id || null,
        email: session.email || null,
        currentTripId: selected?.id || session.trip_id || vacations[0]?.id || null,
        seat: seat ? { payer: seat.payer, displayName: seat.displayName } : null,
      },
      eula,
      vacations: published,
      turns,
      itinerary,
    });
  }

  if (req.method === 'POST') {
    const body = await readJson(req);
    if (body.action === 'open-seats' || body.action === 'collaborator-invite') {
      if (seatFromSession(session)) return sendJson(res, 403, { ok: false, error: 'A collaborator seat cannot open seats.' });
      const seat = Array.isArray(body.seats) ? body.seats[0] : body;
      const result = await runCollaboratorInviteAction(db, {
        session,
        tripId: cleanText(body.tripId || body.trip_id, 80) || session.trip_id || '',
        name: seat?.name || seat?.displayName,
        email: seat?.email,
        env: process.env,
      });
      return sendJson(res, 200, { ok: true, seats: result.seats, inviteResult: result });
    }
    if (body.action === 'finish-rewrite') {
      const meta = session.metadata && typeof session.metadata === 'object' ? session.metadata : {};
      const pending = meta.pendingRewrite;
      if (!pending?.draft || !pending?.tripId) return sendJson(res, 409, { ok: false, error: 'No rewrite is waiting.' });
      const finished = pending.resolved?.reply
        ? pending.resolved
        : await finishTierRewrite({ pending, env: process.env });
      if (!finished.reply) return sendJson(res, 502, { ok: false, error: finished.reason || 'The rewrite did not produce a reply.' });
      const shipped = await commitShippedRewrite(db, session, pending, finished, {
        recordCustomerThingNotes,
        publishIntakeShare,
      });
      return sendJson(res, 200, shipped);
    }
    if (body.action === 'record-party') {
      if (seatFromSession(session)) return sendJson(res, 403, { ok: false, error: 'A collaborator seat cannot record the roster.' });
      const party = await recordDialogParty(db, session.trip_id, body.party);
      return sendJson(res, 200, { ok: true, party });
    }
    let vacations = await loadVacationAppTrips(db, session);
    const eula = await vacationAppEula(session, process.env);
    const requestedTripId = cleanText(body.tripId || body.trip_id, 80);
    let selected = vacations.find((trip) => trip.id === requestedTripId)
      || vacations.find((trip) => trip.id === session.trip_id)
      || vacations[0];
    if (!selected) {
      if (!eula.accepted) {
        return sendJson(res, 409, vacationAppErrorBody({
          error: 'Accept the terms before sending a message.',
          code: 'eula_not_accepted',
          customerMessage: 'Accept the terms before you send a message.',
        }));
      }
      const created = await createVacationFromChatMessage(db, session, body, loadVacationAppTrips, process.env);
      if (!created.ok) {
        return sendJson(res, created.statusCode || 500, vacationAppErrorBody({
          error: created.error,
          code: created.code || 'vacation_app_chat_failed',
        }));
      }
      if (created.action === 'created' || created.action === 'existing') {
        vacations = created.vacations;
        selected = created.selected;
      }
    }
    if (!eula.accepted) {
      return sendJson(res, 409, vacationAppErrorBody({
        error: 'Accept the terms before sending a message.',
        code: 'eula_not_accepted',
        customerMessage: 'Accept the terms before you send a message.',
      }));
    }
    if (body.action === 'seat-join') {
      const seat = seatFromSession(session);
      if (!seat) return sendJson(res, 403, { ok: false, error: 'Only a collaborator seat records a join.' });
      const tripKey = selected?.id || seat.ownerTripId || null;
      if (!tripKey && !seat.ownerOnboardingSessionId) {
        return sendJson(res, 409, {
          ok: false,
          error: 'No vacation is available for this session yet.',
          code: 'vacation_app_trip_missing',
        });
      }
      const event = collaboratorSeatJoinEvent(seat);
      const prior = await loadVacationAppTurns(db, session, tripKey);
      if (prior.some((turn) => turn.speaker === 'system' && turn.payload?.event === 'collaborator_seat_join')) {
        return sendJson(res, 200, { ok: true, status: 'already_joined', reply: null });
      }
      await db`
        insert into transcript_turns (
          customer_id, trip_id, speaker, channel, body, payload, direction, sent_at
        )
        values (
          ${transcriptCustomerId(session)}, ${tripKey}, ${event.speaker}, ${event.channel}, ${event.body},
          ${event.payload}, ${event.direction}, now()
        )
      `;
      return sendJson(res, 201, { ok: true, status: 'joined', reply: null, event: event.payload.event });
    }
    const queued = await queueVacationAppTurn(db, session, selected, body);
    const postStatus = queued.ok ? (selected ? 201 : 200) : 502;
    return sendJson(res, postStatus, {
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

export async function attachIntakeItineraryFromReply(db, tripId, requestText, options, intakeText, extracted) {
  return recordCustomerThingNotes(db, tripId, requestText, options, intakeText, extracted);
}

export async function writeIntakeItineraryFromChat(db, tripId, intakeText, extracted, options = {}) {
  return ensureIntakeItinerary(db, tripId, intakeText, extracted, options);
}

export async function publishTripIntakeShare(db, tripId) {
  return publishIntakeShare(db, tripId);
}

export async function queueVacationAppTurnForTests(db, session, trip, body) {
  return queueVacationAppTurn(db, session, trip, body);
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '/', 'https://timesyncher.com');
    if (url.searchParams.get('app') === '1') {
      return await handleVacationApp(req, res, openVacationAppDb(), url);
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
        currency, location, links, ratings, metadata, source, created_at
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
        storage_provider text not null default 'url',
        status text not null default 'active',
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    const media = await db`
      select id, public_token, media_kind, attachment_scope, day_date, caption, mime_type,
        file_size_bytes, width, height, duration_seconds, storage_provider, created_at
      from vacation_media_uploads
      where trip_id = ${session.trip_id}
        and status = 'active'
      order by created_at desc
      limit 200
    `;
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
      media: media.flatMap((item) => {
        if (item.storage_provider === 'telegram') {
          console.error(`skipped vacation media ${item.id}: storage_provider=telegram is not fetched`);
          return [];
        }
        return [{
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
          storageProvider: item.storage_provider,
        }];
      }),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const welcome = welcomeFailureBody(error);
    return sendJson(res, error.statusCode || 400, welcome || { ok: false, error: error.message || 'Unable to load itinerary.' });
  }
}
