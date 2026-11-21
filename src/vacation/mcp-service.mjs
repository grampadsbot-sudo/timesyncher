import { cleanText } from './http.mjs';
import {
  VACATION_IMPORT_EXAMPLE,
  VACATION_IMPORT_FORMAT_SCHEMA,
  validateVacationImportDocument,
} from './mcp-schema.mjs';
import { assertVacationScope, ensureVacationMcpSchema } from './mcp-tokens.mjs';
import { buildDraftImportPreview, buildTargetedEditPreview } from './mcp-preview.mjs';
import { applyApprovedDraftImport, applyApprovedTargetedEdit } from './mcp-apply.mjs';
import { asArray, asObject, readLiveVacationDocument, vacationShareSlugForRow } from './mcp-read.mjs';
import { loadScopedChangeSet, loadTripContext } from './mcp-media-service.mjs';
import { invalidateSharedUpstreamCacheForSlug } from './shared-trip-upstream-cache.mjs';
import { postStagedPreviewToChat, syncApprovalCardStatusInChat } from './mcp-chat-import.mjs';

const WHOLESALE_OVERWRITE_KEYS = new Set([
  'replace_all', 'replace', 'overwrite', 'vacation', 'days',
  'flights', 'hotels', 'cars', 'restaurants', 'stores', 'things_to_do', 'unscheduled_things', 'notes', 'items',
]);

function sanitizeDraftPayload(args) {
  const payload = {};
  for (const key of Object.keys(VACATION_IMPORT_FORMAT_SCHEMA.properties)) {
    if (args[key] !== undefined) payload[key] = args[key];
  }
  return payload;
}

export async function handleDescribeImportFormat(tokenRecord, args = {}) {
  assertVacationScope(tokenRecord, args.vacation_id);
  return {
    ok: true,
    format_version: '1.0',
    schema: VACATION_IMPORT_FORMAT_SCHEMA,
    example: VACATION_IMPORT_EXAMPLE,
    workflow: [
      '1. Call start_import with a vacation JSON payload to create a staged draft.',
      '2. Call upload_media to obtain signed upload URLs, PUT photo or video bytes directly to those URLs, then call upload_media with action="finalize".',
      '3. Call preview_import to review what will be created, what is missing, and any conflicts.',
      '4. Call commit_import to stage the draft as pending approval. Nothing goes live until an owner or collaborator approves in Vacay Keepsake.',
    ],
  };
}

export async function handleStartImport(db, tokenRecord, args = {}) {
  await ensureVacationMcpSchema(db);
  assertVacationScope(tokenRecord, args.vacation_id);
  const draft = sanitizeDraftPayload(args);
  const check = validateVacationImportDocument(draft);
  if (!check.valid) {
    throw Object.assign(
      new Error(`Invalid vacation import payload: ${check.errors.join(' ')}`),
      { statusCode: 400, code: 'invalid_import_payload', details: check.errors },
    );
  }
  const applyMode = args.apply_mode === 'populate_scoped' ? 'populate_scoped' : 'create_new';
  const { trip, things } = await loadTripContext(db, tokenRecord.tripId);
  const existingDraftId = cleanText(args.draft_id, 80);
  if (existingDraftId) {
    const existing = await loadScopedChangeSet(db, { changeSetId: existingDraftId, scopedTripId: tokenRecord.tripId });
    if (existing.status !== 'draft') {
      throw Object.assign(new Error(`Draft can no longer be edited (status: ${existing.status}).`), { statusCode: 409, code: 'change_set_not_editable' });
    }
    const existingMedia = await db`
      select * from vacation_mcp_draft_media
      where scope_trip_id = ${tokenRecord.tripId}
        and change_set_id = ${existing.id}
      order by created_at asc
    `;
    const preview = buildDraftImportPreview({
      draft,
      mediaRows: existingMedia,
      existingTrip: trip,
      existingThings: things,
      applyMode,
    });
    await db`
      update vacation_mcp_change_sets
      set payload = ${draft},
        preview = ${preview},
        summary = ${preview.summary_text},
        apply_mode = ${applyMode},
        target_trip_id = ${applyMode === 'populate_scoped' ? tokenRecord.tripId : null},
        updated_at = now()
      where id = ${existing.id}
    `;
    return {
      ok: true,
      draft_id: String(existing.id),
      status: String(existing.status),
      published: false,
      summary: preview.summary_text,
      counts: preview.counts,
      preview_hash: preview.preview_hash,
    };
  }
  const preview = buildDraftImportPreview({
    draft,
    mediaRows: [],
    existingTrip: trip,
    existingThings: things,
    applyMode,
  });
  const rows = await db`
    insert into vacation_mcp_change_sets (
      scope_trip_id, target_trip_id, token_id, kind, apply_mode, status, summary, payload, preview
    ) values (
      ${tokenRecord.tripId},
      ${applyMode === 'populate_scoped' ? tokenRecord.tripId : null},
      ${tokenRecord.id},
      'draft_import',
      ${applyMode},
      'draft',
      ${preview.summary_text},
      ${draft},
      ${preview}
    )
    returning id, status, created_at
  `;
  return {
    ok: true,
    draft_id: String(rows[0].id),
    status: String(rows[0].status),
    published: false,
    summary: preview.summary_text,
    counts: preview.counts,
    preview_hash: preview.preview_hash,
  };
}

