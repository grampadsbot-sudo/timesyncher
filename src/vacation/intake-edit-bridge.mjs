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
  remaining: 'Live Telegram / shared-page intake always calls gateVacationIntakeEdit. Integrity stops (dropped clause, unauthorized upload/edit, stale media, duplicate TREK, checkout) fail closed before writers. Item matching and hosted TREK mutation still happen in product-gbrain-dispatch / trek-itinerary-edit when intake has no Thing list. --apply --trek-db is local TREK id-set proof; this lever does not mutate production TREK.',
});

const FAIL_CLOSED_REASONS = new Set([
  'dropped_clause',
  'unauthorized_upload',
  'unauthorized_edit',
  'stale_trip_media',
  'duplicate_trek',
  'checkout_entitlement',
]);

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
  return {
    id: id || 'intake-actor',
    identity: identity || id || 'intake-actor',
    role: role || 'owner',
    authorized: authorized !== false,
    canUpload: Boolean(canUpload),
    canEdit: canEdit !== false,
    session: session !== false,
    logged_out: false,
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
  const itemsLoaded = (receipt.page_context?.item_ids || []).length > 0;
  const unmatchedEdit = receipt.planned_writes.length === 0 && receipt.no_ops.some((row) => (
    ['no_match', 'incomplete_move', 'unknown', 'ambiguous_target'].includes(row.reason)
  ));
  const failClosed = integrityFailClosed || (itemsLoaded && unmatchedEdit);

  return {
    skip: false,
    failClosed,
    integrityFailClosed,
    reason: failClosed ? (receipt.dropped_clause ? 'dropped_clause' : receipt.no_ops[0]?.reason || 'no_validated_writes') : null,
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
