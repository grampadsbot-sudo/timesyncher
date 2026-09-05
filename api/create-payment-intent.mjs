import Stripe from 'stripe';
import { requireIntakeAuth } from '../src/vacation/auth.mjs';
import { sql } from '../src/vacation/db.mjs';
import { stripeSecretKey } from '../src/vacation/stripe-env.mjs';
import { collaboratorStripe, createCollaboratorCheckout } from '../src/vacation/collaborator-checkout.mjs';
import { ownerMediaMetadata, recordOwnerMediaPurchase, requireOwnerMediaAddOns } from '../src/vacation/media-checkout.mjs';
import {
  collaboratorPlan,
  collaboratorStagingCardCheckoutAllowed,
  collaboratorTelegramLink,
  loadCollaboratorInviteByToken,
  markCollaboratorInvitePaid,
} from '../src/vacation/collaborators.mjs';
import { queueOrSendCollaboratorInviteEmail } from '../src/vacation/email.mjs';

const BASE_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_BASE_PRICE_CENTS || '3700', 10);
const ORDER_BUMP_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS || '2700', 10);
const CURRENCY = process.env.TIMESYNCHER_CHECKOUT_CURRENCY || 'usd';
const SINGLE_PRICE_ID = process.env.TIMESYNCHER_SINGLE_PRICE_ID || '';
const UNLIMITED_PRICE_ID = process.env.TIMESYNCHER_UNLIMITED_PRICE_ID || '';
const PHOTO_MEMORIES_SINGLE_PRICE_ID = process.env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_ID || process.env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_ID || '';
const PHOTO_MEMORIES_UNLIMITED_PRICE_ID = process.env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_ID || process.env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_ID || '';
const PHOTO_MEMORIES_SINGLE_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_CENTS || process.env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS || '500', 10);
const PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS || process.env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS || '500', 10);
const COLLABORATOR_PHOTO_SINGLE_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_COLLABORATOR_PHOTO_SINGLE_PRICE_CENTS || '500', 10);
const COLLABORATOR_PHOTO_UNLIMITED_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_COLLABORATOR_PHOTO_UNLIMITED_PRICE_CENTS || '900', 10);
const COLLABORATOR_VIDEO_SINGLE_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_COLLABORATOR_VIDEO_SINGLE_PRICE_CENTS || '1700', 10);
const COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS = Number.parseInt(process.env.TIMESYNCHER_COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS || '2700', 10);

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body, null, 2) + '\n');
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function requireCustomer(body) {
  const firstName = clean(body.firstName, 80);
  const lastName = clean(body.lastName, 80);
  const email = clean(body.email, 180).toLowerCase();
  if (!firstName) throw new Error('First name is required.');
  if (!lastName) throw new Error('Last name is required.');
  if (!email || !email.includes('@')) throw new Error('Valid email is required.');
  return {
    firstName,
    lastName,
    email,
    phone: clean(body.phone, 60),
    vacationDate: clean(body.vacationDate, 40),
    address: clean(body.address, 220),
    city: clean(body.city, 120),
    state: clean(body.state, 80),
    zip: clean(body.zip, 40),
    country: clean(body.country || 'US', 80),
  };
}

function requireCollaboratorContact(body) {
  const customer = requireCustomer({
    ...body,
    phone: body.phone || '',
    vacationDate: '',
    address: body.address || '',
    city: body.city || '',
    state: body.state || '',
    zip: body.zip || body.postalCode || '',
    country: body.country || 'US',
  });
  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    displayName: `${customer.firstName} ${customer.lastName}`.trim() || customer.email,
  };
}

function stagingCardCheckoutAllowed(env = process.env) {
  return collaboratorStagingCardCheckoutAllowed(env);
}

