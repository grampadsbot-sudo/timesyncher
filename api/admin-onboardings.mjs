import crypto from 'node:crypto';
import { requireAdminAuth } from '../src/vacation/auth.mjs';
import { sql } from '../src/vacation/db.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';
import { createCoupon, disableCoupon, listCoupons } from '../src/vacation/coupons.mjs';
import {
  ensureVacationEulaSession,
  onboardingLink,
  telegramLink,
  upsertCustomer,
} from '../src/vacation/onboarding.mjs';
import { queueOrSendPurchaseEmail } from '../src/vacation/email.mjs';
import { brokerMintPaidCollaboratorInvite } from '../src/vacation/collaborator-broker.mjs';

function token() {
  return crypto.randomBytes(18).toString('base64url');
}

function msBetween(start, end) {
  const a = start ? new Date(start).getTime() : NaN;
  const b = end ? new Date(end).getTime() : NaN;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, b - a);
}

function publicSession(row) {
  return {
    id: row.id,
    token: row.token,
    status: row.status,
    currentStep: row.current_step,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    emailSentAt: row.email_sent_at,
    telegramInstallChoice: row.telegram_install_choice,
    telegramUrl: row.telegram_deep_link,
    customer: {
      id: row.customer_id,
      email: row.email,
      phone: row.phone,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
      telegramUserId: row.telegram_user_id,
    },
    order: {
      id: row.order_id,
      status: row.order_status,
      plan: row.plan,
      amountCents: row.amount_cents,
      currency: row.currency,
      paidAt: row.paid_at,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      coupon: row.coupon_redemption_id ? {
        redemptionId: row.coupon_redemption_id,
        couponId: row.coupon_id,
        codeHint: row.coupon_code_hint,
        label: row.coupon_label,
        originalAmountCents: row.coupon_original_amount_cents,
        redeemedAt: row.coupon_redeemed_at,
        emailStatus: row.coupon_email_status,
      } : null,
    },
    trip: {
      id: row.trip_id,
      title: row.trip_title,
      destination: row.destination,
      status: row.trip_status,
      startDate: row.start_date,
      endDate: row.end_date,
    },
    counts: {
      clicks: Number(row.click_count || 0),
      emails: Number(row.email_count || 0),
      telegramSessions: Number(row.telegram_session_count || 0),
      turns: Number(row.turn_count || 0),
      requests: Number(row.request_count || 0),
      workerJobs: Number(row.job_count || 0),
    },
    timings: {
      paidToEmailMs: msBetween(row.paid_at, row.email_sent_at),
      paidToTelegramStartMs: msBetween(row.paid_at, row.started_at),
    },
  };
}

function eventTime(item) {
  return item.at || item.createdAt || item.clickedAt || item.sentAt || item.receivedAt || item.updatedAt || null;
}