export async function handlePreviewImport(db, tokenRecord, args = {}) {
  await ensureVacationMcpSchema(db);
  assertVacationScope(tokenRecord, args.vacation_id);
  const changeSet = await loadScopedChangeSet(db, { changeSetId: args.draft_id, scopedTripId: tokenRecord.tripId });
  const mediaRows = await db`
    select * from vacation_mcp_draft_media
    where scope_trip_id = ${tokenRecord.tripId}
      and (change_set_id = ${changeSet.id} or change_set_id is null)
    order by created_at asc
  `;
  const { trip, things } = await loadTripContext(db, tokenRecord.tripId);
  const preview = changeSet.kind === 'targeted_edit'
    ? buildTargetedEditPreview({
      operations: changeSet.payload?.operations || [],
      existingTrip: trip,
      existingThings: things,
      mediaRows,
      summary: changeSet.summary,
    })
    : buildDraftImportPreview({
      draft: changeSet.payload,
      mediaRows: mediaRows.filter((row) => String(row.change_set_id || '') === String(changeSet.id)),
      existingTrip: trip,
      existingThings: things,
      applyMode: changeSet.apply_mode,
    });
  await db`
    update vacation_mcp_change_sets
    set preview = ${preview}, summary = ${preview.summary_text}, updated_at = now()
    where id = ${changeSet.id}
  `;
  return {
    ok: true,
    draft_id: String(changeSet.id),
    status: String(changeSet.status),
    published: changeSet.status === 'approved',
    preview_hash: preview.preview_hash,
    preview,
  };
}

export async function handleCommitImport(db, tokenRecord, args = {}) {
  await ensureVacationMcpSchema(db);
  assertVacationScope(tokenRecord, args.vacation_id);
  const changeSet = await loadScopedChangeSet(db, { changeSetId: args.draft_id, scopedTripId: tokenRecord.tripId });
  if (changeSet.status === 'approved' || changeSet.status === 'declined') {
    throw Object.assign(new Error(`Draft has already been ${changeSet.status}.`), { statusCode: 409, code: 'change_set_already_reviewed' });
  }
  const providedHash = cleanText(args.preview_hash, 128);
  if (!providedHash) {
    throw Object.assign(
      new Error('preview_hash is required. Call preview_import first and pass the returned preview_hash.'),
      { statusCode: 400, code: 'preview_hash_required' },
    );
  }
  const previewResult = await handlePreviewImport(db, tokenRecord, { draft_id: changeSet.id });
  const currentHash = String(previewResult.preview?.preview_hash || '');
  if (providedHash !== currentHash) {
    throw Object.assign(
      new Error('Draft changed since preview_import. Call preview_import again and pass the updated preview_hash.'),
      {
        statusCode: 409,
        code: 'preview_hash_mismatch',
        details: { provided_preview_hash: providedHash },
      },
    );
  }
  const note = cleanText(args.note, 500) || null;
  await db`
    update vacation_mcp_change_sets
    set status = 'pending_approval',
      committed_at = now(),
      review_note = ${note},
      updated_at = now()
    where id = ${changeSet.id}
  `;
  await postStagedPreviewToChat(db, {
    tokenRecord,
    changeSetId: changeSet.id,
    kind: changeSet.kind,
    preview: previewResult.preview,
    summary: previewResult.preview?.summary_text || changeSet.summary,
  });
  return {
    ok: true,
    draft_id: String(changeSet.id),
    status: 'pending_approval',
    published: false,
    preview_hash: currentHash,
    message: 'Draft staged as pending approval in Vacay Keepsake. Live vacations remain unchanged until an owner or collaborator approves in the app.',
    preview: previewResult.preview,
  };
}

export async function handleReadVacation(db, tokenRecord, args = {}) {
  await ensureVacationMcpSchema(db);
  const scopedTripId = assertVacationScope(tokenRecord, args.vacation_id);
  const doc = await readLiveVacationDocument(db, scopedTripId);
  if (!doc) throw Object.assign(new Error('Vacation not found.'), { statusCode: 404, code: 'vacation_not_found' });
  return { ok: true, ...doc };
}

