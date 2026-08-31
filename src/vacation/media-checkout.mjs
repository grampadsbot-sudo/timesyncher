import { cleanText, upsertCustomer } from './onboarding.mjs';

const PHOTO_SINGLE_CENTS = Number.parseInt(process.env.TIMESYNCHER_OWNER_PHOTO_SINGLE_PRICE_CENTS || process.env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_CENTS || '500', 10);
const PHOTO_UNLIMITED_CENTS = Number.parseInt(process.env.TIMESYNCHER_OWNER_PHOTO_UNLIMITED_PRICE_CENTS || process.env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS || '900', 10);
const VIDEO_SINGLE_CENTS = Number.parseInt(process.env.TIMESYNCHER_OWNER_VIDEO_SINGLE_PRICE_CENTS || '1700', 10);
const VIDEO_UNLIMITED_CENTS = Number.parseInt(process.env.TIMESYNCHER_OWNER_VIDEO_UNLIMITED_PRICE_CENTS || '2700', 10);
const ACCOUNT_UPGRADE_UNLIMITED_CENTS = Number.parseInt(process.env.TIMESYNCHER_ACCOUNT_UPGRADE_UNLIMITED_PRICE_CENTS || process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS || '2700', 10);

export function accountUpgradeAddOns(body = {}) {
  const selected = body.accountUpgrade || body.upgrade || body.mediaAddOns || body;
  const includePhoto = Boolean(selected.photoUpload || selected.photo_upload || selected.photoMemories);
  const includeVideo = Boolean(selected.videoUpload || selected.video_upload || selected.videoMemories);
  const photoAmountCents = includePhoto ? PHOTO_UNLIMITED_CENTS : 0;
  const videoAmountCents = includeVideo ? VIDEO_UNLIMITED_CENTS : 0;
  const upgradeAmountCents = ACCOUNT_UPGRADE_UNLIMITED_CENTS;
  return {
    scope: 'unlimited_trips',
    plan: 'unlimited',
    product: 'timesyncher_vacation_account_upgrade',
    photoUpload: includePhoto,
    videoUpload: includeVideo,
    upgradeAmountCents,
    photoAmountCents,
    videoAmountCents,
    mediaAmountCents: photoAmountCents + videoAmountCents,
    amountCents: upgradeAmountCents + photoAmountCents + videoAmountCents,
  };
}

export function requireAccountUpgrade(body = {}) {
  const upgrade = accountUpgradeAddOns(body);
  if (!Number.isFinite(upgrade.amountCents) || upgrade.amountCents < 50) {
    throw Object.assign(new Error('Invalid account upgrade amount.'), { statusCode: 400 });
  }
  return upgrade;
}

export function accountUpgradeMetadata(upgrade, extra = {}) {
  return {
    product: 'timesyncher_vacation_account_upgrade',
    plan: 'unlimited',
    account_upgrade: 'unlimited',
    scope: 'unlimited_trips',
    media_scope: 'unlimited_trips',
    photo_memories: String(upgrade.photoUpload),
    video_memories: String(upgrade.videoUpload),
    media_uploads: String(upgrade.photoUpload || upgrade.videoUpload),
    media_memories: String(upgrade.photoUpload || upgrade.videoUpload),
    upgradeAmountCents: upgrade.upgradeAmountCents,
    photoAmountCents: upgrade.photoAmountCents,
    videoAmountCents: upgrade.videoAmountCents,
    mediaAmountCents: upgrade.mediaAmountCents,
    totalAmountCents: upgrade.amountCents,
    noEulaRequired: true,
    noPlaceholderTrip: true,
    ...extra,
  };
}

export async function recordAccountUpgradePurchase({ db, contact, upgrade, amountCents = upgrade?.amountCents || 0, currency = 'usd', status = 'paid', stripeCustomerId = null, stripePaymentIntentId = null, metadata = {} }) {
  const cleanContact = {
    email: cleanText(contact?.email, 180).toLowerCase() || null,
    phone: cleanText(contact?.phone, 80) || null,
    firstName: cleanText(contact?.firstName, 80) || null,
    lastName: cleanText(contact?.lastName, 80) || null,
    displayName: cleanText(contact?.displayName || [contact?.firstName, contact?.lastName].filter(Boolean).join(' '), 180) || cleanText(contact?.email, 180) || null,
  };
  const orderMetadata = accountUpgradeMetadata(upgrade, metadata);
  const customerId = await upsertCustomer(db, cleanContact, orderMetadata);
  const entitlementRows = await db`
    insert into entitlements (
      customer_id, trip_id, stripe_customer_id, stripe_payment_intent_id,
      plan, status, metadata, updated_at
    )
    values (
      ${customerId}, null, ${stripeCustomerId}, ${stripePaymentIntentId},
      'unlimited', 'active', ${orderMetadata}, now()
    )
    returning id
  `;
  const existing = stripePaymentIntentId
    ? await db`select id from paid_orders where stripe_payment_intent_id = ${stripePaymentIntentId} limit 1`
    : [];
  const orderRows = existing[0] ? existing : await db`
    insert into paid_orders (
      customer_id, trip_id, entitlement_id, stripe_customer_id, stripe_payment_intent_id,
      amount_cents, currency, plan, status, contact, metadata, paid_at, updated_at
    )
    values (
      ${customerId}, null, ${entitlementRows[0].id}, ${stripeCustomerId}, ${stripePaymentIntentId},
      ${amountCents}, ${currency}, 'unlimited', ${status}, ${cleanContact}, ${orderMetadata}, now(), now()
    )
    returning id
  `;
  return {
    ok: true,
    customerId,
    entitlementId: entitlementRows[0].id,
    orderId: orderRows[0].id,
    amountCents,
    currency,
    plan: 'unlimited',
    scope: 'unlimited_trips',
    accountUpgrade: upgrade,
  };
}

