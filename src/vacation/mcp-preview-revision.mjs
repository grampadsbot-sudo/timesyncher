import crypto from 'node:crypto';
import { cleanText } from './http.mjs';
import { ensureVacationMcpSchema } from './mcp-tokens.mjs';
import { loadScopedChangeSet } from './mcp-media-service.mjs';
import { buildDraftImportPreview, buildTargetedEditPreview } from './mcp-preview.mjs';
import { asArray, asObject } from './mcp-read.mjs';

export function extractPreviewVersion(preview) {
  const num = Number(preview?.preview_version);
  return Number.isFinite(num) && num >= 1 ? Math.floor(num) : 1;
}

export function extractChangeRequests(preview) {
  return asArray(preview?.change_requests).filter((entry) => entry && typeof entry === 'object' && cleanText(entry.note, 1000));
}

export async function markPriorApprovalCardsReplaced(db, {
  tripId,
  changeSetId,
  exceptHash = '',
  replacedByHash = '',
  replacedByVersion = 2,
}) {
  const normalizedTripId = cleanText(tripId, 80);
  const normalizedId = cleanText(changeSetId, 80);
  if (!normalizedTripId || !normalizedId) return;
  const skipHash = cleanText(exceptHash, 128);
  const nextHash = cleanText(replacedByHash, 128);
  const nextVersion = Math.max(2, Number(replacedByVersion) || 2);
  try {
    await db`
      update transcript_turns
      set payload = jsonb_set(
        jsonb_set(
          jsonb_set(payload, '{aiApprovalCard,status}', ${JSON.stringify('replaced')}::jsonb, true),
          '{aiApprovalCard,replacedByHash}', ${JSON.stringify(nextHash)}::jsonb, true
        ),
        '{aiApprovalCard,replacedByVersion}', ${JSON.stringify(nextVersion)}::jsonb, true
      )
      where trip_id = ${normalizedTripId}
        and payload->'aiApprovalCard'->>'changeSetId' = ${normalizedId}
        and coalesce(payload->'aiApprovalCard'->>'status', '') = 'pending_approval'
        and coalesce(payload->'aiApprovalCard'->>'previewHash', '') <> ${skipHash}
    `;
  } catch (error) {
    void error;
  }
}

async function syncChatApprovalCardChangeRequests(db, {
  tripId,
  changeSetId,
  previewHash = '',
  changeRequests = [],
}) {
  const normalizedTripId = cleanText(tripId, 80);
  const normalizedId = cleanText(changeSetId, 80);
  if (!normalizedTripId || !normalizedId) return;
  const list = asArray(changeRequests).slice(-6);
  const latest = list.length ? list[list.length - 1] : null;
  const targetHash = cleanText(previewHash, 128);
  try {
    await db`
      update transcript_turns
      set payload = jsonb_set(
        jsonb_set(payload, '{aiApprovalCard,changeRequests}', ${JSON.stringify(list)}::jsonb, true),
        '{aiApprovalCard,latestChangeRequest}', ${JSON.stringify(latest)}::jsonb, true
      )
      where trip_id = ${normalizedTripId}
        and payload->'aiApprovalCard'->>'changeSetId' = ${normalizedId}
        and coalesce(payload->'aiApprovalCard'->>'status', '') = 'pending_approval'
        and (${targetHash} = '' or coalesce(payload->'aiApprovalCard'->>'previewHash', '') = ${targetHash})
    `;
  } catch (error) {
    void error;
  }
}

