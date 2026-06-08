export function stripeMode(env = process.env) {
  return String(env.STRIPE_MODE || env.TIMESYNCHER_STRIPE_MODE || 'test').trim().toLowerCase();
}

function keyPrefixForMode(mode, kind) {
  if (mode === 'test') return kind === 'publishable' ? 'pk_test_' : 'sk_test_';
  if (mode === 'live') return kind === 'publishable' ? 'pk_live_' : 'sk_live_';
  return null;
}

export function validateStripeKey({ key, kind, env = process.env }) {
  const mode = stripeMode(env);
  const expectedPrefix = keyPrefixForMode(mode, kind);
  if (!expectedPrefix) {
    throw new Error('Invalid STRIPE_MODE. Use "test" or "live".');
  }
  if (!key) {
    throw new Error(`Stripe ${kind} key is not configured yet.`);
  }
  if (!key.startsWith(expectedPrefix)) {
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