function sortTimeline(items) {
  return items.sort((a, b) => {
    const at = new Date(eventTime(a) || 0).getTime();
    const bt = new Date(eventTime(b) || 0).getTime();
    return at - bt;
  });
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

function adminCreatedMetadata(body, contact) {
  return {
    source: 'admin_no_charge',
    adminCreated: true,
    adminCreatedAt: new Date().toISOString(),
    adminNote: cleanText(body.note || body.adminNote, 1000) || null,
    requestedEmail: contact.email,
  };
}

async function createAdminOnboarding(db, body) {
  const contact = contactFromBody(body);
  const plan = cleanText(body.plan, 40) === 'unlimited' ? 'unlimited' : 'single';
  const sendEmail = Boolean(body.sendEmail);
  const now = new Date().toISOString();
  const meta = adminCreatedMetadata(body, contact);

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

  return {
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
  };
}

async function listSessions(db, url) {
  const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get('limit') || '50', 10)));
  const rows = await db`
    select
      os.*,
      c.email, c.phone, c.first_name, c.last_name, c.display_name, c.telegram_user_id,
      po.status as order_status, po.plan, po.amount_cents, po.currency, po.paid_at,
      po.stripe_customer_id, po.stripe_subscription_id, po.stripe_payment_intent_id,
      ccr.id as coupon_redemption_id, ccr.coupon_id, ccr.original_amount_cents as coupon_original_amount_cents,
      ccr.created_at as coupon_redeemed_at, ccr.email_status as coupon_email_status,
      cc.code_hint as coupon_code_hint, cc.label as coupon_label,
      t.title as trip_title, t.destination, t.status as trip_status, t.start_date, t.end_date,
      (select count(*) from onboarding_clicks oc where oc.session_id = os.id) as click_count,
      (select count(*) from outbound_emails oe where oe.session_id = os.id) as email_count,
      (select count(*) from telegram_sessions ts where ts.onboarding_session_id = os.id) as telegram_session_count,
      (select count(*) from transcript_turns tt where tt.customer_id = os.customer_id or tt.trip_id = os.trip_id) as turn_count,
      (select count(*) from vacation_requests vr where vr.customer_id = os.customer_id or vr.trip_id = os.trip_id) as request_count,
      (select count(*) from worker_jobs wj join vacation_requests vr on vr.id = wj.request_id where vr.customer_id = os.customer_id or vr.trip_id = os.trip_id) as job_count
    from onboarding_sessions os
    left join customers c on c.id = os.customer_id
    left join paid_orders po on po.id = os.order_id
    left join checkout_coupon_redemptions ccr on ccr.onboarding_session_id = os.id
    left join checkout_coupons cc on cc.id = ccr.coupon_id
    left join trips t on t.id = os.trip_id
    order by os.created_at desc
    limit ${limit}
  `;
  return rows.map(publicSession);
}

