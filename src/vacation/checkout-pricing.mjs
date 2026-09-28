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

function requiredOrderBumpCents(value) {
  return requiredConfigCents(value, 'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS');
}

export function checkoutCurrency(env = process.env) {
  return String(env.TIMESYNCHER_CHECKOUT_CURRENCY || 'usd').trim().toLowerCase() || 'usd';
}

export function checkoutAmounts(env = process.env) {
  return {
    base: intFromEnv(env.TIMESYNCHER_BASE_PRICE_CENTS, DEFAULT_BASE_PRICE_CENTS),
    orderBump: requiredOrderBumpCents(env.TIMESYNCHER_ORDER_BUMP_PRICE_CENTS),
    photoMemoriesSingle: intFromEnv(
      env.TIMESYNCHER_PHOTO_MEMORIES_SINGLE_PRICE_CENTS || env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS,
      DEFAULT_PHOTO_MEMORIES_PRICE_CENTS,
    ),
    photoMemoriesUnlimited: intFromEnv(
      env.TIMESYNCHER_PHOTO_MEMORIES_UNLIMITED_PRICE_CENTS || env.TIMESYNCHER_PHOTO_MEMORIES_PRICE_CENTS,
      DEFAULT_PHOTO_MEMORIES_PRICE_CENTS,
    ),
  };
}

export function checkoutOrderSummary({ orderBump = false, photoMemories = false } = {}, env = process.env) {
  const amounts = checkoutAmounts(env);
  const bumped = Boolean(orderBump);
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
