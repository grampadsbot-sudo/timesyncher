import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import handler from '../api/[...route].mjs';
import { handleKeepsakeOrder, keepsakeFromShared, orderPage, orderErrorPage } from '../routes/keepsake-order.mjs';

const banned = /Las Vegas|Bellagio|Big Island|Price TBD|Carbone|Ulu Ocean|anniversary weekend/i;

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

function get(slug, headers = {}) {
  return {
    method: 'GET',
    url: slug ? `/api/keepsake-order?slug=${encodeURIComponent(slug)}` : '/api/keepsake-order',
    headers,
  };
}

const trip = { title: 'Creek Road Week' };

async function nonOwnerWithKeepsakeUrlCanReachOrderPage() {
  const res = mockRes();
  await handleKeepsakeOrder(get('creek-road-week'), res, {
    lookup: async (slug) => (slug === 'creek-road-week' ? trip : null),
  });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'], /text\/html/);
  assert.match(res.body, /data-keepsake-guest="1"/);
  assert.match(res.body, /data-owner-session="0"/);
  assert.match(res.body, /Opened without the trip owner session/);
  assert.match(res.body, /Anyone with this link can order/);
  assert.match(res.body, /not limited to the customer/);
  assert.match(res.body, /Creek Road Week/);
  assert.match(res.body, /data-keepsake-layout="1"[^>]*src="\/shared\/creek-road-week\/journey\?style=1&amp;printMode=report&amp;pdfReport=keepsake"/);
  assert.match(res.body, /data-keepsake-layout="2"[^>]*src="\/shared\/creek-road-week\/journey\?style=2&amp;printMode=report&amp;pdfReport=keepsake-style-2"/);
  assert.doesNotMatch(res.body, /data-keepsake-error/);
  assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
}

function frameOptionsFor(headers, pathname) {
  const path = String(pathname || '').split('?')[0];
  let value = null;
  for (const rule of headers) {
    if (!new RegExp(`^${rule.source}$`).test(path)) continue;
    const frame = rule.headers.find((header) => header.key.toLowerCase() === 'x-frame-options');
    if (frame) value = frame.value;
  }
  return value;
}

// Vercel writes vercel.json headers onto the response, then the function's
// setHeader replaces the same key. A keepsake-order header wins; other routes do not set one.
function deliveredFrame(platform, responseHeader) {
  return responseHeader || platform;
}

