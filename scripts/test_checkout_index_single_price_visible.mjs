#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexPage = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const singlePriceMatches = [...indexPage.matchAll(/id="singlePrice"/g)];
assert.equal(singlePriceMatches.length, 1, 'expected exactly one #singlePrice');
assert.doesNotMatch(indexPage, /id="step2"[^>]*>[\s\S]*id="singlePrice"/, '#singlePrice must not live only inside hidden step 2');
assert.match(indexPage, /checkout-step-one-price[\s\S]*id="singlePrice"/, 'step-one price block should expose #singlePrice before payment step');
assert.match(indexPage, /\/checkout-price-client\.js/);
assert.match(indexPage, /tsBootCheckoutCatalog/);
assert.match(indexPage, /TIMESYNCHER_BASE_PRICE_CENTS/);

console.log('test_checkout_index_single_price_visible: ok');
