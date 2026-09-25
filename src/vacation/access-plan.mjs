import { createCollaboratorInvite, collaboratorPlan, markCollaboratorInvitePaid } from './collaborators.mjs';
import { queueOrSendCollaboratorInviteEmail, queueOrSendWebEditorInviteEmail } from './email.mjs';
import { ownerMediaAddOns, recordOwnerMediaPurchase } from './media-checkout.mjs';
import { createWebEditorInvite } from './web-access.mjs';

const CURRENCY = process.env.TIMESYNCHER_CHECKOUT_CURRENCY || 'usd';
const COLLABORATOR_PHOTO_SINGLE_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_COLLABORATOR_PHOTO_SINGLE_PRICE_CENTS || '500', 10);
const COLLABORATOR_PHOTO_UNLIMITED_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_COLLABORATOR_PHOTO_UNLIMITED_PRICE_CENTS || '900', 10);
const COLLABORATOR_VIDEO_SINGLE_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_COLLABORATOR_VIDEO_SINGLE_PRICE_CENTS || '1700', 10);
const COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS || '2700', 10);

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function email(value) {
  return clean(value, 180).toLowerCase();
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function roleOf(row = {}) {
  const role = clean(row.role || row.accessRole || row.kind, 80);
  if (role === 'owner_media' || role === 'owner') return 'owner_media';
  if (role === 'collaborator' || role === 'telegram_collaborator' || bool(row.canTextOrVoice) || bool(row.can_text_or_voice)) return 'telegram_collaborator';
  if (role === 'web_editor' || role === 'editor' || bool(row.canEditSite) || bool(row.can_edit_site)) return 'web_editor';
  return 'viewer';
}

function planCode(row = {}) {
  return clean(row.planCode || row.plan || row.scope || 'single_trip', 100);
}

function displayName(row = {}) {
  return clean(row.name || row.displayName || row.display_name || [row.firstName, row.lastName].filter(Boolean).join(' '), 180);
}

function payerEmail(row = {}, fallback = {}) {
  return email(row.payerEmail || row.payer_email || row.payer?.email || fallback.email || row.email);
}

function payerName(row = {}, fallback = {}) {
  return clean(row.payerName || row.payer_name || row.payer?.name || fallback.name || displayName(row), 180);
}

export async function ensureAccessPlanSchema(db) {
  await db`
    create table if not exists vacation_access_plan_rows (
      id uuid primary key default gen_random_uuid(),
      owner_customer_id uuid not null references customers(id) on delete cascade,
      trip_id uuid references trips(id) on delete cascade,
      onboarding_session_id uuid references onboarding_sessions(id) on delete set null,
      name text,
      email text,
      role text not null,
      can_edit_site boolean not null default false,
      can_text_or_voice boolean not null default false,
      can_upload_photos boolean not null default false,
      can_upload_videos boolean not null default false,
      payer_name text,
      payer_email text,
      checkout_status text not null default 'not_required',
      invite_status text not null default 'not_required',
      checkout_group_id uuid,
      collaborator_invite_id uuid references vacation_collaborator_invites(id) on delete set null,
      web_access_grant_id uuid references vacation_web_access_grants(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (role in ('viewer', 'web_editor', 'telegram_collaborator', 'owner_media')),
      check (checkout_status in ('not_required', 'pending', 'paid', 'cancelled', 'failed')),
      check (invite_status in ('not_required', 'pending', 'sent', 'accepted', 'failed'))
    )
  `;
  await db`
    create table if not exists vacation_access_plan_checkouts (
      id uuid primary key default gen_random_uuid(),
      owner_customer_id uuid not null references customers(id) on delete cascade,
      trip_id uuid references trips(id) on delete cascade,
      payer_name text,
      payer_email text,
      status text not null default 'pending',
      amount_cents integer not null default 0,
      currency text not null default 'usd',
      stripe_payment_intent_id text unique,
      line_items jsonb not null default '[]'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      paid_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (status in ('pending', 'paid', 'cancelled', 'failed'))
    )
  `;
  await db`create index if not exists idx_vacation_access_plan_rows_trip on vacation_access_plan_rows(trip_id, created_at)`;
  await db`create index if not exists idx_vacation_access_plan_rows_checkout on vacation_access_plan_rows(checkout_group_id)`;
}

export function normalizeAccessPlanRow(row = {}, fallback = {}) {
  const role = roleOf(row);
  const rowEmail = email(row.email || row.contact?.email);
  const photos = bool(row.canUploadPhotos ?? row.can_upload_photos ?? row.photoUpload ?? row.photo_upload ?? row.photoMemories);
  const videos = bool(row.canUploadVideos ?? row.can_upload_videos ?? row.videoUpload ?? row.video_upload ?? row.videoMemories);
  const canText = role === 'telegram_collaborator';
  const canEdit = role === 'web_editor' || role === 'telegram_collaborator' || role === 'owner_media';
  return {
    name: displayName(row) || rowEmail,
    email: rowEmail || null,
    role,
    canEditSite: canEdit,
    canTextOrVoice: canText,
    canUploadPhotos: photos,
    canUploadVideos: videos,
    payerName: payerName(row, fallback) || null,
    payerEmail: payerEmail(row, fallback) || rowEmail || null,
    planCode: planCode(row),
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  };
}

export function priceAccessPlanRow(row = {}, env = process.env) {
  const normalized = normalizeAccessPlanRow(row);
  if (normalized.role === 'telegram_collaborator') {
    const plan = collaboratorPlan(normalized.planCode);
    const unlimited = plan.scope === 'unlimited_trips';
    const photoAmountCents = normalized.canUploadPhotos ? (unlimited ? COLLABORATOR_PHOTO_UNLIMITED_PRICE_CENTS : COLLABORATOR_PHOTO_SINGLE_PRICE_CENTS) : 0;
    const videoAmountCents = normalized.canUploadVideos ? (unlimited ? COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS : COLLABORATOR_VIDEO_SINGLE_PRICE_CENTS) : 0;
    return {
      role: normalized.role,
      amountCents: plan.amountCents + photoAmountCents + videoAmountCents,
      currency: CURRENCY,
      label: normalized.name ? `${normalized.name} - Telegram collaborator` : 'Telegram collaborator',
      planCode: plan.code,
      scope: plan.scope,
      photoAmountCents,
      videoAmountCents,
    };
  }
  if (normalized.role === 'owner_media') {
    const addOns = ownerMediaAddOns({
      mediaScope: normalized.planCode,
      photoUpload: normalized.canUploadPhotos,
      videoUpload: normalized.canUploadVideos,
    });
    return {
      role: normalized.role,
      amountCents: addOns.amountCents,
      currency: CURRENCY,
      label: normalized.name ? `${normalized.name} - owner media uploads` : 'Owner media uploads',
      planCode: addOns.plan,
      scope: addOns.scope,
      photoAmountCents: addOns.photoAmountCents,
      videoAmountCents: addOns.videoAmountCents,
    };
  }
  return {
    role: normalized.role,
    amountCents: 0,
    currency: CURRENCY,
    label: normalized.role === 'web_editor' ? 'Website editor invite' : 'Viewer access',
    planCode: 'free',
    scope: 'single_trip',
    photoAmountCents: 0,
    videoAmountCents: 0,
  };
}

function publicRow(row) {
  return {
    id: row.id,
    ownerCustomerId: row.owner_customer_id,
    tripId: row.trip_id,
    onboardingSessionId: row.onboarding_session_id,
    name: row.name,
    email: row.email,
    role: row.role,
    canEditSite: row.can_edit_site,
    canTextOrVoice: row.can_text_or_voice,
    canUploadPhotos: row.can_upload_photos,
    canUploadVideos: row.can_upload_videos,
    payerName: row.payer_name,
    payerEmail: row.payer_email,
    checkoutStatus: row.checkout_status,
    inviteStatus: row.invite_status,
    checkoutGroupId: row.checkout_group_id,
    collaboratorInviteId: row.collaborator_invite_id,
    webAccessGrantId: row.web_access_grant_id,
    metadata: row.metadata || {},
  };
}

export async function saveAccessPlan({ db, ownerCustomerId, tripId, onboardingSessionId = null, rows = [], payer = {}, replace = false, env = process.env }) {
  await ensureAccessPlanSchema(db);
  const ownerId = clean(ownerCustomerId, 80);
  const normalizedTripId = clean(tripId, 80);
  const normalizedSessionId = clean(onboardingSessionId, 80) || null;
  if (!ownerId) throw Object.assign(new Error('ownerCustomerId is required.'), { statusCode: 400 });
  if (!normalizedTripId) throw Object.assign(new Error('tripId is required.'), { statusCode: 400 });
  if (!Array.isArray(rows) || rows.length === 0) throw Object.assign(new Error('accessPlan rows are required.'), { statusCode: 400 });
  if (replace) {
    await db`
      update vacation_access_plan_rows
      set metadata = metadata || ${{ replacedAt: new Date().toISOString() }},
        updated_at = now()
      where owner_customer_id = ${ownerId}
        and trip_id = ${normalizedTripId}
        and checkout_status in ('not_required', 'pending')
        and invite_status in ('not_required', 'pending')
    `;
    await db`
      delete from vacation_access_plan_rows
      where owner_customer_id = ${ownerId}
        and trip_id = ${normalizedTripId}
        and checkout_status in ('not_required', 'pending')
        and invite_status in ('not_required', 'pending')
    `;
  }
  const saved = [];
  for (const rawRow of rows) {
    const row = normalizeAccessPlanRow(rawRow, payer);
    const price = priceAccessPlanRow(row, env);
    if ((row.role === 'web_editor' || row.role === 'telegram_collaborator') && !row.email) {
      throw Object.assign(new Error(`${row.role} requires an email.`), { statusCode: 400 });
    }
    const checkoutStatus = price.amountCents > 0 ? 'pending' : 'not_required';
    const inviteStatus = row.role === 'viewer' && !row.email ? 'not_required' : 'pending';
    const inserted = await db`
      insert into vacation_access_plan_rows (
        owner_customer_id, trip_id, onboarding_session_id, name, email, role,
        can_edit_site, can_text_or_voice, can_upload_photos, can_upload_videos,
        payer_name, payer_email, checkout_status, invite_status, metadata
      )
      values (
        ${ownerId}, ${normalizedTripId}, ${normalizedSessionId}, ${row.name || null}, ${row.email},
        ${row.role}, ${row.canEditSite}, ${row.canTextOrVoice}, ${row.canUploadPhotos}, ${row.canUploadVideos},
        ${row.payerName}, ${row.payerEmail}, ${checkoutStatus}, ${inviteStatus},
        ${{
          ...row.metadata,
          planCode: price.planCode,
          scope: price.scope,
          amountCents: price.amountCents,
          currency: price.currency,
          photoAmountCents: price.photoAmountCents,
          videoAmountCents: price.videoAmountCents,
        }}
      )
      returning *
    `;
    saved.push(publicRow(inserted[0]));
  }
  await db`
    update trips
    set metadata = metadata || ${{
      accessPlanUpdatedAt: new Date().toISOString(),
      accessPlanRowCount: saved.length,
    }},
      updated_at = now()
    where id = ${normalizedTripId}
  `;
  return { ok: true, rows: saved };
}

export async function listAccessPlan({ db, ownerCustomerId = '', tripId = '', checkoutId = '' }) {
  await ensureAccessPlanSchema(db);
  const byCheckout = clean(checkoutId, 80);
  const rows = byCheckout ? await db`
    select * from vacation_access_plan_rows where checkout_group_id = ${byCheckout} order by created_at asc
  ` : await db`
    select *
    from vacation_access_plan_rows
    where (${clean(ownerCustomerId, 80) || null}::uuid is null or owner_customer_id = ${clean(ownerCustomerId, 80) || null})
      and (${clean(tripId, 80) || null}::uuid is null or trip_id = ${clean(tripId, 80) || null})
    order by created_at asc
  `;
  return { ok: true, rows: rows.map(publicRow) };
}

function checkoutUrl(checkoutId, env = process.env) {
  const base = String(env.TIMESYNCHER_SITE_BASE_URL || env.SITE_BASE_URL || 'https://www.timesyncher.com').replace(/\/+$/, '');
  return `${base}/access-checkout.html?checkout=${encodeURIComponent(checkoutId)}`;
}

export async function createAccessPlanCheckout({ db, ownerCustomerId, tripId, payerEmail: requestedPayerEmail = '', payerName: requestedPayerName = '', rowIds = [], env = process.env }) {
  await ensureAccessPlanSchema(db);
  const ownerId = clean(ownerCustomerId, 80);
  const normalizedTripId = clean(tripId, 80);
  const requestedEmail = email(requestedPayerEmail);
  const requestedIds = Array.isArray(rowIds) ? rowIds.map((id) => clean(id, 80)).filter(Boolean) : [];
  const rows = requestedIds.length ? await db`
    select * from vacation_access_plan_rows
    where owner_customer_id = ${ownerId}
      and trip_id = ${normalizedTripId}
      and id::text = any(${requestedIds})
      and checkout_status = 'pending'
    order by created_at asc
  ` : await db`
    select * from vacation_access_plan_rows
    where owner_customer_id = ${ownerId}
      and trip_id = ${normalizedTripId}
      and lower(coalesce(payer_email, email, '')) = ${requestedEmail}
      and checkout_status = 'pending'
    order by created_at asc
  `;
  if (!rows.length) throw Object.assign(new Error('No pending paid access-plan rows found for this payer.'), { statusCode: 404 });
  const lineItems = rows.map((row) => {
    const price = priceAccessPlanRow({
      ...row,
      planCode: row.metadata?.planCode,
      canUploadPhotos: row.can_upload_photos,
      canUploadVideos: row.can_upload_videos,
      canTextOrVoice: row.can_text_or_voice,
      canEditSite: row.can_edit_site,
    }, env);
    return {
      rowId: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      label: price.label,
      amountCents: price.amountCents,
      currency: price.currency,
      planCode: price.planCode,
      scope: price.scope,
    };
  }).filter((item) => item.amountCents > 0);
  const amountCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);
  if (amountCents < 50) throw Object.assign(new Error('This payer has no paid upgrades.'), { statusCode: 400 });
  const payer = {
    email: requestedEmail || email(rows[0].payer_email || rows[0].email),
    name: clean(requestedPayerName || rows[0].payer_name || rows[0].name, 180),
  };
  const inserted = await db`
    insert into vacation_access_plan_checkouts (
      owner_customer_id, trip_id, payer_name, payer_email, amount_cents, currency, line_items, metadata
    )
    values (
      ${ownerId}, ${normalizedTripId}, ${payer.name || null}, ${payer.email || null},
      ${amountCents}, ${CURRENCY}, ${lineItems},
      ${{
        source: 'access_plan_grouped_checkout',
        rowIds: lineItems.map((item) => item.rowId),
      }}
    )
    returning *
  `;
  await db`
    update vacation_access_plan_rows
    set checkout_group_id = ${inserted[0].id}, updated_at = now()
    where id::text = any(${lineItems.map((item) => item.rowId)})
  `;
  return {
    ok: true,
    checkout: {
      id: inserted[0].id,
      status: inserted[0].status,
      payer,
      amountCents,
      currency: CURRENCY,
      lineItems,
      checkoutUrl: checkoutUrl(inserted[0].id, env),
    },
  };
}

