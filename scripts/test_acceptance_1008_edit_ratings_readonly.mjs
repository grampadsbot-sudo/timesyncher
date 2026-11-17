#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  COPY_SLUG,
  cloneCopyTripPayload,
  startLocalPreview,
  sleep,
  clickTab,
  clickDayChip,
  openThingDetailByName,
} from './acceptance_1005_touch_harness.mjs';

const require = createRequire(import.meta.url);

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

const RATING_KEYS = [
  'googleRating',
  'yelpRating',
  'thirdPartyRating',
  'review1Rating',
  'review2Rating',
  'review3Rating',
  'review4Rating',
];

function ratingSnapshot(override = {}) {
  const out = {};
  for (const key of RATING_KEYS) out[key] = String(override[key] ?? '').trim();
  return out;
}

const tripPayload = cloneCopyTripPayload();
const placeKey = 'place:604';
tripPayload.thingOverrides[placeKey] = {
  ...(tripPayload.thingOverrides[placeKey] || {}),
  thirdPartyRating: '4.9',
  googleRating: '4.7',
  yelpRating: '4.5',
  review1: 'Knowledgeable guides and smooth ferry timing.',
  review1Rating: '5',
  review2: 'Worth the early Battery Park arrival.',
  review2Rating: '4',
};
const beforeRatings = ratingSnapshot(tripPayload.thingOverrides[placeKey]);
const thingFieldPuts = [];
const preview = await startLocalPreview(tripPayload, { canEdit: true, thingFieldPuts });
const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});

const editRatingsAudit = `(() => {
  const root = document.querySelector('[data-ts-detail-v3][data-ts-detail-mode="edit"]');
  if (!root) return { edit: false };
  const ratingInputs = [...root.querySelectorAll('input,select,[contenteditable="true"]')].filter((el) => {
    if (el.closest('[data-ts-detail-rating-readonly="1"]')) return false;
    if (el.closest('[data-ts-review-stars]')) return el.tagName === 'INPUT' || el.tagName === 'SELECT';
    const hint = [el.placeholder, el.getAttribute('aria-label'), el.getAttribute('name')].filter(Boolean).join(' ');
    return /rating|google|yelp|thirdParty|review\\s*\\d/i.test(hint);
  });
  const starBlocks = root.querySelectorAll('[data-ts-detail-rating-stars],[data-ts-review-stars]');
  const starsRendered = [...starBlocks].every((el) => (el.textContent || '').trim().length > 0 || el.querySelector('.ts-star-rating,svg,[aria-hidden]'));
  return { edit: true, ratingInputs: ratingInputs.length, starBlocks: starBlocks.length, starsRendered };
})()`;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await page.goto(`${preview.origin}/shared/${COPY_SLUG}/`, { waitUntil: 'networkidle2', timeout: 240000 });
  await clickTab(page, 'Day-by-Day');
  await page.waitForSelector('[data-ts-day-timeline]', { timeout: 120000 });
  await clickDayChip(page, 2);
  await sleep(500);
  await openThingDetailByName(page, /statue of liberty walking tour/i);

  await page.waitForSelector('[data-ts-detail-edit="1"]', { timeout: 60000 });
  const editBtn = await page.evaluate(() => {
    const btn = document.querySelector('[data-ts-detail-edit="1"]');
    const r = btn?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  assert.ok(editBtn, 'edit pencil missing');
  await page.touchscreen.tap(editBtn.x, editBtn.y);
  await page.waitForSelector('[data-ts-detail-mode="edit"]', { timeout: 30000 });

  const audit = await page.evaluate(editRatingsAudit);
  assert.ok(audit.edit, 'detail edit mode required');
  assert.equal(audit.ratingInputs, 0, `no editable rating controls in edit mode: ${JSON.stringify(audit)}`);
  assert.ok(audit.starBlocks > 0 && audit.starsRendered, `rating stars must render read-only: ${JSON.stringify(audit)}`);

  const noteSel = '[data-ts-detail-v3][data-ts-detail-mode="edit"] textarea';
  await page.waitForSelector(noteSel, { timeout: 15000 });
  await page.click(noteSel);
  await page.keyboard.type('x');

  let putSeen = false;
  for (let attempt = 0; attempt < 20 && !putSeen; attempt += 1) {
    await sleep(300);
    putSeen = thingFieldPuts.length > 0;
  }

  assert.ok(putSeen, 'edit save must PUT thing-fields');
  const putBody = thingFieldPuts.at(-1);
  const savedPlace = putBody?.fields?.[placeKey] || putBody?.[placeKey];
  assert.ok(savedPlace && typeof savedPlace === 'object', 'thing-fields payload missing place override');
  const afterRatings = ratingSnapshot(savedPlace);
  for (const key of RATING_KEYS) {
    if (!beforeRatings[key] && !afterRatings[key]) continue;
    assert.equal(afterRatings[key], beforeRatings[key], `rating ${key} must stay unchanged on save`);
  }

  const saveBtn = await page.evaluate(() => {
    const btn = document.querySelector('[data-ts-detail-save="1"]');
    const r = btn?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  if (saveBtn) await page.touchscreen.tap(saveBtn.x, saveBtn.y);

  await page.close();
} finally {
  await browser.close();
  await preview.close();
}

console.log('acceptance #1008 edit ratings read-only OK');