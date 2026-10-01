import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import handler from '../api/[...route].mjs';

const catalogEnv = {
  STRIPE_MODE: 'live',
  STRIPE_PUBLISHABLE_KEY: 'pk_live_01234567890123456789012345678901234567890123456789012345678901234567890123456789012',
  TIMESYNCHER_BASE_PRICE_CENTS: '3700',
  TIMESYNCHER_ORDER_BUMP_PRICE_CENTS: '2700',
  TIMESYNCHER_COLLABORATOR_SINGLE_PRICE_CENTS: '2100',
  TIMESYNCHER_MEDIA_PRICE_CENTS: '1700',
  TIMESYNCHER_CHECKOUT_CURRENCY: 'usd',
  TIMESYNCHER_SINGLE_NAME: 'Single vacation',
  TIMESYNCHER_UNLIMITED_NAME: 'Unlimited add-on',
  TIMESYNCHER_COLLABORATOR_NAME: 'Collaborator seat',
  TIMESYNCHER_MEDIA_NAME: 'Photo memories',
};

const saved = {};
for (const key of Object.keys(catalogEnv)) {
  saved[key] = process.env[key];
  process.env[key] = catalogEnv[key];
}
delete process.env.ALLOW_LIVE_STRIPE;

const bundle = await readFile(new URL('../api/[...route].mjs', import.meta.url), 'utf8');
assert.match(bundle, /'checkout-products': checkoutProducts/);

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(payload) { this.body = String(payload || ''); },
  };
}

try {
  const products = mockRes();
  await handler({
    method: 'GET',
    url: '/api/checkout-products',
    headers: {},
    query: { route: ['checkout-products'] },
  }, products);
  assert.equal(products.statusCode, 200, products.body);
  const catalog = JSON.parse(products.body);
  assert.equal(catalog.ok, true);
  assert.equal(catalog.products.single.amount, 3700);
  assert.equal(catalog.products.unlimited.amount, 2700);
  assert.equal(catalog.products.collaborate.amount, 2100);
  assert.equal(catalog.products.media.amount, 1700);

  const config = mockRes();
  await handler({
    method: 'GET',
    url: '/api/checkout-config',
    headers: {},
    query: { route: ['checkout-config'] },
  }, config);
  assert.equal(config.statusCode, 503, config.body);
  assert.match(config.body, /ALLOW_LIVE_STRIPE|Live Stripe is disabled/);
} finally {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log('checkout products live gate passed');
