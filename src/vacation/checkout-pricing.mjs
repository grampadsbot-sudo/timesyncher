export class CheckoutConfigError extends Error {
  constructor(configName) {
    super(`checkout config missing: ${configName}`);
    this.name = 'CheckoutConfigError';
    this.configName = configName;
  }
}

export function requiredConfigCents(value, configName) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new CheckoutConfigError(configName);
  return parsed;
}

export function optionalConfigCents(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function requiredConfigText(value, configName) {
  const text = String(value ?? '').trim();
  if (!text) throw new CheckoutConfigError(configName);
  return text;
}

const CHECKOUT_PLAN_IDS = Object.freeze([
  'single',
  'unlimited',
  'owner_media',
  'telegram_collaborators_single_trip',
]);

export const CHECKOUT_PRICE_CONFIG = [
  'TIMESYNCHER_BASE_PRICE_CENTS',
  'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS',
  'TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS',
  'TIMESYNCHER_MEDIA_PRICE_CENTS',
];

const CHECKOUT_LABEL_CONFIG = [
  'TIMESYNCHER_SINGLE_NAME',
  'TIMESYNCHER_UNLIMITED_NAME',
  'TIMESYNCHER_COLLABORATOR_NAME',
  'TIMESYNCHER_MEDIA_NAME',
];

export function checkoutConfigHealth(env = process.env) {
  const missing = CHECKOUT_PRICE_CONFIG.filter((name) => optionalConfigCents(env?.[name]) == null);
  for (const name of CHECKOUT_LABEL_CONFIG) {
    if (!String(env?.[name] ?? '').trim()) missing.push(name);
  }
  return { ok: missing.length === 0, missing };
}

export function logCheckoutConfig(env = process.env) {
  const health = checkoutConfigHealth(env);
  if (!health.ok) console.error(`checkout config missing: ${health.missing.join(', ')}`);
  return health;
}

export function customerCheckoutFailure(error) {
  if (error?.name !== 'CheckoutConfigError') return error;
  console.error(error.message);
  const customer = new Error('Checkout is not available right now.');
  customer.statusCode = 503;
  return customer;
}

export function checkoutCurrency(env = process.env) {
  return String(env.TIMESYNCHER_CHECKOUT_CURRENCY || 'usd').trim().toLowerCase() || 'usd';
}

export function checkoutPlanFromMetadata(metadata = {}) {
  const plan = String(metadata?.plan ?? '').trim();
  if (plan === 'owner_media_single_vacation' || plan === 'owner_media_unlimited_vacations') return 'owner_media';
  if (CHECKOUT_PLAN_IDS.includes(plan)) return plan;
  if (metadata?.order_bump === true || String(metadata?.order_bump) === 'true') return 'unlimited';
  const product = String(metadata?.product || '').trim();
  if (product === 'timesyncher_vacation_unlimited') return 'unlimited';
  if (product === 'timesyncher_vacation_single') return 'single';
  if (product === 'timesyncher_vacation_owner_media_addons') return 'owner_media';
  if (product === 'timesyncher_vacation_telegram_collaborator') return 'telegram_collaborators_single_trip';
  return 'single';
}

export function checkoutAmounts(env = process.env, { orderBump = true } = {}) {
  const amounts = {
    base: requiredConfigCents(env?.TIMESYNCHER_BASE_PRICE_CENTS, 'TIMESYNCHER_BASE_PRICE_CENTS'),
    media: requiredConfigCents(env?.TIMESYNCHER_MEDIA_PRICE_CENTS, 'TIMESYNCHER_MEDIA_PRICE_CENTS'),
  };
  if (orderBump) amounts.orderBump = requiredConfigCents(env?.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS, 'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS');
  return amounts;
}

export function checkoutChargeDisplay({ amountCents, coupon = false, missingKey = 'TIMESYNCHER_BASE_PRICE_CENTS' } = {}) {
  const amount = Number(amountCents);
  if (!Number.isInteger(amount) || amount <= 0) throw new CheckoutConfigError(missingKey);
  if (coupon) return { totalCents: 0, waivedCents: amount };
  return { totalCents: amount, waivedCents: 0 };
}

export function checkoutOrderSummary({ orderBump = false, photoMemories = false, media = false } = {}, env = process.env) {
  const bumped = Boolean(orderBump);
  const mediaSelected = Boolean(media || photoMemories);
  const amounts = checkoutAmounts(env, { orderBump: bumped });
  const mediaAmount = mediaSelected ? amounts.media : 0;
  const amountCents = amounts.base + (bumped ? amounts.orderBump : 0) + mediaAmount;
  return {
    amountCents,
    currency: checkoutCurrency(env),
    plan: bumped ? 'unlimited' : 'single',
    orderBump: bumped,
    photoMemories: mediaSelected,
    media: mediaSelected,
    photoMemoriesPlan: mediaSelected ? 'owner_media' : null,
    mediaPlan: mediaSelected ? 'owner_media' : null,
  };
}
