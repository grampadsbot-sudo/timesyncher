export function stripeMode(env = process.env) {
  return String(env.STRIPE_MODE || env.TIMESYNCHER_STRIPE_MODE || 'test').trim().toLowerCase();
}

function keyPrefixForMode(mode, kind) {
  if (mode === 'test') return kind === 'publishable' ? 'pk_test_' : 'sk_test_';
  if (mode === 'live') return kind === 'publishable' ? 'pk_live_' : 'sk_live_';
  return null;
}

function allowedPrefixesForMode(mode, kind) {
  const standard = keyPrefixForMode(mode, kind);
  if (!standard) return null;
  if (kind === 'secret') return mode === 'test' ? ['sk_test_', 'rk_test_'] : ['sk_live_', 'rk_live_'];
  return [standard];
}

export function validateStripeKey({ key, kind, env = process.env }) {
  const mode = stripeMode(env);
  const expectedPrefixes = allowedPrefixesForMode(mode, kind);
  if (!expectedPrefixes) {
    throw new Error('Invalid STRIPE_MODE. Use "test" or "live".');
  }
  if (!key) {
    throw new Error(`Stripe ${kind} key is not configured yet.`);
  }
  if (!expectedPrefixes.some((prefix) => key.startsWith(prefix))) {
    throw new Error(`Stripe ${kind} key does not match STRIPE_MODE=${mode}.`);
  }
  if (mode === 'live' && env.ALLOW_LIVE_STRIPE !== 'true') {
    throw new Error('Live Stripe is disabled. Set ALLOW_LIVE_STRIPE=true only for real paid checkout.');
  }
  return { mode, key };
}

export function stripeSecretKey(env = process.env) {
  const key = env.STRIPE_SECRET_KEY || '';
  return validateStripeKey({ key, kind: 'secret', env });
}

export function stripePublishableKey(env = process.env) {
  const key = env.STRIPE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  return validateStripeKey({ key, kind: 'publishable', env });
}

export function harnessCheckoutRequest(req) {
  return String(req?.headers?.['x-timesyncher-harness-checkout'] || '').trim() === '1';
}

function harnessStripeEnv(env) {
  return { ...env, STRIPE_MODE: 'test', TIMESYNCHER_STRIPE_MODE: 'test' };
}

export function harnessStripePublishableKey(env = process.env) {
  return validateStripeKey({ key: env.STRIPE_TEST_PUBLISHABLE_KEY || '', kind: 'publishable', env: harnessStripeEnv(env) });
}

export function harnessStripeSecretKey(env = process.env) {
  return validateStripeKey({ key: env.STRIPE_TEST_SECRET_KEY || '', kind: 'secret', env: harnessStripeEnv(env) });
}

export function harnessTestPriceEnv(env = process.env) {
  const next = { ...env };
  const map = [
    ['TIMESYNCHER_TEST_BASE_PRICE_CENTS', 'TIMESYNCHER_BASE_PRICE_CENTS'],
    ['TIMESYNCHER_TEST_ORDER_BUMP_PRICE_CENTS', 'TIMESYNCHER_ORDER_BUMP_PRICE_CENTS'],
    ['TIMESYNCHER_TEST_COLLABORATOR_SINGLE_PRICE_CENTS', 'TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS'],
    ['TIMESYNCHER_TEST_MEDIA_PRICE_CENTS', 'TIMESYNCHER_MEDIA_PRICE_CENTS'],
  ];
  for (const [from, to] of map) {
    if (String(env[from] || '').trim()) next[to] = env[from];
  }
  return next;
}

export function harnessTestPriceId(env, name) {
  const key = `TIMESYNCHER_TEST_${name}`;
  const value = String(env?.[key] || '').trim();
  if (!value) {
    const error = new Error(`Stripe test price is not configured yet: ${key}`);
    error.statusCode = 503;
    throw error;
  }
  return value;
}
