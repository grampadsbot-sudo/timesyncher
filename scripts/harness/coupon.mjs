// Roster test-coupon redemption for the VK harness. No real payment: the only payment path the
// harness may use is the app's own coupon route (routes/checkout-coupon.mjs at /api/checkout-coupon).
// Every other payment path (Stripe PaymentIntents, card fields, api.stripe.com) is refused.
import fs from 'node:fs';
import path from 'node:path';
import { shortHash } from './redact.mjs';

export const COUPON_ROUTE = '/api/checkout-coupon';
export const COUPON_PATTERN = /^VK-TEST-(0\d{2}|100)$/;
const PAYMENT_BODY_KEYS = ['paymentMethod', 'payment_method', 'paymentIntent', 'payment_intent', 'clientSecret', 'card', 'cardNumber', 'number', 'cvc', 'stripeToken'];
const NON_COUPON_PAYMENT = [/\/api\/create-payment-intent/i, /\/api\/checkout-session/i, /(^|\.)stripe\.com$/i, /\/v1\/payment_intents/i, /\/v1\/charges/i];

export function assertCouponCode(code) {
  const value = String(code || '').trim().toUpperCase();
  if (!COUPON_PATTERN.test(value)) throw new Error('refused: coupon is not a VK-TEST roster coupon');
  return value;
}

export function isNonCouponPayment(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return false;
  }
  return NON_COUPON_PAYMENT.some((rule) => rule.test(parsed.pathname) || rule.test(parsed.hostname));
}

export const EXPIRED_PROMO_PATTERN = /^VK-EXPIRED-(0\d{2}|100)$/;

export function assertCouponOnlyRequest(url, body = {}) {
  const parsed = new URL(String(url));
  if (parsed.pathname !== COUPON_ROUTE) throw new Error('refused: non-coupon payment path');
  if (isNonCouponPayment(parsed.href)) throw new Error('refused: non-coupon payment path');
  for (const key of PAYMENT_BODY_KEYS) {
    if (Object.hasOwn(body, key)) throw new Error(`refused: payment field ${key} on a coupon request`);
  }
  // A validate-only probe with a made-up expired promo code consumes nothing; anything else must
  // carry the customer's own VK-TEST roster coupon.
  const probe = body.action === 'validate_coupon' && EXPIRED_PROMO_PATTERN.test(String(body.couponCode || ''));
  if (!probe) assertCouponCode(body.couponCode);
  return parsed;
}

