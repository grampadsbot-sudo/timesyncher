import crypto from 'node:crypto';
import { requireAdminAuth } from '../src/vacation/auth.mjs';
import { sql } from '../src/vacation/db.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';
import {
  ensureVacationEulaSession,
  onboardingLink,
  telegramLink,
  upsertCustomer,
} from '../src/vacation/onboarding.mjs';
import { queueOrSendPurchaseEmail } from '../src/vacation/email.mjs';

function token() {
  return crypto.randomBytes(18).toString('base64url');
}

function contactFromBody(body) {
  const email = cleanText(body.email, 180).toLowerCase();
  if (!email) throw Object.assign(new Error('email is required'), { statusCode: 400 });
  const firstName = cleanText(body.firstName || body.first_name, 80) || null;
  const lastName = cleanText(body.lastName || body.last_name, 80) || null;
  const displayName = cleanText(body.displayName || body.display_name || [firstName, lastName].filter(Boolean).join(' ') || email, 180);
  return {
    email,
    phone: cleanText(body.phone, 80) || null,
    firstName,
    lastName,
    displayName,
  };
}

function metadata(body, contact) {
  return {
    source: 'admin_no_charge',
    adminCreated: true,
    adminCreatedAt: new Date().toISOString(),
    adminNote: cleanText(body.note || body.adminNote, 1000) || null,
    requestedEmail: contact.email,
  };
}

export default async function handler(req, res) {
  try {
    requireAdminAuth(req, process.env);
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });

    const body = await readJson(req);
    const contact = contactFromBody(body);
    const plan = cleanText(body.plan, 40) === 'unlimited' ? 'unlimited' : 'single';
    const sendEmail = Boolean(body.sendEmail);
    const now = new Date().toISOString();
    const meta = metadata(body, contact);
    const db = sql(process.env);

    const customerId = await upsertCustomer(db, contact, meta);
    const tripRows = await db`
      insert into trips (customer_id, title, start_date, preferences, status, metadata)
      values (
        ${customerId},
        ${cleanText(body.tripTitle || body.title, 180) || 'TimeSyncher Vacation Admin Test'},
        ${cleanText(body.vacationDate || body.startDate, 40) || null},
        ${{ source: 'admin_no_charge', onboarding: true }},
        'onboarding',
        ${meta}
      )
      returning id
    `;
    const tripId = tripRows[0].id;

    const entitlementRows = await db`
      insert into entitlements (customer_id, trip_id, plan, status, metadata, updated_at)
      values (${customerId}, ${tripId}, ${plan}, 'active', ${meta}, now())
      returning id
    `;
    const entitlementId = entitlementRows[0].id;

    const orderRows = await db`
      insert into paid_orders (
        customer_id, trip_id, entitlement_id, amount_cents, currency, plan, status,
        contact, metadata, paid_at, updated_at
      )
      values (
        ${customerId}, ${tripId}, ${entitlementId}, 0, 'usd', ${plan}, 'admin_no_charge',
        ${contact}, ${meta}, ${now}, now()
      )
      returning id
    `;
    const orderId = orderRows[0].id;

    const sessionToken = token();
    const sessionRows = await db`
      insert into onboarding_sessions (
        customer_id, trip_id, order_id, token, status, current_step, telegram_deep_link,
        metadata, updated_at
      )
      values (
        ${customerId}, ${tripId}, ${orderId}, ${sessionToken}, 'purchase_confirmed',
        'post_purchase', ${telegramLink(sessionToken, process.env)}, ${meta}, now()
      )
      returning *
    `;
    const session = sessionRows[0];
    const eula = await ensureVacationEulaSession(session, { contact, env: process.env });
    const onboarding = {
      customerId,
      tripId,
      entitlementId,
      orderId,
      session,
      token: session.token,
      onboardingUrl: onboardingLink(session.token, process.env),
      telegramUrl: session.telegram_deep_link || telegramLink(session.token, process.env),
      eula,
      contact,
      order: { amountCents: 0, currency: 'usd', plan, status: 'admin_no_charge' },
    };
    const email = sendEmail ? await queueOrSendPurchaseEmail(db, onboarding, process.env) : { status: 'skipped' };

    return sendJson(res, 201, {
      ok: true,
      session: {
        id: session.id,
        token: session.token,
        status: session.status,
        currentStep: session.current_step,
        onboardingUrl: onboarding.onboardingUrl,
        telegramUrl: onboarding.telegramUrl,
        eula,
      },
      customerId,
      tripId,
      orderId,
      email,
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to create admin onboarding session.' });
  }
}
