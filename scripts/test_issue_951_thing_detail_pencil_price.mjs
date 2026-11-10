#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { renderServedTrekBundle } from '../src/vacation/trek-style2-bundle.mjs';
import { budgetLineAmount } from '../apps/vacation-client/src/lib/budgetModel.mjs';
import { buildDetailViewModel } from '../apps/vacation-client/src/lib/detailModel.mjs';

const UPSTREAM_COMMIT = '06e47169699ffdee8accf48e74b0a247a8793ebc^';
const UPSTREAM_PATH = 'public/assets/upstream/index-BKun7ofk.js';
const raw = execFileSync('git', ['show', `${UPSTREAM_COMMIT}:${UPSTREAM_PATH}`], {
  maxBuffer: 25 * 1024 * 1024,
});
const rendered = renderServedTrekBundle(raw.toString('utf8'));
const committed = readFileSync(new URL('../public/assets/index-BKun7ofk.js', import.meta.url), 'utf8');
assert.equal(committed, rendered, 'committed served bundle must match renderServedTrekBundle');

assert.match(rendered, /"data-ts-detail-title-wrap":"1"/);
assert.match(rendered, /"data-ts-detail-edit":"1"/);
assert.match(rendered, /"data-ts-detail-close":"1","aria-label":"Close"/);
assert.match(rendered, /Ce&&!Sa\?n\.jsx\("button",\{"data-ts-detail-edit":"1"/);
assert.match(rendered, /Ce&&Sa&&n\.jsxs\("fieldset",\{"data-shared-readonly":void 0/);
assert.match(rendered, /"data-ts-detail-field":"price"/);
assert.match(rendered, /zt\(Dt\)/);
assert.match(rendered, /bi\(Dt\)/);
assert.doesNotMatch(rendered, /onClick:\(\)=>Ne\(null\),style:\{border:"1px solid #e5e7eb"/);

const storeTrip = {
  trip: {
    currency: 'USD',
    metadata: { dialogParty: { primary: { name: 'Solo' }, collaborators: [] } },
  },
  places: [{ id: 42, name: "Macy's", category_name: 'Store', price: 80 }],
  thingOverrides: { 'place:42': { price: 80 } },
};
const pricing = budgetLineAmount(storeTrip.places[0], storeTrip);
assert.equal(pricing.hasPrice, true);
assert.equal(pricing.amount, 80);
const viewModel = buildDetailViewModel(storeTrip.places[0], storeTrip);
assert.match(viewModel.priceLabel, /^\$80$/);

console.log('issue #951 thing detail pencil + budget price checks passed');