function collaboratorAccessAddOns(body = {}, plan = {}) {
  const selected = body.accessAddOns && typeof body.accessAddOns === 'object' ? body.accessAddOns : body;
  const unlimited = plan.scope === 'unlimited_trips';
  const photoUpload = Boolean(selected.photoUpload || selected.photo_upload || selected.photoMemories);
  const videoUpload = Boolean(selected.videoUpload || selected.video_upload || selected.videoMemories);
  const photoAmountCents = photoUpload ? (unlimited ? COLLABORATOR_PHOTO_UNLIMITED_PRICE_CENTS : COLLABORATOR_PHOTO_SINGLE_PRICE_CENTS) : 0;
  const videoAmountCents = videoUpload ? (unlimited ? COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS : COLLABORATOR_VIDEO_SINGLE_PRICE_CENTS) : 0;
  return {
    photoUpload,
    videoUpload,
    photoAmountCents,
    videoAmountCents,
    amountCents: photoAmountCents + videoAmountCents,
  };
}

async function collaboratorInviteWithSelectedPlan(db, invite, body = {}) {
  const requestedPlanCode = clean(body.collaboratorPlan || body.planCode || body.plan || invite?.plan_code || 'single_trip', 100);
  const plan = collaboratorPlan(requestedPlanCode);
  if (plan.code === invite.plan_code && plan.scope === invite.scope) return { invite, plan };
  if (plan.scope === 'single_trip' && !invite.trip_id) {
    throw Object.assign(new Error('This checkout link is not tied to a single vacation.'), { statusCode: 400 });
  }
  const rows = await db`
    update vacation_collaborator_invites
    set plan_code = ${plan.code},
      scope = ${plan.scope},
      trip_id = case when ${plan.scope} = 'unlimited_trips' then null else trip_id end,
      metadata = metadata || ${{
        selectedPlanCode: plan.code,
        selectedScope: plan.scope,
        selectedAt: new Date().toISOString(),
      }},
      updated_at = now()
    where id = ${invite.id}
      and status = 'pending_payment'
    returning *
  `;
  return { invite: rows[0] || invite, plan };
}

async function collaboratorPaymentIntent({ db, stripe, token, contact, body = {}, env = process.env }) {
  const invite = await loadCollaboratorInviteByToken(db, token, env);
  if (!invite) throw Object.assign(new Error('Collaborator invite link is invalid or expired.'), { statusCode: 400 });
  if (invite.status !== 'pending_payment') {
    throw Object.assign(new Error(`Collaborator invite is already ${invite.status}.`), { statusCode: 409 });
  }
  const selected = await collaboratorInviteWithSelectedPlan(db, invite, body);
  const plan = selected.plan;
  const addOns = collaboratorAccessAddOns(body, plan);
  const amount = plan.amountCents + addOns.amountCents;
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: CURRENCY,
    automatic_payment_methods: { enabled: true },
    receipt_email: contact.email,
    description: plan.scope === 'single_trip'
      ? 'TimeSyncher Vacation Telegram access'
      : 'TimeSyncher Vacation Telegram access for all vacations',
    metadata: {
      product: 'timesyncher_vacation_telegram_collaborator',
      invite_id: selected.invite.id,
      invite_token: token,
      owner_customer_id: selected.invite.owner_customer_id,
      trip_id: selected.invite.trip_id || '',
      plan_code: plan.code,
      scope: plan.scope,
      photo_upload: String(addOns.photoUpload),
      video_upload: String(addOns.videoUpload),
      collaborator_add_on_amount_cents: String(addOns.amountCents),
      email: contact.email,
      first_name: contact.firstName,
      last_name: contact.lastName,
      requested_for: contact.displayName,
      source: 'collaborator_payment_element',
    },
  });
  await db`
    update vacation_collaborator_invites
    set stripe_payment_intent_id = ${paymentIntent.id},
      metadata = metadata || ${{
        photoUpload: addOns.photoUpload,
        videoUpload: addOns.videoUpload,
        photoAmountCents: addOns.photoAmountCents,
        videoAmountCents: addOns.videoAmountCents,
        totalAmountCents: amount,
      }},
      updated_at = now()
    where id = ${invite.id}
  `;
  return {
    ok: true,
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount,
    currency: CURRENCY,
    plan: plan.code,
    scope: plan.scope,
  };
}