export async function handleUpdateVacation(db, tokenRecord, args = {}) {
  await ensureVacationMcpSchema(db);
  const scopedTripId = assertVacationScope(tokenRecord, args.vacation_id);
  for (const key of Object.keys(asObject(args))) {
    if (WHOLESALE_OVERWRITE_KEYS.has(key.toLowerCase())) {
      throw Object.assign(
        new Error('Targeted edits only. Wholesale overwrite of a vacation is not allowed.'),
        { statusCode: 400, code: 'wholesale_overwrite_forbidden' },
      );
    }
  }
  const operations = asArray(args.operations);
  if (!operations.length) {
    throw Object.assign(new Error('At least one targeted edit operation is required.'), { statusCode: 400, code: 'empty_operations' });
  }
  const { trip, things } = await loadTripContext(db, scopedTripId);
  if (!trip) throw Object.assign(new Error('Vacation not found.'), { statusCode: 404, code: 'vacation_not_found' });
  const thingIds = new Set(things.map((row) => String(row.id)));
  for (const op of operations) {
    if (op.op === 'update_item' || op.op === 'remove_item') {
      const targetId = cleanText(op.item_id, 80);
      if (!targetId || !thingIds.has(targetId)) {
        throw Object.assign(
          new Error('Targeted item does not belong to the vacation this AI token is scoped to.'),
          { statusCode: 403, code: 'vacation_scope_mismatch' },
        );
      }
    }
    if (op.op === 'add_item' && !cleanText(op.item?.title, 200)) {
      throw Object.assign(new Error('add_item requires item.title.'), { statusCode: 400, code: 'invalid_operation' });
    }
  }
  const mediaRows = await db`
    select * from vacation_mcp_draft_media
    where scope_trip_id = ${scopedTripId}
    order by created_at asc
  `;
  const preview = buildTargetedEditPreview({
    operations,
    existingTrip: trip,
    existingThings: things,
    mediaRows,
    summary: cleanText(args.summary, 300),
  });
  if (args.dry_run === true) {
    return {
      ok: true,
      dry_run: true,
      published: false,
      preview_hash: preview.preview_hash,
      message: 'Dry-run preview generated. No changes were staged or published.',
      preview,
    };
  }
  const expectedHash = cleanText(args.preview_hash, 128);
  if (expectedHash && expectedHash !== preview.preview_hash) {
    throw Object.assign(
      new Error('Vacation edits changed since dry-run preview. Run update_vacation with dry_run=true again and pass the updated preview_hash.'),
      {
        statusCode: 409,
        code: 'preview_hash_mismatch',
        details: { provided_preview_hash: expectedHash },
      },
    );
  }
  const rows = await db`
    insert into vacation_mcp_change_sets (
      scope_trip_id, target_trip_id, token_id, kind, apply_mode, status, summary, payload, preview, committed_at
    ) values (
      ${scopedTripId}, ${scopedTripId}, ${tokenRecord.id},
      'targeted_edit', 'targeted_edit', 'pending_approval',
      ${preview.summary_text}, ${{ summary: cleanText(args.summary, 300), operations }}, ${preview}, now()
    )
    returning id, status
  `;
  await postStagedPreviewToChat(db, {
    tokenRecord,
    changeSetId: rows[0].id,
    kind: 'targeted_edit',
    preview,
    summary: preview.summary_text,
  });
  return {
    ok: true,
    change_set_id: String(rows[0].id),
    draft_id: String(rows[0].id),
    status: String(rows[0].status),
    published: false,
    preview_hash: preview.preview_hash,
    message: 'Targeted edits staged as pending approval in Vacay Keepsake. Live vacation data is unchanged until approved in the app.',
    preview,
  };
}

export async function listVacationChangeSets(db, { tripId }) {
  await ensureVacationMcpSchema(db);
  const rows = await db`
    select id, scope_trip_id, target_trip_id, published_trip_id, kind, apply_mode, status,
      summary, preview, committed_at, reviewed_at, reviewed_by, review_note, created_at
    from vacation_mcp_change_sets
    where scope_trip_id = ${tripId}
    order by created_at desc
  `;
  return rows.map((row) => {
    const preview = asObject(row.preview);
    return {
      id: String(row.id),
      vacationId: String(row.scope_trip_id),
      publishedVacationId: row.published_trip_id ? String(row.published_trip_id) : null,
      kind: String(row.kind),
      applyMode: String(row.apply_mode),
      status: String(row.status),
      summary: String(row.summary || ''),
      previewHash: preview.preview_hash || null,
      preview,
      committedAt: row.committed_at || null,
      reviewedAt: row.reviewed_at || null,
      reviewedBy: row.reviewed_by || null,
      reviewNote: row.review_note || null,
      createdAt: row.created_at || null,
    };
  });
}

