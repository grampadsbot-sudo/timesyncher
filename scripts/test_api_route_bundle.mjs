import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import handler, { publicApiRequest } from '../api/[...route].mjs';
import { orderPage } from '../routes/keepsake-order.mjs';

const apiFiles = (await readdir(new URL('../api/', import.meta.url))).filter((name) => name.endsWith('.mjs'));
assert.deepEqual(apiFiles, ['[...route].mjs']);

function mockRes() {
  const headers = {};
  return {
    headers,
    statusCode: 0,
    body: '',
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    end(payload) { this.body = String(payload || ''); },
  };
}

const version = mockRes();
await handler({ method: 'GET', url: '/api/version', headers: {}, query: { route: ['version'] } }, version);
assert.equal(version.statusCode, 200);
assert.match(version.body, /"ok":true/);

const versionQueryOnly = mockRes();
await handler({ method: 'GET', url: '/', headers: {}, query: { route: ['version'] } }, versionQueryOnly);
assert.equal(versionQueryOnly.statusCode, 200);

const missing = mockRes();
await handler({ method: 'GET', url: '/api/not-a-route', headers: {}, query: { route: ['not-a-route'] } }, missing);
assert.equal(missing.statusCode, 404);

const stripe = mockRes();
await handler({ method: 'GET', url: '/api/stripe-webhook', headers: {}, query: { route: ['stripe-webhook'] } }, stripe);
assert.equal(stripe.statusCode, 405);

const catchAllQuery = mockRes();
await handler({
  method: 'GET',
  url: '/api/[...route]?...route=version',
  headers: {},
  query: { '...route': 'version' },
}, catchAllQuery);
assert.equal(catchAllQuery.statusCode, 200);
assert.match(catchAllQuery.body, /"ok":true/);

const qr = mockRes();
await handler({
  method: 'GET',
  url: '/api/[...route]?...route=pdf/qr.svg&data=/shared/las-vegas-vacation-3',
  headers: {},
  query: { '...route': 'pdf/qr.svg', data: '/shared/las-vegas-vacation-3' },
}, qr);
assert.equal(qr.statusCode, 200);
assert.match(qr.headers['content-type'], /image\/svg\+xml/);

const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
assert.equal(vercel.git.deploymentEnabled['cursor/*'], false);
assert.equal(vercel.git.deploymentEnabled['cursor/**'], false);
assert.equal(Object.keys(vercel.functions).join(','), 'api/[...route].mjs');
assert.ok(!vercel.routes.some((route) => String(route.src).includes('/assets/')));
assert.ok(vercel.routes.some((route) => route.src === '/api/(.*)' && route.dest === '/api/[...route]?...route=$1'));

function builderSrc(src) {
  return src.startsWith('^') ? src : `^${src}$`;
}

function firstRoute(pathname) {
  for (const route of vercel.routes) {
    const match = pathname.match(new RegExp(builderSrc(route.src)));
    if (match) return { route, match };
  }
  return null;
}

function destUrl(route, match, search = '') {
  const dest = route.dest.replace(/\$(\d+)/g, (_, index) => match[Number(index)] ?? '');
  const url = new URL(dest, 'https://timesyncher.com');
  const original = new URLSearchParams(search);
  for (const [key, value] of original) {
    if (!url.searchParams.has(key)) url.searchParams.append(key, value);
  }
  return `${url.pathname}${url.search}`;
}

