import {
  compactReceipt,
  runVacationEditPipeline,
} from './edit-pipeline.mjs';

export const INTAKE_PIPELINE_EXPORT = 'runVacationEditPipeline';

export const INTAKE_SEAM = Object.freeze({
  liveCallers: [
    'api/vacation-telegram-turn.mjs',
    'api/vacation-itinerary.mjs',
    'scripts/product-gbrain-dispatch.mjs',
    'scripts/telegram-vacation-intake-bot.mjs',
  ],
  remaining: 'pipelineWriteDecision.allowTrekWrite is the only path to a TREK writer; fail-closed sets editApplied false. applyTrekItineraryEdit and applyTrekAgentEdit/FORCE apply pipeline planned_writes only (applyValidatedOnly; no utterance re-parse). Dead re-parse helpers (inferFallbackPlan / planWithGrok / extractQuotedAdds) are removed from trek-* live files. Once the turn gate replies planned_writes (plannedWritesReplied), it does not queue a write worker; any subsequent customer turn must re-enter the gate. Thing list is live-locked trip_things for that trip_id, never client payload.things. Bot resolveLiveSession assigns payload.liveSession so unauthorized blocking is not inert; unresolved stays non-blocking. actorFromLiveSession does not infer owner/canEdit from customer_id alone and does not treat staging_bypass as entitlement/canUpload. Verification tests do not mutate production TREK.',
});

const FAIL_CLOSED_REASONS = new Set([
  'dropped_clause',
  'unauthorized_upload',
  'unauthorized_edit',
  'stale_trip_media',
  'duplicate_trek',
  'checkout_entitlement',
  'no_thing_list',
  'no_validated_writes',
]);

const UNAUTHORIZED_REASONS = new Set(['unauthorized_upload', 'unauthorized_edit', 'logged_out']);
const UNAUTHORIZED_ROLES = new Set(['public-link', 'viewer', 'logged-out', 'unpaid_collaborator', 'unresolved', 'unproven_session']);

const PAID_MEDIA_ENTITLEMENT_SOURCES = new Set([
  'entitlement',
  'paid_order',
  'timesyncher_paid',
  'stripe',
  'paid',
  'subscription',
  'session_entitlement',
]);

export function isPaidMediaEntitlement(entitlement) {
  if (!entitlement || entitlement.allowed !== true) return false;
  const source = String(entitlement.source || '').trim();
  if (!source || source === 'staging_bypass') return false;
  return PAID_MEDIA_ENTITLEMENT_SOURCES.has(source);
}

export function mapLiveLockedThingRows(rows = [], tripId) {
  const id = String(tripId || '').trim();
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      id: row.id,
      trip_id: id || row.trip_id || row.tripId || '',
      title: row.title || row.name,
      location: row.location,
      day: Number(row.metadata?.day || row.day || 0) || null,
    }))
    .filter((row) => row.id && row.title);
}

export function selectLiveLockedTripThings({ tripId, liveLockedThings, clientThings, payloadThings, tripItems } = {}) {
  void clientThings;
  void payloadThings;
  void tripItems;
  const id = String(tripId || '').trim();
  if (!id || !Array.isArray(liveLockedThings)) return [];
  return liveLockedThings.filter((row) => String(row?.trip_id || row?.tripId || id) === id);
}

export function isItineraryEditText(text = '') {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return false;
  return /\b(move|remove|delete|drop|rename|replace|swap|update|add|split|upload|attach)\b/.test(normalized);
}

export function actorFromIntake({ role, authorized, canUpload, canEdit, id, session, loggedOut, identity } = {}) {
  if (loggedOut || session === null) {
    return {
      id: id || 'logged-out',
      identity: identity || id || 'logged-out',
      role: 'logged-out',
      authorized: false,
      canUpload: false,
      canEdit: false,
      session: null,
      logged_out: true,
    };
  }
  const normalizedRole = role || 'owner';
  const unauthorizedRole = UNAUTHORIZED_ROLES.has(normalizedRole);
  return {
    id: id || 'intake-actor',
    identity: identity || id || 'intake-actor',
    role: normalizedRole,
    authorized: authorized === true && !unauthorizedRole,
    canUpload: Boolean(canUpload) && authorized === true && !unauthorizedRole,
    canEdit: canEdit !== false && authorized === true && !unauthorizedRole,
    session: session !== false,
    logged_out: false,
  };
}

