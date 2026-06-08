import crypto from 'node:crypto';

const DEFAULT_SITE_BASE = 'https://www.timesyncher.com';
const DEFAULT_BOT_USERNAME = 'TimeSyncherVacationBot';

export function siteBase(env = process.env) {
  return (env.TIMESYNCHER_SITE_BASE_URL || env.SITE_BASE_URL || DEFAULT_SITE_BASE).replace(/\/+$/, '');
}

export function botUsername(env = process.env) {
  return String(env.TIMESYNCHER_TELEGRAM_BOT_USERNAME || env.TELEGRAM_BOT_USERNAME || DEFAULT_BOT_USERNAME).replace(/^@/, '');
}

export function cleanText(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

export function onboardingLink(token, env = process.env) {
  return `${siteBase(env)}/order-success.html?session=${encodeURIComponent(token)}`;
}

export function telegramLink(token, env = process.env) {
  return `https://t.me/${botUsername(env)}?start=${encodeURIComponent(token)}`;
}

export function hashIp(value = '', env = process.env) {
  const input = cleanText(value, 200);
  if (!input) return null;
  const salt = env.TIMESYNCHER_AUDIT_HASH_SALT || 'timesyncher-vacation';
  return crypto.createHash('sha256').update(`${salt}:${input}`).digest('hex');
}

function token() {
  return crypto.randomBytes(18).toString('base64url');
}

function jsonObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function customerContact({ stripeCustomer, metadata }) {
  const name = cleanText(stripeCustomer?.name, 180);
  const [firstFromName, ...lastFromName] = name.split(/\s+/).filter(Boolean);
  return {
    email: cleanText(stripeCustomer?.email || metadata.email, 180).toLowerCase() || null,
    phone: cleanText(stripeCustomer?.phone || metadata.phone, 80) || null,
    firstName: cleanText(metadata.first_name || firstFromName, 80) || null,
    lastName: cleanText(metadata.last_name || lastFromName.join(' '), 80) || null,
    displayName: name || cleanText(metadata.email, 180) || null,
  };
}

export async function upsertCustomer(db, contact, metadata = {}) {
  if (contact.email) {
    const rows = await db`
      insert into customers (email, phone, first_name, last_name, display_name, metadata, updated_at)
      values (${contact.email}, ${contact.phone}, ${contact.firstName}, ${contact.lastName}, ${contact.displayName}, ${metadata}, now())
      on conflict (email) do update set
        phone = coalesce(excluded.phone, customers.phone),
        first_name = coalesce(excluded.first_name, customers.first_name),
        last_name = coalesce(excluded.last_name, customers.last_name),
        display_name = coalesce(excluded.display_name, customers.display_name),
        metadata = customers.metadata || excluded.metadata,
        updated_at = now()
      returning id
    `;
    return rows[0].id;
  }

  const rows = await db`
    insert into customers (phone, first_name, last_name, display_name, metadata)
    values (${contact.phone}, ${contact.firstName}, ${contact.lastName}, ${contact.displayName}, ${metadata})
    returning id
  `;
  return rows[0].id;
}

async function ensureTrip(db, customerId, metadata) {
  const title = cleanText(metadata.trip_title || 'TimeSyncher Vacation Setup', 180) || 'TimeSyncher Vacation Setup';
  const vacationDate = cleanText(metadata.vacation_date, 40);
  const rows = await db`
    insert into trips (customer_id, title, start_date, preferences, status, metadata)
    values (
      ${customerId}, ${title}, ${vacationDate || null},
      ${{
        source: 'stripe_purchase',
        onboarding: true,
      }},
      'onboarding',
      ${metadata}
    )
    returning id
  `;
  return rows[0].id;
}

async function ensureEntitlement(db, customerId, tripId, order) {
  const rows = await db`
    insert into entitlements (
      customer_id, trip_id, stripe_customer_id, stripe_subscription_id, stripe_payment_intent_id,
      plan, status, metadata, updated_at
    )
    values (
      ${customerId}, ${tripId}, ${order.stripeCustomerId}, ${order.stripeSubscriptionId},
      ${order.stripePaymentIntentId}, ${order.plan}, 'active', ${order.metadata}, now()
    )
    returning id
  `;
  return rows[0].id;
}

async function ensureOrder(db, customerId, tripId, entitlementId, order) {
  const existing = order.stripePaymentIntentId
    ? await db`select id from paid_orders where stripe_payment_intent_id = ${order.stripePaymentIntentId} limit 1`
    : [];
  if (existing[0]) return existing[0].id;

  const bySubscription = order.stripeSubscriptionId
    ? await db`select id from paid_orders where stripe_subscription_id = ${order.stripeSubscriptionId} limit 1`
    : [];
  if (bySubscription[0]) return bySubscription[0].id;

  const rows = await db`
    insert into paid_orders (
      customer_id, trip_id, entitlement_id, stripe_customer_id, stripe_subscription_id, stripe_invoice_id,
      stripe_payment_intent_id, amount_cents, currency, plan, status, contact, metadata, paid_at, updated_at
    )
    values (
      ${customerId}, ${tripId}, ${entitlementId}, ${order.stripeCustomerId}, ${order.stripeSubscriptionId},
      ${order.stripeInvoiceId}, ${order.stripePaymentIntentId}, ${order.amountCents}, ${order.currency},
      ${order.plan}, 'paid', ${order.contact}, ${order.metadata}, ${order.paidAt || new Date().toISOString()}, now()
    )
    returning id
  `;
  return rows[0].id;
}

async function ensureOnboardingSession(db, customerId, tripId, orderId, metadata, env) {
  const existing = await db`
    select onboarding_sessions.*
    from onboarding_sessions
    where order_id = ${orderId}
    limit 1
  `;
  if (existing[0]) return existing[0];

  const sessionToken = token();
  const rows = await db`
    insert into onboarding_sessions (
      customer_id, trip_id, order_id, token, status, current_step, telegram_deep_link, metadata, updated_at
    )
    values (
      ${customerId}, ${tripId}, ${orderId}, ${sessionToken}, 'purchase_confirmed', 'post_purchase',
      ${telegramLink(sessionToken, env)}, ${metadata}, now()
    )
    returning *
  `;
  return rows[0];
}

export async function buildOnboardingFromStripe({ db, stripe, paymentIntent, invoice, subscription, stripeCustomer, env = process.env }) {
  const resolvedPaymentIntent = typeof paymentIntent === 'string'
    ? await stripe.paymentIntents.retrieve(paymentIntent)
    : paymentIntent;
  if (resolvedPaymentIntent?.id) {
    const existing = await db`
      select
        paid_orders.customer_id,
        paid_orders.trip_id,
        paid_orders.entitlement_id,
        paid_orders.id as order_id,
        paid_orders.contact,
        paid_orders.amount_cents,
        paid_orders.currency,
        paid_orders.plan,
        onboarding_sessions.*
      from paid_orders
      join onboarding_sessions on onboarding_sessions.order_id = paid_orders.id
      where paid_orders.stripe_payment_intent_id = ${resolvedPaymentIntent.id}
      limit 1
    `;
    if (existing[0]) {
      const row = existing[0];
      return {
        customerId: row.customer_id,
        tripId: row.trip_id,
        entitlementId: row.entitlement_id,
        orderId: row.order_id,
        session: row,
        token: row.token,
        onboardingUrl: onboardingLink(row.token, env),
        telegramUrl: row.telegram_deep_link || telegramLink(row.token, env),
        contact: row.contact || {},
        order: {
          stripePaymentIntentId: resolvedPaymentIntent.id,
          amountCents: row.amount_cents,
          currency: row.currency,
          plan: row.plan,
        },
      };
    }
  }
  const resolvedInvoice = invoice || (
    resolvedPaymentIntent?.invoice ? await stripe.invoices.retrieve(resolvedPaymentIntent.invoice) : null
  );
  const resolvedSubscription = subscription || (
    resolvedInvoice?.subscription ? await stripe.subscriptions.retrieve(resolvedInvoice.subscription) : null
  );
  const customerIdFromStripe = resolvedPaymentIntent?.customer || resolvedInvoice?.customer || resolvedSubscription?.customer;
  const resolvedCustomer = stripeCustomer || (
    customerIdFromStripe ? await stripe.customers.retrieve(customerIdFromStripe) : null
  );

  const metadata = {
    ...jsonObject(resolvedSubscription?.metadata),
    ...jsonObject(resolvedInvoice?.metadata),
    ...jsonObject(resolvedPaymentIntent?.metadata),
  };
  const contact = customerContact({ stripeCustomer: resolvedCustomer, metadata });
  const plan = cleanText(metadata.product || metadata.plan, 80).includes('unlimited') || metadata.order_bump === 'true' ? 'unlimited' : 'single';
  const order = {
    stripeCustomerId: cleanText(customerIdFromStripe, 120) || null,
    stripeSubscriptionId: cleanText(resolvedSubscription?.id || resolvedInvoice?.subscription, 120) || null,
    stripeInvoiceId: cleanText(resolvedInvoice?.id || resolvedPaymentIntent?.invoice, 120) || null,
    stripePaymentIntentId: cleanText(resolvedPaymentIntent?.id, 120) || null,
    amountCents: resolvedPaymentIntent?.amount_received || resolvedInvoice?.amount_paid || resolvedPaymentIntent?.amount || null,
    currency: cleanText(resolvedPaymentIntent?.currency || resolvedInvoice?.currency || 'usd', 12) || 'usd',
    plan,
    contact,
    paidAt: resolvedPaymentIntent?.created ? new Date(resolvedPaymentIntent.created * 1000).toISOString() : new Date().toISOString(),
    metadata: {
      stripePaymentStatus: resolvedPaymentIntent?.status || null,
      stripeInvoiceStatus: resolvedInvoice?.status || null,
      ...metadata,
    },
  };

  const customerId = await upsertCustomer(db, contact, {
    source: 'stripe_purchase',
    stripeCustomerId: order.stripeCustomerId,
    ...metadata,
  });
  const tripId = await ensureTrip(db, customerId, metadata);
  const entitlementId = await ensureEntitlement(db, customerId, tripId, order);
  const orderId = await ensureOrder(db, customerId, tripId, entitlementId, order);
  const session = await ensureOnboardingSession(db, customerId, tripId, orderId, order.metadata, env);

  return {
    customerId,
    tripId,
    entitlementId,
    orderId,
    session,
    token: session.token,
    onboardingUrl: onboardingLink(session.token, env),
    telegramUrl: session.telegram_deep_link || telegramLink(session.token, env),
    contact,
    order,
  };
}

export async function getSessionByToken(db, tokenValue) {
  const rows = await db`
    select
      onboarding_sessions.*,
      customers.email,
      customers.first_name,
      customers.last_name,
      customers.display_name,
      paid_orders.plan,
      paid_orders.amount_cents,
      paid_orders.currency
    from onboarding_sessions
    left join customers on customers.id = onboarding_sessions.customer_id
    left join paid_orders on paid_orders.id = onboarding_sessions.order_id
    where onboarding_sessions.token = ${tokenValue}
    limit 1
  `;
  return rows[0] || null;
}

export function publicSession(row, env = process.env) {
  if (!row) return null;
  return {
    sessionId: row.id,
    token: row.token,
    status: row.status,
    currentStep: row.current_step,
    customerName: row.display_name || [row.first_name, row.last_name].filter(Boolean).join(' '),
    email: row.email,
    plan: row.plan,
    amountCents: row.amount_cents,
    currency: row.currency,
    onboardingUrl: onboardingLink(row.token, env),
    telegramUrl: row.telegram_deep_link || telegramLink(row.token, env),
    telegramInstall: {
      ios: 'https://apps.apple.com/app/telegram-messenger/id686449807',
      android: 'https://play.google.com/store/apps/details?id=org.telegram.messenger',
      desktop: 'https://apps.apple.com/us/app/telegram/id747648890?mt=12',
    },
  };
}