const former = [
  { path: '/api/admin-onboardings', handler: 'admin-onboardings' },
  { path: '/api/checkout-config', handler: 'checkout-config' },
  { path: '/api/checkout-coupon', handler: 'checkout-coupon' },
  { path: '/api/create-payment-intent', handler: 'create-payment-intent' },
  { path: '/api/eula?action=accept-page&sessionId=sess', handler: 'eula', url: '/api/eula?action=accept-page&sessionId=sess' },
  { path: '/api/onboarding-session', handler: 'onboarding-session' },
  { path: '/api/stripe-webhook', handler: 'stripe-webhook' },
  { path: '/api/track-click', handler: 'track-click' },
  { path: '/api/vacation-itinerary?app=1', handler: 'vacation-itinerary', url: '/api/vacation-itinerary?app=1' },
  { path: '/api/vacation-request', handler: 'vacation-request' },
  { path: '/api/version', handler: 'version' },
  { path: '/api/keepsake-order?slug=intake-example', handler: 'keepsake-order' },
  { path: '/api/worker-jobs', handler: 'worker-jobs' },
  { path: '/api/bind-thing-media', handler: 'bind-thing-media', includes: 'mediaBind=1' },
  { path: '/api/vacation-web-access', handler: 'vacation-web-access', includes: 'webAccess=1' },
  { path: '/api/pdf/qr.svg', handler: 'pdf', includes: 'pdfQr=1' },
  { path: '/api/pdf/shared/las-vegas-vacation-3/report/restaurants.pdf', handler: 'pdf', includes: 'pdfPath=las-vegas-vacation-3' },
  { path: '/api/shared/las-vegas-vacation-3', handler: 'shared', includes: 'trekPath=las-vegas-vacation-3' },
  { path: '/api/shared/las-vegas-vacation-3/audio-note', handler: 'shared', includes: 'trekPath=las-vegas-vacation-3' },
  { path: '/api/shared-trip/las-vegas-vacation-3', handler: 'shared-trip', url: '/api/shared-trip/las-vegas-vacation-3' },
  { path: '/accept/sess_123', handler: 'eula', includes: 'sessionId=sess_123' },
  { path: '/shared/las-vegas-vacation-3/report/restaurants', handler: 'pdf', includes: 'shareToken=las-vegas-vacation-3' },
];

for (const probe of former) {
  const pathname = probe.path.split('?')[0];
  const search = probe.path.includes('?') ? probe.path.slice(probe.path.indexOf('?') + 1) : '';
  const found = firstRoute(pathname);
  assert.ok(found, `no vercel route for ${probe.path}`);
  assert.match(found.route.dest, /^\/api\/\[\.\.\.route\]/, `${probe.path} dest ${found.route.dest}`);
  const invoked = destUrl(found.route, found.match, search);
  const described = publicApiRequest({ method: 'GET', url: invoked, headers: {}, query: Object.fromEntries(new URL(invoked, 'https://timesyncher.com').searchParams) });
  assert.equal(described.handler, probe.handler, `${probe.path} -> ${described.handler} via ${described.url}`);
  if (probe.url) assert.equal(described.url, probe.url, probe.path);
  if (probe.includes) assert.match(described.url, new RegExp(probe.includes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), described.url);
}

assert.equal(firstRoute('/assets/index-BKun7ofk.js'), null);
assert.equal(firstRoute('/assets/index-CbEHlMj6.css'), null);
assert.equal(firstRoute('/shared/las-vegas-vacation-3').route.dest, '/shared-app.html');
assert.equal(firstRoute('/'), null);

const link = orderPage('intake-example', 'Big Island Family', '');
assert.match(link, /Anyone with this link can order/);
assert.match(link, /not limited to the customer/);
assert.match(link, /Opened without the trip owner session/);
assert.match(link, /data-owner-session="0"/);
const ownerLink = orderPage('intake-example', 'Big Island Family', '', { ownerSession: true });
assert.match(ownerLink, /data-owner-session="1"/);
assert.doesNotMatch(ownerLink, /Opened without the trip owner session/);
assert.doesNotMatch(link, /Place keepsake order/);
assert.doesNotMatch(link, /<form/i);
assert.doesNotMatch(link, /data-keepsake-order-action/);
assert.doesNotMatch(link, /Checkout and payment/);
assert.doesNotMatch(link, /card number/i);

console.log('api route bundle ok');