export async function loadAccessPlanCheckout(db, checkoutId) {
  await ensureAccessPlanSchema(db);
  const rows = await db`
    select
      c.*,
      t.title as trip_title,
      owner.email as owner_email,
      owner.display_name as owner_display_name
    from vacation_access_plan_checkouts c
    left join trips t on t.id = c.trip_id
    left join customers owner on owner.id = c.owner_customer_id
    where c.id = ${clean(checkoutId, 80)}
    limit 1
  `;
  if (!rows[0]) throw Object.assign(new Error('Access-plan checkout not found.'), { statusCode: 404 });
  const planRows = await db`select * from vacation_access_plan_rows where checkout_group_id = ${rows[0].id} order by created_at asc`;
  return {
    ...rows[0],
    accessPlanRows: planRows,
  };
}

export function publicAccessPlanCheckout(checkout) {
  return {
    id: checkout.id,
    status: checkout.status,
    amountCents: checkout.amount_cents,
    currency: checkout.currency,
    payerName: checkout.payer_name,
    payerEmail: checkout.payer_email,
    tripTitle: checkout.trip_title,
    ownerDisplayName: checkout.owner_display_name,
    lineItems: checkout.line_items || [],
    rows: (checkout.accessPlanRows || []).map(publicRow),
  };
}