export async function requestChangesOnPreview(db, {
  tripId,
  changeSetId,
  actorEmail = 'owner',
  actorRole = 'owner',
  note = '',
  previewHash = '',
  now = () => new Date(),
}) {
  await ensureVacationMcpSchema(db);
  const changeSet = await loadScopedChangeSet(db, { changeSetId, scopedTripId: tripId });
  if (changeSet.status !== 'pending_approval') {
    throw Object.assign(
      new Error(`Changes can only be requested on a pending preview (current status: ${changeSet.status}).`),
      { statusCode: 409, code: 'change_set_not_pending' },
    );
  }
  const cleanNote = cleanText(note, 1000);
  if (!cleanNote) {
    throw Object.assign(
      new Error('Please enter a short note describing what to change.'),
      { statusCode: 400, code: 'change_note_required' },
    );
  }
  const preview = asObject(changeSet.preview);
  const storedHash = cleanText(preview.preview_hash, 128);
  const providedHash = cleanText(previewHash, 128);
  if (providedHash && storedHash && providedHash !== storedHash) {
    throw Object.assign(
      new Error('Preview changed since it was loaded. Refresh the preview before requesting changes.'),
      {
        statusCode: 409,
        code: 'preview_hash_mismatch',
        details: { provided_preview_hash: providedHash },
      },
    );
  }
  const currentVersion = extractPreviewVersion(preview);
  const entry = {
    id: crypto.randomUUID(),
    note: cleanNote,
    author_email: cleanText(actorEmail, 180) || null,
    author_role: actorRole === 'owner' ? 'owner' : 'collaborator',
    created_at: now().toISOString(),
    preview_version: currentVersion,
    preview_hash: storedHash || null,
  };
  const nextRequests = [...extractChangeRequests(preview), entry];
  const nextPreview = {
    ...preview,
    preview_version: currentVersion,
    change_requests: nextRequests,
    latest_change_request: entry,
  };
  await db`
    update vacation_mcp_change_sets
    set preview = ${nextPreview},
      review_note = ${cleanNote},
      updated_at = now()
    where id = ${changeSet.id}
  `;
  await syncChatApprovalCardChangeRequests(db, {
    tripId,
    changeSetId: changeSet.id,
    previewHash: storedHash,
    changeRequests: nextRequests,
  });
  return {
    ok: true,
    id: String(changeSet.id),
    status: 'pending_approval',
    previewVersion: currentVersion,
    previewHash: storedHash || null,
    changeRequest: entry,
    changeRequests: nextRequests,
  };
}

export async function loadPendingPreviewsForVacation(db, tripId) {
  const rows = await db`
    select id, kind, apply_mode, status, summary, preview, review_note, committed_at, created_at
    from vacation_mcp_change_sets
    where scope_trip_id = ${tripId}
    order by created_at desc
  `;
  return rows
    .filter((row) => row.status === 'pending_approval' || row.status === 'draft')
    .map((row) => {
      const preview = asObject(row.preview);
      const changeRequests = extractChangeRequests(preview);
      return {
        draft_id: String(row.id),
        kind: String(row.kind || 'draft_import'),
        status: String(row.status || 'draft'),
        preview_version: extractPreviewVersion(preview),
        preview_hash: cleanText(preview.preview_hash, 128) || null,
        summary: String(row.summary || ''),
        review_note: row.review_note || null,
        change_requests: changeRequests,
        latest_change_request: changeRequests.length ? changeRequests[changeRequests.length - 1] : null,
      };
    });
}

export async function revisePendingChangeSet(db, {
  changeSet,
  nextPayload,
  mediaRows = [],
  existingTrip = null,
  existingThings = [],
  appliedChanges = [],
}) {
  const prevPreview = asObject(changeSet.preview);
  const previousPreviewHash = cleanText(prevPreview.preview_hash, 128) || null;
  const nextVersion = extractPreviewVersion(prevPreview) + 1;
  const changeRequests = extractChangeRequests(prevPreview);
  const preview = changeSet.kind === 'targeted_edit'
    ? buildTargetedEditPreview({
      operations: asArray(nextPayload?.operations),
      existingTrip,
      existingThings,
      mediaRows,
      summary: cleanText(nextPayload?.summary || changeSet.summary, 300),
      previewVersion: nextVersion,
      changeRequests,
      lastChanges: appliedChanges,
      removedMediaIds: asArray(nextPayload?.removed_media_ids),
    })
    : buildDraftImportPreview({
      draft: nextPayload,
      mediaRows: mediaRows.filter((row) => String(row.change_set_id || '') === String(changeSet.id)),
      existingTrip,
      existingThings,
      applyMode: changeSet.apply_mode || 'create_new',
      previewVersion: nextVersion,
      changeRequests,
      lastChanges: appliedChanges,
    });
  await db`
    update vacation_mcp_change_sets
    set payload = ${nextPayload},
      preview = ${preview},
      summary = ${preview.summary_text},
      apply_mode = ${changeSet.apply_mode || 'create_new'},
      target_trip_id = ${changeSet.target_trip_id || null},
      updated_at = now()
    where id = ${changeSet.id}
  `;
  return {
    preview,
    previewVersion: nextVersion,
    previousPreviewHash,
  };
}