async function detailSession(db, id) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const rows = isUuid ? await db`
    select
      os.*,
      c.email, c.phone, c.first_name, c.last_name, c.display_name, c.telegram_user_id,
      po.status as order_status, po.plan, po.amount_cents, po.currency, po.paid_at,
      po.stripe_customer_id, po.stripe_subscription_id, po.stripe_payment_intent_id,
      ccr.id as coupon_redemption_id, ccr.coupon_id, ccr.original_amount_cents as coupon_original_amount_cents,
      ccr.created_at as coupon_redeemed_at, ccr.email_status as coupon_email_status,
      cc.code_hint as coupon_code_hint, cc.label as coupon_label,
      t.title as trip_title, t.destination, t.status as trip_status, t.start_date, t.end_date,
      0 as click_count, 0 as email_count, 0 as telegram_session_count, 0 as turn_count, 0 as request_count, 0 as job_count
    from onboarding_sessions os
    left join customers c on c.id = os.customer_id
    left join paid_orders po on po.id = os.order_id
    left join checkout_coupon_redemptions ccr on ccr.onboarding_session_id = os.id
    left join checkout_coupons cc on cc.id = ccr.coupon_id
    left join trips t on t.id = os.trip_id
    where os.id = ${id} or os.token = ${id}
    limit 1
  ` : await db`
    select
      os.*,
      c.email, c.phone, c.first_name, c.last_name, c.display_name, c.telegram_user_id,
      po.status as order_status, po.plan, po.amount_cents, po.currency, po.paid_at,
      po.stripe_customer_id, po.stripe_subscription_id, po.stripe_payment_intent_id,
      ccr.id as coupon_redemption_id, ccr.coupon_id, ccr.original_amount_cents as coupon_original_amount_cents,
      ccr.created_at as coupon_redeemed_at, ccr.email_status as coupon_email_status,
      cc.code_hint as coupon_code_hint, cc.label as coupon_label,
      t.title as trip_title, t.destination, t.status as trip_status, t.start_date, t.end_date,
      0 as click_count, 0 as email_count, 0 as telegram_session_count, 0 as turn_count, 0 as request_count, 0 as job_count
    from onboarding_sessions os
    left join customers c on c.id = os.customer_id
    left join paid_orders po on po.id = os.order_id
    left join checkout_coupon_redemptions ccr on ccr.onboarding_session_id = os.id
    left join checkout_coupons cc on cc.id = ccr.coupon_id
    left join trips t on t.id = os.trip_id
    where os.token = ${id}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw Object.assign(new Error('Onboarding session not found.'), { statusCode: 404 });

  const [clicks, emails, telegramSessions, turns, requests, jobs] = await Promise.all([
    db`
      select id, event_type, target, href, user_agent, clicked_at, metadata
      from onboarding_clicks
      where session_id = ${row.id}
      order by clicked_at asc
    `,
    db`
      select id, to_email, subject, provider, provider_message_id, status, error_summary, created_at, sent_at, metadata
      from outbound_emails
      where session_id = ${row.id} or order_id = ${row.order_id}
      order by created_at asc
    `,
    db`
      select id, telegram_chat_id, telegram_user_id, status, current_step, started_at, last_message_at, metadata, created_at, updated_at
      from telegram_sessions
      where onboarding_session_id = ${row.id} or customer_id = ${row.customer_id} or trip_id = ${row.trip_id}
      order by created_at asc
    `,
    db`
      select id, telegram_session_id, request_id, speaker, channel, direction, body, payload,
        telegram_message_id, received_at, sent_at, response_latency_ms, onboarding_step,
        turn_category, turn_tags, turn_tag_source, turn_tag_confidence, turn_tagged_at,
        created_at
      from transcript_turns
      where customer_id = ${row.customer_id} or trip_id = ${row.trip_id}
      order by coalesce(received_at, sent_at, created_at) asc
      limit 200
    `,
    db`
      select id, source, request_type, request_text, normalized_intent, payload, status,
        error_code, error_summary, agent_runtime, retry_count, received_at, queued_at,
        worker_started_at, first_response_at, completed_at, created_at, updated_at
      from vacation_requests
      where customer_id = ${row.customer_id} or trip_id = ${row.trip_id}
      order by created_at asc
    `,
    db`
      select wj.id, wj.request_id, wj.trip_id, wj.job_type, wj.status, wj.priority,
        wj.run_after, wj.locked_by, wj.locked_at, wj.attempts, wj.max_attempts,
        wj.result, wj.error_summary, wj.created_at, wj.updated_at
      from worker_jobs wj
      join vacation_requests vr on vr.id = wj.request_id
      where vr.customer_id = ${row.customer_id} or vr.trip_id = ${row.trip_id}
      order by wj.created_at asc
    `,
  ]);

  const timeline = sortTimeline([
    { kind: 'payment', label: 'Payment/order created', at: row.paid_at, data: { amountCents: row.amount_cents, plan: row.plan, status: row.order_status } },
    { kind: 'onboarding', label: 'Onboarding session created', at: row.created_at, data: { status: row.status, currentStep: row.current_step } },
    ...emails.map((email) => ({ kind: 'email', label: `Email ${email.status}`, at: email.sent_at || email.created_at, data: email })),
    ...clicks.map((click) => ({ kind: 'click', label: `${click.event_type}: ${click.target || 'unknown'}`, at: click.clicked_at, data: click })),
    ...telegramSessions.map((session) => ({ kind: 'telegram_session', label: `Telegram ${session.current_step}`, at: session.started_at || session.created_at, data: session })),
    ...turns.map((turn) => ({ kind: 'turn', label: `${turn.direction || 'turn'}: ${turn.speaker}`, at: turn.received_at || turn.sent_at || turn.created_at, data: turn })),
    ...requests.map((request) => ({ kind: 'request', label: `${request.request_type}: ${request.status}`, at: request.created_at, data: request })),
    ...jobs.map((job) => ({ kind: 'worker_job', label: `${job.job_type}: ${job.status}`, at: job.updated_at || job.created_at, data: job })),
  ]);

  return {
    session: publicSession({
      ...row,
      click_count: clicks.length,
      email_count: emails.length,
      telegram_session_count: telegramSessions.length,
      turn_count: turns.length,
      request_count: requests.length,
      job_count: jobs.length,
    }),
    clicks,
    emails,
    telegramSessions,
    turns,
    requests,
    jobs,
    timeline,
  };
}

async function resendPurchaseEmailForSession(db, id, env = process.env) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const rows = isUuid ? await db`
    select
      os.*,
      c.email, c.phone, c.first_name, c.last_name, c.display_name,
      po.amount_cents, po.currency, po.plan, po.status as order_status
    from onboarding_sessions os
    join customers c on c.id = os.customer_id
    join paid_orders po on po.id = os.order_id
    where os.id = ${id} or os.token = ${id}
    limit 1
  ` : await db`
    select
      os.*,
      c.email, c.phone, c.first_name, c.last_name, c.display_name,
      po.amount_cents, po.currency, po.plan, po.status as order_status
    from onboarding_sessions os
    join customers c on c.id = os.customer_id
    join paid_orders po on po.id = os.order_id
    where os.token = ${id}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw Object.assign(new Error('Onboarding session not found.'), { statusCode: 404 });
  return queueOrSendPurchaseEmail(db, {
    customerId: row.customer_id,
    tripId: row.trip_id,
    orderId: row.order_id,
    session: row,
    token: row.token,
    onboardingUrl: onboardingLink(row.token, env),
    telegramUrl: row.telegram_deep_link || telegramLink(row.token, env),
    contact: {
      email: row.email,
      phone: row.phone,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: row.display_name,
    },
    order: {
      amountCents: row.amount_cents,
      currency: row.currency,
      plan: row.plan,
      status: row.order_status,
    },
  }, env);
}