export async function markAccessPlanCheckoutPaymentIntent(db, checkoutId, paymentIntentId) {
  await db`
    update vacation_access_plan_checkouts
    set stripe_payment_intent_id = ${paymentIntentId}, updated_at = now()
    where id = ${clean(checkoutId, 80)}
  `;
}

async function activateFreeRow({ db, row, env }) {
  if (row.role === 'viewer' && !row.email) {
    const rows = await db`
      update vacation_access_plan_rows
      set checkout_status = 'not_required', invite_status = 'not_required', updated_at = now()
      where id = ${row.id}
      returning *
    `;
    return { row: publicRow(rows[0]), action: 'viewer_url_only' };
  }
  if (row.role === 'viewer' || row.role === 'web_editor') {
    const invite = await createWebEditorInvite(db, {
      ownerCustomerId: row.owner_customer_id,
      tripId: row.trip_id,
      email: row.email,
      displayName: row.name || row.email,
      role: row.role,
      metadata: {
        source: 'access_plan_free_invite',
        accessPlanRowId: row.id,
      },
      env,
    });
    const emailResult = await queueOrSendWebEditorInviteEmail(db, invite, env);
    const rows = await db`
      update vacation_access_plan_rows
      set checkout_status = 'not_required',
        invite_status = 'sent',
        web_access_grant_id = ${invite.grant.id},
        metadata = metadata || ${{ emailStatus: emailResult.status || null }},
        updated_at = now()
      where id = ${row.id}
      returning *
    `;
    return { row: publicRow(rows[0]), action: `${row.role}_invite_sent`, email: emailResult };
  }
  return { row: publicRow(row), action: 'paid_row_waiting' };
}