async function completeStagingCollaboratorCheckout({ db, token, contact, card = {}, body = {}, env = process.env }) {
  if (!stagingCardCheckoutAllowed(env)) {
    throw Object.assign(new Error('Staging card checkout is not enabled for this environment.'), { statusCode: 403 });
  }
  const currentInvite = await loadCollaboratorInviteByToken(db, token, env);
  if (!currentInvite) throw Object.assign(new Error('Collaborator invite link is invalid or expired.'), { statusCode: 400 });
  const selected = await collaboratorInviteWithSelectedPlan(db, currentInvite, body);
  const plan = selected.plan;
  const addOns = collaboratorAccessAddOns(body, plan);
  const invite = await markCollaboratorInvitePaid(db, {
    token,
    env,
    metadata: {
      paidVia: 'staging_card_checkout',
      requestedEmail: contact.email,
      requestedFor: contact.displayName,
      photoUpload: addOns.photoUpload,
      videoUpload: addOns.videoUpload,
      photoAmountCents: addOns.photoAmountCents,
      videoAmountCents: addOns.videoAmountCents,
      totalAmountCents: plan.amountCents + addOns.amountCents,
      cardBrand: clean(card.brand, 40) || null,
      cardLast4: clean(card.last4, 4) || null,
      billingPostalCode: clean(card.postalCode, 40) || null,
    },
  });
  const email = await queueOrSendCollaboratorInviteEmail(db, { invite, token, contact }, env);
  return {
    ok: true,
    status: 'collaborator_staging_card_paid',
    mode: 'staging_card',
    collaboratorInvite: {
      id: invite.id,
      status: invite.status,
      telegramUrl: collaboratorTelegramLink(token, env),
      tripTitle: invite.trip_title || null,
      requestedFor: contact.displayName,
    },
    email,
  };
}

async function ownerMediaPaymentIntent({ stripe, contact, body = {} }) {
  const addOns = requireOwnerMediaAddOns(body);
  const metadata = ownerMediaMetadata(addOns, {
    email: contact.email,
    first_name: contact.firstName,
    last_name: contact.lastName,
    source: 'owner_media_payment_element',
  });
  const stripeCustomer = await findOrCreateStripeCustomer(stripe, {
    ...contact,
    address: body.address || '',
    city: body.city || '',
    state: body.state || '',
    zip: body.zip || body.postalCode || '',
    country: body.country || 'US',
  }, metadata);
  const paymentIntent = await stripe.paymentIntents.create({
    amount: addOns.amountCents,
    currency: CURRENCY,
    customer: stripeCustomer.id,
    automatic_payment_methods: { enabled: true },
    receipt_email: contact.email,
    description: addOns.scope === 'single_trip'
      ? 'TimeSyncher Vacation photo/video upload access'
      : 'TimeSyncher Vacation photo/video upload access for all vacations',
    metadata,
  });
  return {
    ok: true,
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amount: addOns.amountCents,
    currency: CURRENCY,
    plan: addOns.plan,
    scope: addOns.scope,
    mediaAddOns: addOns,
  };
}

async function completeStagingOwnerMediaCheckout({ db, contact, card = {}, body = {}, env = process.env }) {
  if (!stagingCardCheckoutAllowed(env)) {
    throw Object.assign(new Error('Staging card checkout is not enabled for this environment.'), { statusCode: 403 });
  }
  const addOns = requireOwnerMediaAddOns(body);
  return recordOwnerMediaPurchase({
    db,
    contact,
    addOns,
    amountCents: addOns.amountCents,
    currency: CURRENCY,
    status: 'paid',
    metadata: {
      paidVia: 'staging_card_checkout',
      cardBrand: clean(card.brand, 40) || null,
      cardLast4: clean(card.last4, 4) || null,
      billingPostalCode: clean(card.postalCode, 40) || null,
      source: 'owner_media_staging_card_checkout',
    },
  });
}

function stripeAddress(customer) {
  if (!customer.address && !customer.city && !customer.state && !customer.zip && !customer.country) return undefined;
  return {
    line1: customer.address || undefined,
    city: customer.city || undefined,
    state: customer.state || undefined,
    postal_code: customer.zip || undefined,
    country: customer.country === 'United States' ? 'US' : customer.country,
  };
}

function stripeCustomerParams(customer, metadata) {
  return {
    email: customer.email,
    name: `${customer.firstName} ${customer.lastName}`,
    phone: customer.phone || undefined,
    address: stripeAddress(customer),
    metadata,
  };
}