export function ownerMediaScope(value = 'single_trip') {
  return value === 'unlimited_trips' || value === 'unlimited' ? 'unlimited_trips' : 'single_trip';
}

export function ownerMediaAddOns(body = {}) {
  const selected = body.mediaAddOns && typeof body.mediaAddOns === 'object' ? body.mediaAddOns : body;
  const scope = ownerMediaScope(body.mediaScope || body.scope || body.planScope || selected.mediaScope || selected.scope);
  const unlimited = scope === 'unlimited_trips';
  const photoUpload = Boolean(selected.photoUpload || selected.photo_upload || selected.photoMemories);
  const videoUpload = Boolean(selected.videoUpload || selected.video_upload || selected.videoMemories);
  const photoAmountCents = photoUpload ? (unlimited ? PHOTO_UNLIMITED_CENTS : PHOTO_SINGLE_CENTS) : 0;
  const videoAmountCents = videoUpload ? (unlimited ? VIDEO_UNLIMITED_CENTS : VIDEO_SINGLE_CENTS) : 0;
  return {
    scope,
    plan: unlimited ? 'owner_media_unlimited_vacations' : 'owner_media_single_vacation',
    photoUpload,
    videoUpload,
    photoAmountCents,
    videoAmountCents,
    amountCents: photoAmountCents + videoAmountCents,
  };
}

export function requireOwnerMediaAddOns(body = {}) {
  const addOns = ownerMediaAddOns(body);
  if (!addOns.photoUpload && !addOns.videoUpload) {
    throw Object.assign(new Error('Choose photo upload access, video upload access, or both.'), { statusCode: 400 });
  }
  if (!Number.isFinite(addOns.amountCents) || addOns.amountCents < 50) {
    throw Object.assign(new Error('Invalid owner media add-on amount.'), { statusCode: 400 });
  }
  return addOns;
}

export function ownerMediaMetadata(addOns, extra = {}) {
  return {
    product: 'timesyncher_vacation_owner_media_addons',
    plan: addOns.plan,
    media_scope: addOns.scope,
    photo_memories: String(addOns.photoUpload),
    video_memories: String(addOns.videoUpload),
    media_uploads: String(addOns.photoUpload || addOns.videoUpload),
    media_memories: String(addOns.photoUpload || addOns.videoUpload),
    photoAmountCents: addOns.photoAmountCents,
    videoAmountCents: addOns.videoAmountCents,
    totalAmountCents: addOns.amountCents,
    ...extra,
  };
}

export async function recordOwnerMediaPurchase({ db, contact, addOns, amountCents = addOns?.amountCents || 0, currency = 'usd', status = 'paid', stripeCustomerId = null, stripePaymentIntentId = null, metadata = {} }) {
  const cleanContact = {
    email: cleanText(contact?.email, 180).toLowerCase() || null,
    phone: cleanText(contact?.phone, 80) || null,
    firstName: cleanText(contact?.firstName, 80) || null,
    lastName: cleanText(contact?.lastName, 80) || null,
    displayName: cleanText(contact?.displayName || [contact?.firstName, contact?.lastName].filter(Boolean).join(' '), 180) || cleanText(contact?.email, 180) || null,
  };
  const orderMetadata = ownerMediaMetadata(addOns, metadata);
  const customerId = await upsertCustomer(db, cleanContact, orderMetadata);
  const entitlementRows = await db`
    insert into entitlements (
      customer_id, trip_id, stripe_customer_id, stripe_payment_intent_id,
      plan, status, metadata, updated_at
    )
    values (
      ${customerId}, null, ${stripeCustomerId}, ${stripePaymentIntentId},
      ${addOns.plan}, 'active', ${orderMetadata}, now()
    )
    returning id
  `;
  const existing = stripePaymentIntentId
    ? await db`select id from paid_orders where stripe_payment_intent_id = ${stripePaymentIntentId} limit 1`
    : [];
  const orderRows = existing[0] ? existing : await db`
    insert into paid_orders (
      customer_id, trip_id, entitlement_id, stripe_customer_id, stripe_payment_intent_id,
      amount_cents, currency, plan, status, contact, metadata, paid_at, updated_at
    )
    values (
      ${customerId}, null, ${entitlementRows[0].id}, ${stripeCustomerId}, ${stripePaymentIntentId},
      ${amountCents}, ${currency}, ${addOns.plan}, ${status}, ${cleanContact}, ${orderMetadata}, now(), now()
    )
    returning id
  `;
  return {
    ok: true,
    customerId,
    entitlementId: entitlementRows[0].id,
    orderId: orderRows[0].id,
    amountCents,
    currency,
    plan: addOns.plan,
    scope: addOns.scope,
    mediaAddOns: addOns,
  };
}