async function keepsakeOrderSendsSameOriginAndOtherPathsStayDeny() {
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const defaultFrame = 'DENY';
  assert.deepEqual(vercel.headers.map((rule) => [rule.source, rule.headers.find((header) => header.key === 'X-Frame-Options')?.value]), [['/(.*)', defaultFrame]]);
  assert.equal(JSON.stringify(vercel).includes('SAMEORIGIN'), false);

  const order = mockRes();
  await handleKeepsakeOrder(get('creek-road-week'), order, { lookup: async () => trip });
  assert.equal(order.headers['x-frame-options'], 'SAMEORIGIN');
  const missing = mockRes();
  await handleKeepsakeOrder(get(''), missing, { lookup: async () => trip });
  assert.equal(missing.headers['x-frame-options'], 'SAMEORIGIN');
  const denied = mockRes();
  await handleKeepsakeOrder({ method: 'POST', url: '/api/keepsake-order?slug=creek-road-week', headers: {} }, denied, { lookup: async () => trip });
  assert.equal(denied.statusCode, 405);
  assert.equal(denied.headers['x-frame-options'], 'SAMEORIGIN');

  const otherPaths = [
    '/',
    '/api/keepsake-order',
    '/api/bind-thing-media',
    '/api/pdf/qr.svg',
    '/api/pdf/shared/token/report/keepsake.pdf',
    '/api/shared/token',
    '/shared/token/journey',
    '/shared/token/report/daily',
    '/shared/token/report/keepsake',
    '/shared/token',
    '/api/vacation-web-access',
    '/icons/token',
    '/manifest.webmanifest',
    '/accept/token',
    '/api/version',
    '/api/checkout-config',
    '/order-test.html',
    '/vacation-app.html',
    '/shared-app.html',
  ];
  for (const pathname of otherPaths) {
    assert.equal(frameOptionsFor(vercel.headers, pathname), defaultFrame, pathname);
  }
  assert.equal(deliveredFrame(frameOptionsFor(vercel.headers, '/api/keepsake-order'), order.headers['x-frame-options']), 'SAMEORIGIN');

  const version = mockRes();
  await handler({ method: 'GET', url: '/api/version', headers: {}, query: { route: ['version'] } }, version);
  assert.equal(version.statusCode, 200);
  assert.equal(version.headers['x-frame-options'], undefined);
  assert.equal(deliveredFrame(frameOptionsFor(vercel.headers, '/api/version'), version.headers['x-frame-options']), defaultFrame);

  const routeDir = new URL('../routes/', import.meta.url);
  for (const name of await readdir(routeDir)) {
    if (!name.endsWith('.mjs')) continue;
    const text = await readFile(new URL(name, routeDir), 'utf8');
    if (name === 'keepsake-order.mjs') {
      assert.match(text, /x-frame-options',\s*'SAMEORIGIN'/);
    } else {
      assert.doesNotMatch(text, /x-frame-options/i);
      assert.doesNotMatch(text, /SAMEORIGIN/);
    }
  }
}

async function invalidTokenGivesErrorState() {
  const missing = mockRes();
  let lookups = 0;
  await handleKeepsakeOrder(get(''), missing, {
    lookup: async () => { lookups += 1; return trip; },
  });
  assert.equal(missing.statusCode, 400);
  assert.match(missing.body, /data-keepsake-error="invalid"/);
  assert.match(missing.body, /This keepsake link is not valid/);
  assert.equal(lookups, 0);
  assert.doesNotMatch(missing.body, /<iframe/i);
  assert.doesNotMatch(missing.body, /\/shared\//);
  assert.doesNotMatch(missing.body, banned);

  const unknown = mockRes();
  await handleKeepsakeOrder(get('not-a-trip'), unknown, { lookup: async () => null });
  assert.equal(unknown.statusCode, 404);
  assert.match(unknown.body, /data-keepsake-error="invalid"/);
  assert.doesNotMatch(unknown.body, /not-a-trip/);
  assert.doesNotMatch(unknown.body, /<iframe/i);
  assert.doesNotMatch(unknown.body, /Anyone with this link/);
  assert.doesNotMatch(unknown.body, banned);

  const broken = mockRes();
  await handleKeepsakeOrder(get('creek-road-week'), broken, {
    lookup: async () => { throw new Error('lookup failed'); },
  });
  assert.equal(broken.statusCode, 404);
  assert.match(broken.body, /data-keepsake-error="invalid"/);
  assert.equal(orderErrorPage(), unknown.body);
  assert.equal(keepsakeFromShared({ error: 'Invalid or expired link', places: [{ name: 'Filled Place' }] }), null);
  assert.equal(keepsakeFromShared({ places: [{ name: 'Filled Place' }] }), null);
  assert.deepEqual(keepsakeFromShared({ trip: { id: 4, title: 'Creek Road Week' }, places: [] }), { title: 'Creek Road Week' });
}

async function noPriceOrPaymentStepRequired() {
  const page = mockRes();
  await handleKeepsakeOrder(get('creek-road-week'), page, { lookup: async () => trip });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /data-payment-later="1"/);
  assert.match(page.body, /Payment coming later/);
  assert.doesNotMatch(page.body, /<form[\s>]/i);
  assert.doesNotMatch(page.body, /price/i);
  assert.doesNotMatch(page.body, /\$/);
  assert.doesNotMatch(page.body, /Price TBD/i);
  assert.doesNotMatch(page.body, /stripe/i);
  assert.doesNotMatch(page.body, /card number/i);
  assert.doesNotMatch(page.body, /Place keepsake order/i);
  assert.doesNotMatch(page.body, /data-keepsake-order-action/);
  assert.doesNotMatch(page.body, /Checkout and payment/);
}

async function noHardCodedContent() {
  const orderSource = await readFile(new URL('../routes/keepsake-order.mjs', import.meta.url), 'utf8');
  const shell = await readFile(new URL('../shared-app.html', import.meta.url), 'utf8');
  const link = shell.slice(shell.indexOf('data-keepsake-order') - 400, shell.indexOf('data-keepsake-order') + 80);
  assert.match(link, /Order Keepsakes/);
  assert.match(link, /\/api\/keepsake-order\?slug=/);
  assert.doesNotMatch(orderSource, banned);
  assert.doesNotMatch(link, banned);
  const rendered = orderPage('creek-road-week', 'Creek Road Week', '');
  assert.match(rendered, /Creek Road Week/);
  assert.doesNotMatch(rendered, banned);
  const untitled = orderPage('creek-road-week', '', '');
  assert.match(untitled, /this trip/);
  assert.doesNotMatch(untitled, banned);
  assert.doesNotMatch(orderErrorPage(), banned);
}

await nonOwnerWithKeepsakeUrlCanReachOrderPage();
await invalidTokenGivesErrorState();
await noPriceOrPaymentStepRequired();
await noHardCodedContent();
await keepsakeOrderSendsSameOriginAndOtherPathsStayDeny();

console.log('keepsake order buy link ok');
console.log('non-owner with the keepsake URL can reach the order page');
console.log('invalid token gives the error state');
console.log('no price or payment step is required');
console.log('no hard-coded place, thing, dialog, or price copy');
console.log('keepsakeOrderSendsSameOriginAndOtherPathsStayDeny');