export async function activateFreeAccessPlanRows({ db, ownerCustomerId, tripId, env = process.env }) {
  await ensureAccessPlanSchema(db);
  const rows = await db`
    select *
    from vacation_access_plan_rows
    where owner_customer_id = ${clean(ownerCustomerId, 80)}
      and trip_id = ${clean(tripId, 80)}
      and checkout_status = 'not_required'
      and invite_status = 'pending'
    order by created_at asc
  `;
  const activated = [];
  for (const row of rows) activated.push(await activateFreeRow({ db, row, env }));
  return { ok: true, activated };
}

async function activatePaidRow({ db, row, checkout, paymentIntentId = '', env }) {
  if (row.invite_status === 'sent' || row.invite_status === 'accepted') return { row: publicRow(row), action: 'already_activated' };
  if (row.role === 'telegram_collaborator') {
    const plan = collaboratorPlan(row.metadata?.planCode || 'single_trip');
    const created = await createCollaboratorInvite(db, {
      ownerCustomerId: row.owner_customer_id,
      tripId: row.trip_id,
      planCode: plan.code,
      requestedFor: row.name || row.email,
      metadata: {
        source: 'access_plan_grouped_checkout',
        accessPlanRowId: row.id,
        accessPlanCheckoutId: checkout.id,
        photoUpload: row.can_upload_photos,
        videoUpload: row.can_upload_videos,
      },
      env,
    });
    const invite = await markCollaboratorInvitePaid(db, {
      inviteId: created.invite.id,
      env,
      metadata: {
        paidVia: 'access_plan_grouped_checkout',
        accessPlanCheckoutId: checkout.id,
        stripePaymentIntentId: paymentIntentId || checkout.stripe_payment_intent_id || null,
      },
    });
    const emailResult = await queueOrSendCollaboratorInviteEmail(db, {
      invite,
      token: created.token,
      contact: {
        email: row.email,
        displayName: row.name || row.email,
      },
    }, env);
    const updated = await db`
      update vacation_access_plan_rows
      set checkout_status = 'paid',
        invite_status = 'sent',
        collaborator_invite_id = ${invite.id},
        metadata = metadata || ${{ emailStatus: emailResult.status || null }},
        updated_at = now()
      where id = ${row.id}
      returning *
    `;
    return { row: publicRow(updated[0]), action: 'collaborator_invite_sent', email: emailResult };
  }
  if (row.role === 'owner_media') {
    const addOns = ownerMediaAddOns({
      mediaScope: row.metadata?.scope || row.metadata?.planCode,
      photoUpload: row.can_upload_photos,
      videoUpload: row.can_upload_videos,
    });
    const purchase = await recordOwnerMediaPurchase({
      db,
      contact: {
        email: row.email || checkout.payer_email,
        displayName: row.name || checkout.payer_name || row.email || checkout.payer_email,
      },
      addOns,
      amountCents: addOns.amountCents,
      currency: checkout.currency || CURRENCY,
      status: 'paid',
      stripePaymentIntentId: paymentIntentId || checkout.stripe_payment_intent_id || null,
      metadata: {
        paidVia: 'access_plan_grouped_checkout',
        accessPlanCheckoutId: checkout.id,
        accessPlanRowId: row.id,
      },
    });
    const updated = await db`
      update vacation_access_plan_rows
      set checkout_status = 'paid',
        invite_status = 'not_required',
        metadata = metadata || ${{ ownerMediaOrderId: purchase.orderId || null, ownerMediaEntitlementId: purchase.entitlementId || null }},
        updated_at = now()
      where id = ${row.id}
      returning *
    `;
    return { row: publicRow(updated[0]), action: 'owner_media_entitlement_active', purchase };
  }
  return activateFreeRow({ db, row, env });
}

export async function activateAccessPlanCheckout({ db, checkoutId, paymentIntentId = '', env = process.env }) {
  const checkout = await loadAccessPlanCheckout(db, checkoutId);
  if (checkout.status === 'paid') {
    return { ok: true, status: 'already_paid', checkout: publicAccessPlanCheckout(checkout), activated: [] };
  }
  const activated = [];
  for (const row of checkout.accessPlanRows || []) {
    activated.push(await activatePaidRow({ db, row, checkout, paymentIntentId, env }));
  }
  const paid = await db`
    update vacation_access_plan_checkouts
    set status = 'paid',
      stripe_payment_intent_id = coalesce(stripe_payment_intent_id, ${paymentIntentId || null}),
      paid_at = coalesce(paid_at, now()),
      updated_at = now()
    where id = ${checkout.id}
    returning *
  `;
  return {
    ok: true,
    status: 'paid',
    checkout: publicAccessPlanCheckout({ ...checkout, ...paid[0] }),
    activated,
  };
}