async function findOrCreateStripeCustomer(stripe, customer, metadata) {
  const matches = await stripe.customers.list({ email: customer.email, limit: 10 });
  const existing = (matches.data || []).find((match) => !match.deleted);
  const params = stripeCustomerParams(customer, metadata);
  if (existing) return stripe.customers.update(existing.id, params);
  return stripe.customers.create(params);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method not allowed' });

  try {
    const body = await readBody(req);
    if (body.action === 'create_collaborator_checkout') {
      requireIntakeAuth(req, process.env);
      try {
        const db = sql(process.env);
        const checkout = await createCollaboratorCheckout({
          db,
          stripe: collaboratorStripe(process.env),
          env: process.env,
          ownerCustomerId: clean(body.ownerCustomerId || body.customerId, 80),
          tripId: clean(body.tripId, 80),
          planCode: clean(body.planCode || body.scope || 'single_trip', 80),
          requestedFor: clean(body.requestedFor, 180),
          metadata: {
            requestedByTelegramChatId: clean(body.telegramChatId, 120) || null,
          },
        });
        return send(res, 200, checkout);
      } catch (error) {
        return send(res, error.statusCode || 503, { ok: false, error: error.message || 'Unable to create collaborator checkout.' });
      }
    }

    if (body.action === 'create_collaborator_payment_intent') {
      const contact = requireCollaboratorContact(body);
      const token = clean(body.collaboratorInvite || body.collaboratorInviteToken, 200);
      if (!token) return send(res, 400, { ok: false, error: 'Collaborator invite token is required.' });
      const db = sql(process.env);
      let stripeConfig;
      try {
        stripeConfig = stripeSecretKey(process.env);
      } catch (error) {
        if (stagingCardCheckoutAllowed(process.env)) {
          const invite = await loadCollaboratorInviteByToken(db, token, process.env);
          if (!invite) return send(res, 400, { ok: false, error: 'Collaborator invite link is invalid or expired.' });
          const plan = collaboratorPlan(invite.plan_code);
          const addOns = collaboratorAccessAddOns(body, plan);
          return send(res, 200, {
            ok: true,
            mode: 'staging_card',
            stripeUnavailable: true,
            amount: plan.amountCents + addOns.amountCents,
            currency: CURRENCY,
            plan: plan.code,
            accessAddOns: addOns,
            error: error.message,
          });
        }
        return send(res, 503, { ok: false, error: error.message || 'Stripe secret key is not configured yet.' });
      }
      const stripe = new Stripe(stripeConfig.key, { apiVersion: '2025-11-17.clover' });
      return send(res, 200, await collaboratorPaymentIntent({ db, stripe, token, contact, body, env: process.env }));
    }

    if (body.action === 'complete_staging_collaborator_checkout') {
      const contact = requireCollaboratorContact(body);
      const token = clean(body.collaboratorInvite || body.collaboratorInviteToken, 200);
      if (!token) return send(res, 400, { ok: false, error: 'Collaborator invite token is required.' });
      const db = sql(process.env);
      return send(res, 200, await completeStagingCollaboratorCheckout({
        db,
        token,
        contact,
        card: body.card || {},
        body,
        env: process.env,
      }));
    }

    if (body.action === 'create_owner_media_payment_intent') {
      const contact = requireCollaboratorContact(body);
      const db = sql(process.env);
      let stripeConfig;
      try {
        stripeConfig = stripeSecretKey(process.env);
      } catch (error) {
        if (stagingCardCheckoutAllowed(process.env)) {
          const addOns = requireOwnerMediaAddOns(body);
          return send(res, 200, {
            ok: true,
            mode: 'staging_card',
            stripeUnavailable: true,
            amount: addOns.amountCents,
            currency: CURRENCY,
            plan: addOns.plan,
            scope: addOns.scope,
            mediaAddOns: addOns,
            error: error.message,
          });
        }
        return send(res, 503, { ok: false, error: error.message || 'Stripe secret key is not configured yet.' });
      }
      const stripe = new Stripe(stripeConfig.key, { apiVersion: '2025-11-17.clover' });
      return send(res, 200, await ownerMediaPaymentIntent({ stripe, contact, body }));
    }

    if (body.action === 'complete_staging_owner_media_checkout') {
      const contact = requireCollaboratorContact(body);
      const db = sql(process.env);
      return send(res, 200, await completeStagingOwnerMediaCheckout({
        db,
        contact,
        card: body.card || {},
        body,
        env: process.env,
      }));
    }

    let stripeConfig;
    try {
      stripeConfig = stripeSecretKey(process.env);
    } catch (error) {
      return send(res, 503, { ok: false, error: error.message || 'Stripe secret key is not configured yet.' });
    }
    if (!SINGLE_PRICE_ID || !UNLIMITED_PRICE_ID) return send(res, 503, { ok: false, error: 'Stripe subscription price IDs are not configured yet.' });

    const customer = requireCustomer(body);
    const orderBump = Boolean(body.orderBump);
    const photoMemories = Boolean(body.photoMemories);
    const photoMemoriesPriceId = orderBump ? PHOTO_MEMORIES_UNLIMITED_PRICE_ID : PHOTO_MEMORIES_SINGLE_PRICE_ID;
    const photoMemoriesAmount = photoMemories ? (orderBump ? PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS : PHOTO_MEMORIES_SINGLE_PRICE_CENTS) : 0;
    if (photoMemories && !photoMemoriesPriceId) throw new Error('Photo Memories subscription price ID is not configured yet.');
    const amount = BASE_PRICE_CENTS + (orderBump ? ORDER_BUMP_PRICE_CENTS : 0) + photoMemoriesAmount;
    if (!Number.isFinite(amount) || amount < 50) throw new Error('Invalid checkout amount.');

    const stripe = new Stripe(stripeConfig.key, { apiVersion: '2025-11-17.clover' });
    const orderMetadata = {
      product: orderBump ? 'timesyncher_vacation_unlimited' : 'timesyncher_vacation_single',
      plan: orderBump ? 'unlimited' : 'single',
      order_bump: String(orderBump),
      email: customer.email,
      phone: customer.phone,
      first_name: customer.firstName,
      last_name: customer.lastName,
      vacation_date: customer.vacationDate,
      photo_memories: String(photoMemories),
      photo_memories_price_id: photoMemoriesPriceId || '',
      photo_memories_plan: orderBump ? 'unlimited' : 'single',
      source: 'vacation.timesyncher.com',
    };
    const stripeCustomer = await findOrCreateStripeCustomer(stripe, customer, orderMetadata);
    const subscriptionItems = [
      { price: SINGLE_PRICE_ID },
      ...(orderBump ? [{ price: UNLIMITED_PRICE_ID }] : []),
      ...(photoMemories ? [{ price: photoMemoriesPriceId }] : []),
    ];

    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomer.id,
      items: subscriptionItems,
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.confirmation_secret', 'latest_invoice.payment_intent'],
      metadata: {
        ...orderMetadata,
      },
    });

    const invoice = subscription.latest_invoice;
    const clientSecret = invoice?.confirmation_secret?.client_secret || invoice?.payment_intent?.client_secret;
    if (!clientSecret) throw new Error('Stripe did not return a subscription payment client secret.');
    if (invoice?.payment_intent?.id) {
      await stripe.paymentIntents.update(invoice.payment_intent.id, {
        receipt_email: customer.email,
        description: 'TimeSyncher Vacation',
        metadata: {
          ...orderMetadata,
          stripe_subscription_id: subscription.id,
          stripe_invoice_id: invoice.id,
        },
      });
    }

    return send(res, 200, {
      ok: true,
      mode: stripeConfig.mode,
      clientSecret,
      subscriptionId: subscription.id,
      customerId: stripeCustomer.id,
      amount: invoice?.amount_due ?? amount,
      estimatedAmount: amount,
      currency: CURRENCY,
      orderBump,
      photoMemories,
      photoMemoriesPlan: photoMemories ? (orderBump ? 'unlimited' : 'single') : null,
      plan: orderBump ? 'unlimited' : 'single',
    });
  } catch (error) {
    return send(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to create subscription.' });
  }
}
