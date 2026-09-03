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
  remaining: 'applyTrekItineraryEdit runs only after pipelineWriteDecision.allowTrekWrite (validated writes and a Thing list). Empty items, skip, unmatched, and integrity stops fail closed with editApplied false and never call TREK writers. Bot annotate without a resolved live session is unresolved (not owner) and is non-blocking until API session resolution; a resolved unpaid/logged-out/public-link session is blocking. Verification tests do not mutate production TREK.',
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
const UNAUTHORIZED_ROLES = new Set(['public-link', 'viewer', 'logged-out', 'unpaid_collaborator', 'unresolved']);

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

export function actorFromLiveSession(session = {}) {
  const id = String(session.telegramUserId || session.id || session.email || 'unresolved');
  const entitlementAllowed = session.entitlement?.allowed === true;
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
  const collaboratorRole = String(session.metadata?.telegramRole || session.telegramRole || '').toLowerCase() === 'collaborator';
  const paidCollaborator = Boolean(session.collaborator?.id || session.collaborator?.status === 'active');
  if (collaboratorRole && !paidCollaborator) {
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
  if (!session.customer_id && !paidCollaborator) {
    return { ...actorFromIntake({ id, identity: id, loggedOut: true, session: null }), source: 'live_session' };
  }
  const role = paidCollaborator || collaboratorRole
    ? 'telegram_collaborator'
    : (session.role === 'web_editor' ? 'web_editor' : 'owner');
  return {
    ...actorFromIntake({
      id,
      identity: id,
      role,
      authorized: true,
      canEdit: true,
      canUpload: entitlementAllowed,
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
