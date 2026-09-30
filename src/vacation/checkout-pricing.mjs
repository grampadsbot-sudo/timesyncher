const DEFAULT_BASE_PRICE_CENTS = 3700;
const DEFAULT_PHOTO_MEMORIES_PRICE_CENTS = 500;

export class CheckoutConfigError extends Error {
  constructor(configName) {
    super(`checkout config missing: ${configName}`);
    this.name = 'CheckoutConfigError';
    this.configName = configName;
  }
}

function intFromEnv(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
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

export const CHECKOUT_PRICE_CONFIG = [
  'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS',
  'TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS',
  'TIMESYNCHER_COLLABORATOR_VIDEO_UNLIMITED_PRICE_CENTS',
];

export function checkoutConfigHealth(env = process.env) {
  const missing = CHECKOUT_PRICE_CONFIG.filter((name) => optionalConfigCents(env?.[name]) == null);
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

function requiredOrderBumpCents(value) {
  return requiredConfigCents(value, 'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS');
}

export function checkoutCurrency(env = process.env) {
  return String(env.TIMESYNCHER_CHECKOUT_CURRENCY || 'usd').trim().toLowerCase() || 'usd';
}

export function checkoutAmounts(env = process.env, { orderBump = true } = {}) {
  const amounts = {
    base: intFromEnv(env.TIMESYNCHER_BASE_PRICE_CENTS, DEFAULT_BASE_PRICE_CENTS),
    photoMemoriesSingle: intFromEnv(
      env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_CENTS || env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS,
      DEFAULT_PHOTO_MEMORIES_PRICE_CENTS,
    ),
    photoMemoriesUnlimited: intFromEnv(
      env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS || env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS,
      DEFAULT_PHOTO_MEMORIES_PRICE_CENTS,
    ),
  };
  if (orderBump) amounts.orderBump = requiredOrderBumpCents(env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS);
  return amounts;
}

export function checkoutOrderSummary({ orderBump = false, photoMemories = false } = {}, env = process.env) {
  const bumped = Boolean(orderBump);
  const amounts = checkoutAmounts(env, { orderBump: bumped });
  const photos = Boolean(photoMemories);
  const photoAmount = photos ? (bumped ? amounts.photoMemoriesUnlimited : amounts.photoMemoriesSingle) : 0;
  const amountCents = amounts.base + (bumped ? amounts.orderBump : 0) + photoAmount;
  return {
    amountCents,
    currency: checkoutCurrency(env),
    plan: bumped ? 'unlimited' : 'single',
    orderBump: bumped,
    photoMemories: photos,
    photoMemoriesPlan: photos ? (bumped ? 'unlimited' : 'single') : null,
  };
}