export function buildLiveSessionFromLookup(lookup = {}) {
  if (!lookup || lookup.unresolved === true) {
    return { unresolved: true, id: lookup.telegramUserId || lookup.id || 'unresolved' };
  }
  if (lookup.loggedOut === true || lookup.session === null && !lookup.customer_id) {
    return {
      id: lookup.telegramUserId || lookup.id || 'logged-out',
      telegramUserId: lookup.telegramUserId,
      loggedOut: true,
      session: null,
    };
  }
  return {
    id: lookup.telegramUserId || lookup.id || lookup.email,
    telegramUserId: lookup.telegramUserId,
    customer_id: lookup.customer_id,
    trip_id: lookup.trip_id,
    metadata: lookup.metadata || {},
    collaborator: lookup.collaborator || null,
    entitlement: lookup.entitlement || { allowed: false },
    publicLink: lookup.publicLink === true,
    webGrant: lookup.webGrant,
    shareToken: lookup.shareToken,
    session: lookup.session,
    role: lookup.role,
    source: 'live_session_lookup',
  };
}

export function actorFromLiveSession(session = {}) {
  const id = String(session.telegramUserId || session.id || session.email || 'unresolved');
  if (session.loggedOut === true || session.session === null) {
    return { ...actorFromIntake({ id, identity: id, loggedOut: true, session: null }), source: 'live_session' };
  }
  if (session.publicLink === true || session.role === 'public-link' || (session.webGrant === null && session.shareToken)) {
    return {
      ...actorFromIntake({
        id,
        identity: id,
        role: 'public-link',
        authorized: false,
        canUpload: false,
        canEdit: false,
        session: session.sessionToken || false,
      }),
      source: 'live_session',
    };
  }
  if (session.unresolved === true) {
    return {
      id,
      identity: id,
      role: 'unresolved',
      authorized: false,
      canUpload: false,
      canEdit: false,
      session: false,
      logged_out: false,
      unresolved: true,
      source: 'live_session',
    };
  }
  const telegramRole = String(session.metadata?.telegramRole || session.telegramRole || '').toLowerCase();
  const grant = session.grant && typeof session.grant === 'object' ? session.grant : null;
  const grantRole = String(grant?.role || '').toLowerCase();
  const grantAccepted = Boolean(grant) && (grant.status === 'accepted' || grant.live === true);
  const collaboratorActive = String(session.collaborator?.status || '').toLowerCase() === 'active'
    && Boolean(session.collaborator?.id);

  if (telegramRole === 'collaborator' && !collaboratorActive) {
    return {
      ...actorFromIntake({
        id,
        identity: id,
        role: 'unpaid_collaborator',
        authorized: false,
        canUpload: false,
        canEdit: false,
      }),
      source: 'live_session',
    };
  }

  let role = null;
  if (telegramRole === 'owner') {
    role = 'owner';
  } else if (telegramRole === 'collaborator' && collaboratorActive) {
    role = 'telegram_collaborator';
  } else if (grantAccepted && (grantRole === 'owner' || grantRole === 'web_editor' || grantRole === 'telegram_collaborator')) {
    role = grantRole === 'owner' ? 'owner' : (grantRole === 'web_editor' ? 'web_editor' : 'telegram_collaborator');
  }

  if (!role) {
    const loggedOut = !session.customer_id;
    return {
      ...actorFromIntake({
        id,
        identity: id,
        role: loggedOut ? 'logged-out' : 'unproven_session',
        authorized: false,
        canUpload: false,
        canEdit: false,
        loggedOut,
        session: loggedOut ? null : true,
      }),
      source: 'live_session',
    };
  }

  return {
    ...actorFromIntake({
      id,
      identity: id,
      role,
      authorized: true,
      canEdit: true,
      canUpload: isPaidMediaEntitlement(session.entitlement),
    }),
    source: 'live_session',
  };
}

export function pipelineWriteDecision(gate, { items } = {}) {
  const itemCount = Array.isArray(items) ? items.length : 0;
  const planned = gate?.receipt?.planned_writes || [];
  if (gate?.skip) {
    return {
      allowTrekWrite: false,
      failClosed: false,
      editApplied: false,
      reason: gate.reason || 'not_an_itinerary_edit',
      mode: 'vacation_edit_pipeline_skip',
    };
  }
  if (itemCount === 0) {
    return {
      allowTrekWrite: false,
      failClosed: true,
      editApplied: false,
      reason: 'no_thing_list',
      mode: 'vacation_edit_pipeline_fail_closed',
    };
  }
  if (gate?.failClosed || planned.length === 0) {
    return {
      allowTrekWrite: false,
      failClosed: true,
      editApplied: false,
      reason: gate?.reason || 'no_validated_writes',
      mode: 'vacation_edit_pipeline_fail_closed',
    };
  }
  return {
    allowTrekWrite: true,
    failClosed: false,
    editApplied: true,
    reason: null,
    mode: 'vacation_edit_pipeline_validated',
  };
}