// One ledger per run. A coupon may be redeemed once; a second redemption is refused unless the story
// is flagged coupon misuse, and then it is sent only so the harness can record the app's rejection.
export function createCouponLedger(file = '') {
  const rows = new Map();
  if (file && fs.existsSync(file)) {
    for (const row of JSON.parse(fs.readFileSync(file, 'utf8'))) rows.set(row.code, row);
  }
  const save = () => {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify([...rows.values()], null, 2)}\n`);
  };
  return {
    rows,
    claim(code, storyId) {
      const value = assertCouponCode(code);
      const prior = rows.get(value);
      if (prior) throw new Error(`refused: coupon ${value} already redeemed by ${prior.story_id} in this run`);
      rows.set(value, { code: value, story_id: storyId, redeemed: false, at: '' });
      save();
    },
    record(code, fields) {
      const value = assertCouponCode(code);
      rows.set(value, { ...(rows.get(value) || { code: value }), ...fields });
      save();
    },
    redeemed(code) {
      return rows.get(assertCouponCode(code))?.redeemed === true;
    },
    allowReuse(story) {
      return story?.coupon?.misuse === true;
    },
  };
}

function contactFor(story, runId) {
  const [first, ...rest] = String(story.customer?.name || '').split(/\s+/);
  return {
    firstName: first || 'Guest',
    lastName: rest.join(' ') || 'Harness',
    email: `harness+${runId}+${story.customer.email_alias}@harness.invalid`.toLowerCase(),
  };
}

export function couponRequestBody(story, runId, extra = {}) {
  return { ...contactFor(story, runId), couponCode: assertCouponCode(story.coupon?.code), orderBump: false, photoMemories: false, ...extra };
}

async function post(fetchImpl, origin, body) {
  const url = new URL(COUPON_ROUTE, origin);
  assertCouponOnlyRequest(url, body);
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const status = Number(response.status);
  let data = {};
  try {
    data = typeof response.json === 'function' ? await response.json() : JSON.parse(await response.text());
  } catch {
    data = {};
  }
  return { status, data };
}

function publicError(data) {
  return String(data?.error || '').slice(0, 160);
}

// Results the scorecard records per customer (coupon_redemption):
//   redeemed: the app accepted the coupon and charged $0 (amountCents 0)
//   rejected: the app refused the first redemption (FAIL)
//   reuse_rejected: misuse customer re-sent its own coupon and the app refused it (expected)
//   reuse_accepted: the app accepted a reused coupon (FAIL, app bug)
export async function redeemRosterCoupon({ story, runId, origin, fetchImpl, ledger }) {
  const code = assertCouponCode(story.coupon?.code);
  const result = {
    code_hint: `${code.slice(0, 3)}...${code.slice(-3)}`,
    route: COUPON_ROUTE,
    mode: 'live',
    misuse: story.coupon?.misuse === true,
    misuse_kind: story.coupon?.misuse_kind || '',
    status: 'not-run',
    http_status: null,
    amount_cents: null,
    session_ref: '',
    session_token: '',
    pre_attempts: [],
    reuse: null,
    pass: false,
    detail: '',
  };
  ledger.claim(code, story.story_id);
  if (result.misuse && result.misuse_kind === 'expired-promo') {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      // The expired promo is not a roster coupon: a validate-only request with a code that cannot
      // exist, so nothing is consumed. The app must refuse it; the answer is recorded.
      const fake = { ...couponRequestBody(story, runId), action: 'validate_coupon', couponCode: code.replace('VK-TEST-', 'VK-EXPIRED-') };
      const probe = await post(fetchImpl, origin, fake);
      result.pre_attempts.push({ kind: 'expired-promo-validate', attempt, http_status: probe.status, rejected: probe.data?.ok !== true });
    }
  }
  if (result.pre_attempts.some((row) => row.rejected !== true)) {
    result.status = 'expired-promo-accepted';
    result.detail = 'app accepted a made-up expired promo code';
    ledger.record(code, { story_id: story.story_id, redeemed: false, status: result.status, at: new Date().toISOString() });
    return result;
  }
  const first = await post(fetchImpl, origin, couponRequestBody(story, runId));
  result.http_status = first.status;
  result.amount_cents = first.data?.order?.amountCents ?? null;
  if (first.status >= 200 && first.status < 300 && first.data?.ok === true && first.data?.status === 'coupon_redeemed') {
    if (Number(result.amount_cents) !== 0) {
      result.status = 'charged';
      result.detail = 'coupon redemption returned a non-zero amount';
    } else {
      result.status = 'redeemed';
      result.session_token = String(first.data?.session?.token || '');
      result.session_ref = result.session_token ? shortHash(result.session_token) : '';
      result.pass = Boolean(result.session_token);
      result.detail = result.pass ? 'redeemed $0' : 'redeemed without a session';
    }
  } else {
    result.status = 'rejected';
    result.detail = publicError(first.data) || `http ${first.status}`;
  }
  ledger.record(code, { story_id: story.story_id, redeemed: result.status === 'redeemed', status: result.status, at: new Date().toISOString() });
  if (result.status === 'redeemed' && result.misuse) {
    if (!ledger.allowReuse(story)) throw new Error('refused: coupon reuse without the coupon-misuse flag');
    const again = await post(fetchImpl, origin, couponRequestBody(story, runId));
    const accepted = again.status < 400 && again.data?.ok === true;
    result.reuse = { kind: result.misuse_kind === 'stack' ? 'stack-second-coupon' : 'reuse-same-coupon', http_status: again.status, rejected: !accepted, detail: publicError(again.data) };
    result.status = accepted ? 'reuse_accepted' : 'reuse_rejected';
    result.pass = !accepted;
    result.detail = accepted ? 'app accepted a reused coupon' : 'app rejected the reused coupon';
    ledger.record(code, { reuse_rejected: !accepted });
  }
  return result;
}

// Dry mode: the same request is built and checked (coupon-only path, VK-TEST code, ledger single-use)
// but nothing is sent. The scorecard says sent:false; it never claims the app redeemed anything.
export function dryRosterCoupon({ story, runId, origin, ledger }) {
  const code = assertCouponCode(story.coupon?.code);
  ledger.claim(code, story.story_id);
  const url = new URL(COUPON_ROUTE, origin);
  assertCouponOnlyRequest(url, couponRequestBody(story, runId));
  ledger.record(code, { story_id: story.story_id, redeemed: false, status: 'dry-not-sent', at: new Date().toISOString() });
  return {
    code_hint: `${code.slice(0, 3)}...${code.slice(-3)}`,
    route: COUPON_ROUTE,
    mode: 'dry',
    misuse: story.coupon?.misuse === true,
    misuse_kind: story.coupon?.misuse_kind || '',
    status: 'dry-not-sent',
    sent: false,
    http_status: null,
    amount_cents: null,
    reuse: story.coupon?.misuse === true ? { planned: true, sent: false } : null,
    pass: true,
    detail: 'dry: coupon-only request built and checked; not sent',
  };
}

export function couponCheck(result) {
  if (!result) return { id: 'coupon-redemption', pass: false, detail: 'missing', artifact: 'scorecard.json' };
  return { id: 'coupon-redemption', pass: result.pass === true, detail: `${result.status}: ${result.detail}`.slice(0, 200), artifact: 'scorecard.json' };
}

export function publicCouponResult(result) {
  if (!result) return null;
  const { session_token: _token, ...rest } = result;
  return rest;
}
