#!/usr/bin/env node
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildScorecard } from './harness/scorecard.mjs';
import { buildCustomerPdf } from './harness/onboarding-pdf.mjs';
import { captureOnboardingPdf, purchaseEmailSurface, showPaymentStep, submitTestCard, walkOnboardingWidth } from './harness/onboarding-capture.mjs';
import {
  ONBOARDING_SCREENS,
  ONBOARDING_WIDTHS,
  assessOnboardingScreens,
  onboardingLabel,
  shotBlank,
} from './harness/onboarding-screens.mjs';

function crc32(bytes) {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function encodePng(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const start = y * (width * 3 + 1);
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = paint(x, y);
      const index = start + 1 + x * 3;
      raw[index] = red;
      raw[index + 1] = green;
      raw[index + 2] = blue;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const varied = encodePng(16, 16, (x, y) => ((x + y) % 2 ? [20, 40, 60] : [200, 180, 20]));
const solid = encodePng(16, 16, () => [240, 240, 240]);
assert.equal(shotBlank(varied), false);
assert.equal(shotBlank(solid), true);
assert.equal(shotBlank(Buffer.alloc(0)), true);

const surface = purchaseEmailSurface({ firstName: 'Avery', displayName: 'Avery Hale' }, 'throwaway-session');
assert.equal(surface.gap, '');
assert.match(surface.html, /Open Vacay Keepsake/);
assert.match(surface.launchUrl, /\/vacation-app\.html\?session=throwaway-session/);

await assert.rejects(
  () => showPaymentStep({ async evaluate() { return false; }, async click() {}, async waitForSelector() {} }),
  /stripe is not test mode/,
);
await assert.rejects(
  () => submitTestCard({ frames() { return []; }, mainFrame() { return {}; }, async click() { throw new Error('paid'); } }),
  /stripe test card field was not on the page/,
);

function fakePage() {
  const events = [];
  const page = {
    _url: 'https://vacation-staging.timesyncher.com/',
    async setViewportSize() {},
    async goto(next) { this._url = next; events.push(`goto ${next}`); },
    async waitForSelector() {},
    async waitForURL() {},
    async waitForFunction() {},
    async fill() {},
    async click(selector) { events.push(selector); },
    async setContent(html) { events.push(`content ${html.includes('Open Vacay Keepsake')}`); },
    url() { return this._url; },
    async screenshot({ path: file }) {
      fs.writeFileSync(file, varied);
      events.push('shot');
    },
    locator() { return { innerText: async () => 'Welcome. Purchase confirmed. Step 1: Contact Info.' }; },
  };
  return { page, events };
}

const origin = 'https://vacation-staging.timesyncher.com';
const customer = { name: 'Avery Hale', email: 'avery-onboard@harness.invalid' };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-pdf-'));
const walked = [];
for (const width of ONBOARDING_WIDTHS) {
  const made = fakePage();
  const result = await walkOnboardingWidth({
    page: made.page,
    origin,
    customer,
    width,
    outDir: dir,
    showPayment: async (page) => { await page.click('#continueBtn'); },
    submitPayment: async (page) => {
      await page.click('#payBtn');
      page._url = `${origin}/order-success.html?session=throwaway-session`;
    },
  });
  assert.equal(result.termsClick, 'ui', width);
  const agreeAt = made.events.indexOf('#eulaAgreeButton');
  const shotsBeforeAgree = made.events.slice(0, agreeAt).filter((item) => item === 'shot').length;
  assert.equal(shotsBeforeAgree, 7, 'terms gate is shot before the Agree click');
  walked.push(...result.shots);
}
assert.equal(walked.length, ONBOARDING_SCREENS.length * ONBOARDING_WIDTHS.length);
const later = path.join(dir, 'app-webkit-390.png');
fs.writeFileSync(later, varied);
const built = buildCustomerPdf({ shots: walked, laterFiles: [later], outPath: path.join(dir, 'customer.pdf') });
const opened = assessOnboardingScreens({ shots: walked, pdfText: built.pdfText, termsClick: 'ui' });
assert.equal(opened.ok, true, opened.detail);
assert.ok(built.pdfText.indexOf(onboardingLabel('homepage', 390)) < built.pdfText.indexOf(onboardingLabel('first-talk', 430)));
assert.ok(built.pdfText.indexOf(onboardingLabel('first-talk', 430)) < built.pdfText.indexOf('later app-webkit-390'));

const dropped = walked.map((shot) => shot.id === 'homepage' && shot.width === 390 ? { ...shot, missing: true, file: '', gap: 'missing homepage 390' } : shot);
const missing = assessOnboardingScreens({ shots: dropped, pdfText: built.pdfText, termsClick: 'ui' });
assert.equal(missing.ok, false);
assert.equal(missing.detail, 'missing homepage 390');
const blankShot = walked.map((shot) => shot.id === 'checkout-payment' && shot.width === 430 ? { ...shot, blank: true, gap: 'blank checkout-payment 430' } : shot);
assert.equal(assessOnboardingScreens({ shots: blankShot, pdfText: built.pdfText, termsClick: 'ui' }).detail, 'blank checkout-payment 430');
assert.equal(assessOnboardingScreens({ shots: walked, pdfText: built.pdfText, termsClick: '' }).detail, 'terms-gate: not a ui click');

const quiet = fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-email-'));
const noMail = await walkOnboardingWidth({
  page: fakePage().page,
  origin,
  customer,
  width: 390,
  outDir: quiet,
  showPayment: async (page) => { await page.click('#continueBtn'); },
  submitPayment: async (page) => {
    await page.click('#payBtn');
    page._url = `${origin}/order-success.html?session=throwaway-session`;
  },
  emailFor: () => ({ html: '', launchUrl: '', gap: 'purchase-email: no email surface' }),
});
assert.equal(noMail.shots.find((shot) => shot.id === 'purchase-email').gap, 'purchase-email: no email surface');
assert.equal(fs.readdirSync(path.join(quiet, 'onboarding')).some((name) => name.startsWith('purchase-email')), false);

const blocked = await walkOnboardingWidth({
  page: fakePage().page,
  origin,
  customer,
  width: 390,
  outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-block-')),
  showPayment: async (page) => { await page.click('#continueBtn'); },
  submitPayment: async (page) => {
    await page.click('#payBtn');
    page._url = `${origin}/order-success.html?session=throwaway-session`;
  },
  emailFor: () => ({ html: '<p>Open Vacay Keepsake</p>', launchUrl: `${origin}/shared/8CQX/`, gap: '' }),
});
assert.match(blocked.shots.find((shot) => shot.id === 'purchase-email').gap, /protected-target/);

const refused = await captureOnboardingPdf({
  origin,
  outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'onboarding-craig-')),
  runId: 'r1',
  customer: { name: 'Craig Davidson', email: 'craig@example.com' },
  pageFactory: async () => { throw new Error('browser opened'); },
});
assert.equal(refused.ok, false);
assert.match(refused.detail, /protected-account/);

const card = buildScorecard({
  run_id: 'r1',
  story_id: 'dry-run',
  reply_backend: 'openrouter',
  checks: [],
  started_at: '2026-11-19T00:00:00.000Z',
  ended_at: '2026-11-19T00:00:01.000Z',
});
assert.equal(card.checks.find((check) => check.id === 'onboarding-screens-in-pdf').pass, false);
assert.equal(card.checks.find((check) => check.id === 'onboarding-screens-in-pdf').detail, 'missing');
assert.equal(card.verdict, 'FAIL');

fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(quiet, { recursive: true, force: true });
console.log('test_acceptance_1020_onboarding_screens: ok');