export default async function handler(req, res) {
  try {
    requireAdminAuth(req, process.env);
    const url = new URL(req.url || '/', 'https://timesyncher.com');
    if (req.method === 'POST' && url.searchParams.get('action') === 'create-collaborator-invite') {
      const body = await readJson(req);
      if (body.dryRun) {
        return sendJson(res, 200, await brokerMintPaidCollaboratorInvite(null, body, process.env));
      }
      return sendJson(res, 200, await brokerMintPaidCollaboratorInvite(sql(process.env), body, process.env));
    }
    const db = sql(process.env);
    if (req.method === 'POST' && url.searchParams.get('action') === 'create') {
      return sendJson(res, 201, { ok: true, ...(await createAdminOnboarding(db, await readJson(req))) });
    }
    if (req.method === 'POST' && url.searchParams.get('action') === 'create-coupon') {
      return sendJson(res, 201, { ok: true, ...(await createCoupon(db, await readJson(req), process.env)) });
    }
    if (req.method === 'POST' && url.searchParams.get('action') === 'disable-coupon') {
      const body = await readJson(req);
      return sendJson(res, 200, { ok: true, coupon: await disableCoupon(db, cleanText(body.id, 120)) });
    }
    if (req.method === 'POST' && url.searchParams.get('action') === 'resend-purchase-email') {
      const body = await readJson(req);
      const id = cleanText(body.id || body.sessionId || body.token, 160);
      if (!id) throw Object.assign(new Error('id, sessionId, or token is required.'), { statusCode: 400 });
      return sendJson(res, 200, { ok: true, email: await resendPurchaseEmailForSession(db, id, process.env) });
    }
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' });
    if (url.searchParams.get('action') === 'coupons') {
      return sendJson(res, 200, { ok: true, coupons: await listCoupons(db, url.searchParams.get('limit') || '100') });
    }
    const id = cleanText(url.searchParams.get('id') || url.searchParams.get('session'), 160);
    if (id) return sendJson(res, 200, { ok: true, ...(await detailSession(db, id)) });
    return sendJson(res, 200, { ok: true, sessions: await listSessions(db, url) });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to load onboarding dashboard.' });
  }
}
