import Stripe from 'stripe';
import { stripeSecretKey } from './_stripe-env.mjs';
import { checkoutOrderSummary } from '../src/vacation/checkout-pricing.mjs';

const SINGLE_PRICE_ID = process.env.TIMESYNCHER_SINGLE_PRICE_ID || '';
const UNLIMITED_PRICE_ID = process.env.TIMESYNCHER_UNLIMITED_PRICE_ID || '';
const PHOTO_MEMORIES_SINGLE_PRICE_ID = process.env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_ID || process.env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_ID || '';
const PHOTO_MEMORIES_UNLIMITED_PRICE_ID = process.env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_ID || process.env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_ID || '';

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
  let stripeConfig;
  try {
    stripeConfig = stripeSecretKey(process.env);
  } catch (error) {
    return send(res, 503, { ok: false, error: error.message || 'Stripe secret key is not configured yet.' });
  }
  if (!SINGLE_PRICE_ID || !UNLIMITED_PRICE_ID) return send(res, 503, { ok: false, error: 'Stripe subscription price IDs are not configured yet.' });

  try {
    const body = await readBody(req);
    const customer = requireCustomer(body);
    const orderBump = Boolean(body.orderBump);
    const photoMemories = Boolean(body.photoMemories);
    const photoMemoriesPriceId = orderBump ? PHOTO_MEMORIES_UNLIMITED_PRICE_ID : PHOTO_MEMORIES_SINGLE_PRICE_ID;
    if (photoMemories && !photoMemoriesPriceId) throw new Error('Photo Memories subscription price ID is not configured yet.');
    const orderSummary = checkoutOrderSummary({ orderBump, photoMemories }, process.env);
    const amount = orderSummary.amountCents;
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
      currency: orderSummary.currency,
      orderBump,
      photoMemories,
      photoMemoriesPlan: photoMemories ? (orderBump ? 'unlimited' : 'single') : null,
      plan: orderBump ? 'unlimited' : 'single',
    });
  } catch (error) {
    return send(res, 400, { ok: false, error: error.message || 'Unable to create subscription.' });
  }
}
