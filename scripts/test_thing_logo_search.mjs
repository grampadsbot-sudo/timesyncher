import assert from 'node:assert/strict';

import handler from '../routes/thing-logo.mjs';
import { clearPoiCache } from '../src/vacation/poi-search.mjs';
import { pickThingLogo, thingLogoQuery } from '../src/vacation/thing-logo-search.mjs';

assert.equal(thingLogoQuery({ name: 'Sample Inn', city: 'Sample City', kind: 'hotel' }), 'Sample Inn Sample City official site');
assert.equal(thingLogoQuery({ name: 'Sample Air 100 A → B', city: 'Sample City', kind: 'flight' }), 'Sample official site');
assert.equal(thingLogoQuery({ name: '' }), '');

const results = [
  { url: 'https://www.tripadvisor.com/Hotel_Review-sample', profile: { img: 'https://imgs.example.test/ta.png' } },
  { url: 'https://news.example.test/best-hotels', profile: { img: 'https://imgs.example.test/news.png' } },
  { url: 'https://www.harborinnhotel.test/rooms', profile: { img: 'https://imgs.example.test/inn.png' } },
];
assert.deepEqual(pickThingLogo(results, { name: 'Harbor Inn Hotel', city: 'Sample City' }), {
  logoUrl: 'https://imgs.example.test/inn.png',
  site: 'https://harborinnhotel.test/',
  matchedName: true,
});
assert.equal(pickThingLogo([{ url: 'https://www.yelp.com/biz/x' }], { name: 'X Place' }), null);
assert.equal(pickThingLogo([{ url: 'https://www.cornershop.test/' }], { name: 'Corner Shop' }).logoUrl, 'https://cornershop.test/favicon.ico');

function fakeRes() {
  const headers = {};
  return {
    statusCode: 0,
    body: '',
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    end(text) { this.body = text; },
    headers,
  };
}

clearPoiCache();
let calls = 0;
const fetchImpl = async (url, init) => {
  calls += 1;
  assert.match(url, /api\.search\.brave\.com\/res\/v1\/web\/search\?count=8&q=Harbor%20Inn%20Sample%20City%20official%20site/);
  assert.equal(init.headers['X-Subscription-Token'], 'test-key');
  return { ok: true, json: async () => ({ web: { results } }) };
};
const res = fakeRes();
await handler({ method: 'GET', url: '/api/thing-logo?name=Harbor%20Inn&city=Sample%20City&kind=hotel' }, res, { env: { BRAVE_SEARCH_API_KEY: 'test-key' }, fetchImpl });
const body = JSON.parse(res.body);
assert.equal(res.statusCode, 200);
assert.equal(body.logoUrl, 'https://imgs.example.test/inn.png');
assert.equal(res.headers['cache-control'], 'public, max-age=86400');
await handler({ method: 'GET', url: '/api/thing-logo?name=Harbor%20Inn&city=Sample%20City&kind=hotel' }, fakeRes(), { env: { BRAVE_SEARCH_API_KEY: 'test-key' }, fetchImpl });
assert.equal(calls, 1, 'second lookup is served from cache');

const noKey = fakeRes();
await handler({ method: 'GET', url: '/api/thing-logo?name=Other%20Inn' }, noKey, { env: {}, fetchImpl: async () => { throw new Error('should not fetch'); } });
assert.equal(JSON.parse(noKey.body).logoUrl, '');

const missing = fakeRes();
await handler({ method: 'GET', url: '/api/thing-logo' }, missing, { env: {} });
assert.equal(missing.statusCode, 400);

console.log('thing logo search tests passed');