export function annotateIntakeFromLiveSession(raw = {}, options = {}) {
  const session = raw.session || { unresolved: true, id: raw.telegramUserId || raw.id || 'unresolved' };
  const actor = actorFromLiveSession(session);
  const gate = raw.media
    ? gateMediaUploadIntake({ ...raw, actor }, options)
    : gateTelegramIntakeEdit({ ...raw, actor }, options);
  const unauthorized = Boolean(gate.failClosed && (UNAUTHORIZED_REASONS.has(gate.reason) || UNAUTHORIZED_ROLES.has(actor.role)));
  const unresolved = Boolean(actor.unresolved || actor.role === 'unresolved');
  return {
    actor,
    gate,
    compact: gate.compact,
    failClosed: Boolean(gate.failClosed),
    blocked: Boolean(unauthorized && !unresolved),
    unresolved,
  };
}

export function gateVacationIntakeEdit(raw = {}, options = {}) {
  const text = raw.text || raw.transcript || '';
  if (!isItineraryEditText(text) && raw.surface !== 'shared-page-voice' && !raw.media) {
    return { skip: true, failClosed: false, reason: 'not_an_itinerary_edit', receipt: null, compact: null };
  }
  const { receipt } = runVacationEditPipeline({
    surface: raw.surface || 'telegram-text',
    text,
    audioPath: raw.audioPath || raw.audio_path,
    actor: raw.actor || actorFromIntake(raw),
    trip: raw.trip || {
      trip_id: raw.trip_id || raw.session?.trip_id || 'trip-unspecified',
      title: raw.trip_title || raw.session?.trip_title || 'Vacation',
      publicUrl: raw.publicUrl || '',
      status: 'live',
      items: raw.items || raw.pageContext?.items || [],
      trek_rows: raw.trek_rows || [],
    },
    pageContext: raw.pageContext || { kind: raw.page_kind || 'timeline', items: raw.items || [] },
    media: raw.media || null,
    checkout: raw.checkout || null,
    expected_clauses: raw.expected_clauses,
    fixture_id: raw.fixture_id || raw.id,
  }, { persist: options.persist === true, apply: false, cwd: options.cwd });

  const integrityFailClosed = Boolean(
    receipt.dropped_clause
    || receipt.no_ops.some((row) => FAIL_CLOSED_REASONS.has(row.reason))
    || receipt.stop_rules.some((rule) => rule.status === 'fail' && String(rule.id).startsWith('fail_closed_'))
  );
  const itemIds = receipt.page_context?.item_ids || [];
  const noThingList = !raw.media && itemIds.length === 0;
  const unmatchedEdit = receipt.planned_writes.length === 0 && (
    noThingList
    || receipt.no_ops.some((row) => ['no_match', 'incomplete_move', 'unknown', 'ambiguous_target', 'no_thing_list'].includes(row.reason))
  );
  const failClosed = integrityFailClosed || unmatchedEdit || noThingList;

  return {
    skip: false,
    failClosed,
    integrityFailClosed,
    reason: failClosed
      ? (receipt.dropped_clause ? 'dropped_clause' : (noThingList ? 'no_thing_list' : receipt.no_ops[0]?.reason || 'no_validated_writes'))
      : null,
    receipt,
    compact: compactReceipt(receipt),
  };
}

export function gateTelegramIntakeEdit(raw = {}, options = {}) {
  return gateVacationIntakeEdit({ ...raw, surface: raw.surface || (raw.audioPath || raw.payload?.telegramVoice ? 'telegram-voice' : 'telegram-text') }, options);
}

export function gateSharedPageIntakeEdit(raw = {}, options = {}) {
  return gateVacationIntakeEdit({ ...raw, surface: raw.surface || 'shared-page-voice' }, options);
}

export function gateMediaUploadIntake(raw = {}, options = {}) {
  const text = raw.text || `Upload this ${raw.media?.media_kind || 'photo'} to the vacation`;
  return gateVacationIntakeEdit({ ...raw, text, surface: raw.surface || 'telegram-text', media: raw.media }, options);
}
