import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const frame = vercel.headers.flatMap((rule) => rule.headers).find((header) => header.key === 'X-Frame-Options');
  assert.equal(frame.value, 'SAMEORIGIN');
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

console.log('keepsake order buy link ok');
console.log('non-owner with the keepsake URL can reach the order page');
console.log('invalid token gives the error state');
console.log('no price or payment step is required');
console.log('no hard-coded place, thing, dialog, or price copy');