export async function getVacationChangeSetPreview(db, { tripId, changeSetId }) {
  await ensureVacationMcpSchema(db);
  const changeSet = await loadScopedChangeSet(db, { changeSetId, scopedTripId: tripId });
  const preview = asObject(changeSet.preview);
  return {
    id: String(changeSet.id),
    vacationId: String(changeSet.scope_trip_id),
    publishedVacationId: changeSet.published_trip_id ? String(changeSet.published_trip_id) : null,
    kind: String(changeSet.kind),
    applyMode: String(changeSet.apply_mode),
    status: String(changeSet.status),
    summary: String(changeSet.summary || ''),
    previewHash: preview.preview_hash || null,
    preview,
    committedAt: changeSet.committed_at || null,
    reviewedAt: changeSet.reviewed_at || null,
    reviewedBy: changeSet.reviewed_by || null,
    reviewNote: changeSet.review_note || null,
    createdAt: changeSet.created_at || null,
  };
}

export async function approveVacationChangeSet(db, {
  tripId,
  changeSetId,
  actorEmail = 'owner',
  actorRole = 'owner',
  previewHash = '',
}) {
  await ensureVacationMcpSchema(db);
  const changeSet = await loadScopedChangeSet(db, { changeSetId, scopedTripId: tripId });
  if (changeSet.status !== 'pending_approval') {
    throw Object.assign(
      new Error(`Only pending_approval change sets can be approved (current status: ${changeSet.status}).`),
      { statusCode: 409, code: 'change_set_not_pending' },
    );
  }
  const providedHash = cleanText(previewHash, 128);
  const storedHash = cleanText(asObject(changeSet.preview).preview_hash, 128);
  if (providedHash && storedHash && providedHash !== storedHash) {
    throw Object.assign(
      new Error('Preview changed since it was loaded. Refresh the preview before approving.'),
      {
        statusCode: 409,
        code: 'preview_hash_mismatch',
        details: { provided_preview_hash: providedHash },
      },
    );
  }
  const mediaRows = await db`
    select * from vacation_mcp_draft_media
    where scope_trip_id = ${tripId}
    order by created_at asc
  `;
  const result = changeSet.kind === 'targeted_edit'
    ? await applyApprovedTargetedEdit(db, { changeSet, mediaRows })
    : await applyApprovedDraftImport(db, {
      changeSet,
      mediaRows: mediaRows.filter((row) => String(row.change_set_id || '') === String(changeSet.id)),
    });
  const reviewer = cleanText(`${actorRole}:${actorEmail}`, 180) || 'owner';
  await db`
    update vacation_mcp_change_sets
    set status = 'approved',
      published_trip_id = ${result.publishedTripId},
      reviewed_at = now(),
      reviewed_by = ${reviewer},
      updated_at = now()
    where id = ${changeSet.id}
  `;
  if (result.shareSlug) invalidateSharedUpstreamCacheForSlug(result.shareSlug);
  const scopeRows = await db`select id, metadata from trips where id = ${tripId} limit 1`;
  const scopeSlug = scopeRows[0] ? vacationShareSlugForRow(scopeRows[0]) : '';
  if (scopeSlug && scopeSlug !== result.shareSlug) invalidateSharedUpstreamCacheForSlug(scopeSlug);
  await syncApprovalCardStatusInChat(db, { tripId, changeSetId: changeSet.id, status: 'approved' });
  return {
    ok: true,
    id: String(changeSet.id),
    status: 'approved',
    publishedVacationId: String(result.publishedTripId),
    shareSlug: result.shareSlug,
    result,
  };
}

export async function declineVacationChangeSet(db, { tripId, changeSetId, actorEmail = 'owner', actorRole = 'owner', reason = '' }) {
  await ensureVacationMcpSchema(db);
  const changeSet = await loadScopedChangeSet(db, { changeSetId, scopedTripId: tripId });
  if (changeSet.status !== 'pending_approval' && changeSet.status !== 'draft') {
    throw Object.assign(
      new Error(`Change set has already been ${changeSet.status}.`),
      { statusCode: 409, code: 'change_set_already_reviewed' },
    );
  }
  const reviewer = cleanText(`${actorRole}:${actorEmail}`, 180) || 'owner';
  const reviewNote = cleanText(reason, 500) || null;
  await db`
    update vacation_mcp_change_sets
    set status = 'declined',
      reviewed_at = now(),
      reviewed_by = ${reviewer},
      review_note = ${reviewNote},
      updated_at = now()
    where id = ${changeSet.id}
  `;
  await syncApprovalCardStatusInChat(db, { tripId, changeSetId: changeSet.id, status: 'declined' });
  return { ok: true, id: String(changeSet.id), status: 'declined', reviewedBy: reviewer };
}
