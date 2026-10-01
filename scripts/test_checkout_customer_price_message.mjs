import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const client = await readFile(new URL('../public/checkout-price-client.js', import.meta.url), 'utf8');
const sandbox = { console, globalThis: {} };
vm.createContext(sandbox);
vm.runInContext(`${client}\nglobalThis.__client = { TS_PRICING_UNAVAILABLE, tsPricedCents };`, sandbox);
const { TS_PRICING_UNAVAILABLE, tsPricedCents } = sandbox.globalThis.__client;

assert.throws(() => tsPricedCents(null, 'TIMESYNCHER_BASE_PRICE_CENTS'), (error) => {
  assert.equal(error.message, TS_PRICING_UNAVAILABLE);
  return true;
});

const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const orderTest = await readFile(new URL('../order-test.html', import.meta.url), 'utf8');
const ownerMedia = await readFile(new URL('../owner-media-checkout.html', import.meta.url), 'utf8');
assert.match(index, /tsPricedCents\(/);
assert.doesNotMatch(index, /throw new Error\('checkout config missing:/);
assert.match(orderTest, /tsPricedCents\(/);
assert.match(ownerMedia, /PRICING_UNAVAILABLE/);
assert.doesNotMatch(ownerMedia, /setStatus\('checkout config missing:/);

console.log('checkout customer price message passed');
