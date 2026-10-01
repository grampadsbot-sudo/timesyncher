import { cleanText, upsertCustomer } from './onboarding.mjs';
import { CheckoutConfigError, requiredConfigCents } from './checkout-pricing.mjs';

const OWNER_MEDIA_PLAN = 'owner_media';

export function ownerMediaScope() {
  return 'owner';
}

export function mediaPriceCents(env = process.env) {
  return requiredConfigCents(env?.TIMESYNCHER_MEDIA_PRICE_CENTS, 'TIMESYNCHER_MEDIA_PRICE_CENTS');
}

function mediaSelected(selected = {}) {
  if (selected.media === false || selected.media === 'false') return false;
  return Boolean(
    selected.media
    || selected.photoUpload
    || selected.photo_upload
    || selected.photoMemories
    || selected.videoUpload
    || selected.video_upload
    || selected.videoMemories
    || selected.canUploadPhotos
    || selected.canUploadVideos,
  );
}

export function selectedMediaAddOn(body = {}, env = process.env) {
  const selected = body.accessAddOns && typeof body.accessAddOns === 'object'
    ? body.accessAddOns
    : body.mediaAddOns && typeof body.mediaAddOns === 'object'
      ? body.mediaAddOns
      : body;
  const chosen = mediaSelected(selected);
  const mediaAmountCents = chosen ? mediaPriceCents(env) : 0;
  return {
    photoUpload: chosen,
    videoUpload: chosen,
    photoAmountCents: 0,
    videoAmountCents: 0,
    mediaAmountCents,
    amountCents: mediaAmountCents,
    plan: OWNER_MEDIA_PLAN,
    scope: 'owner',
  };
}

export function ownerMediaAddOns(body = {}, env = process.env) {
  const amountCents = mediaPriceCents(env);
  const selected = body.mediaAddOns && typeof body.mediaAddOns === 'object' ? body.mediaAddOns : body;
  return {
    scope: 'owner',
    plan: OWNER_MEDIA_PLAN,
    photoUpload: true,
    videoUpload: true,
    photoAmountCents: 0,
    videoAmountCents: 0,
    mediaAmountCents: amountCents,
    amountCents,
    ownerCustomerId: cleanText(body.ownerCustomerId || body.owner_customer_id || selected.ownerCustomerId || selected.owner_customer_id, 80) || null,
  };
}

export function requireOwnerMediaAddOns(body = {}, env = process.env) {
  const addOns = ownerMediaAddOns(body, env);
  if (!Number.isInteger(addOns.amountCents) || addOns.amountCents < 50) {
    throw new CheckoutConfigError('TIMESYNCHER_MEDIA_PRICE_CENTS');
  }
  return addOns;
}

export function ownerMediaCoversTrip(entitlement, trip = {}) {
  if (!entitlement || entitlement.status !== 'active' || entitlement.plan !== OWNER_MEDIA_PLAN) return false;
  if (entitlement.trip_id || entitlement.tripId) return false;
  const ownerId = trip.customer_id || trip.customerId || trip.ownerCustomerId || trip.owner_customer_id || '';
  const entitledId = entitlement.customer_id || entitlement.customerId || '';
  return Boolean(ownerId) && entitledId === ownerId;
}

export function ownerMediaMetadata(addOns, extra = {}) {
  return {
    product: 'timesyncher_vacation_owner_media_addons',
    plan: addOns.plan,
    media_scope: addOns.scope,
    photo_memories: 'true',
    video_memories: 'true',
    media_uploads: 'true',
    media_memories: 'true',
    photoAmountCents: 0,
    videoAmountCents: 0,
    mediaAmountCents: addOns.amountCents,
    totalAmountCents: addOns.amountCents,
    owner_customer_id: addOns.ownerCustomerId || extra.owner_customer_id || extra.ownerCustomerId || '',
    ...extra,
  };
}

export async function recordOwnerMediaPurchase({
  db,
  contact,
  addOns,
  ownerCustomerId = addOns?.ownerCustomerId || null,
  amountCents,
  currency = 'usd',
  status = 'paid',
  stripeCustomerId = null,
  stripePaymentIntentId = null,
  metadata = {},
}) {
  const chargedCents = amountCents ?? addOns?.amountCents;
  if (!Number.isInteger(chargedCents) || chargedCents < 0) throw new CheckoutConfigError('TIMESYNCHER_MEDIA_PRICE_CENTS');
  const cleanContact = {
    email: cleanText(contact?.email, 180).toLowerCase() || null,
    phone: cleanText(contact?.phone, 80) || null,
    firstName: cleanText(contact?.firstName, 80) || null,
    lastName: cleanText(contact?.lastName, 80) || null,
    displayName: cleanText(contact?.displayName || [contact?.firstName, contact?.lastName].filter(Boolean).join(' '), 180) || cleanText(contact?.email, 180) || null,
  };
  const entitledOwnerId = cleanText(ownerCustomerId, 80);
  const orderMetadata = ownerMediaMetadata({ ...addOns, ownerCustomerId: entitledOwnerId || null }, metadata);
  const payerCustomerId = await upsertCustomer(db, cleanContact, orderMetadata);
  const customerId = entitledOwnerId || payerCustomerId;
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
      ${chargedCents}, ${currency}, ${addOns.plan}, ${status}, ${cleanContact}, ${orderMetadata}, now(), now()
    )
    returning id
  `;
  return {
    ok: true,
    customerId,
    payerCustomerId,
    entitlementId: entitlementRows[0].id,
    orderId: orderRows[0].id,
    amountCents: chargedCents,
    currency,
    plan: addOns.plan,
    scope: addOns.scope,
    mediaAddOns: addOns,
  };
}
