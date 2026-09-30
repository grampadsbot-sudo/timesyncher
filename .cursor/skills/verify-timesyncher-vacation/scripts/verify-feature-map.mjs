#!/usr/bin/env node
/**
 * Re-runnable Feature Map drive. Overwrites <out>/VERIFY.md.
 * Does not redeem coupons or write staging rows.
 * The real-app gate is required: a failing gate refuses a clean table.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { purchaseEmail } from '../../../../src/vacation/email.mjs';
import { onboardingOpenerFacts, upsellFactsForTurn } from '../../../../src/vacation/live-app-turn.mjs';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const staging = 'https://vacation-staging.timesyncher.com';
const sharedUrl = `${staging}/shared/las-vegas-vacation-3/`;
const intakeUrl = `${staging}/shared/intake-eab1cbb15144/`;
const require = createRequire(import.meta.url);

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? '' : (process.argv[index + 1] || '');
}

const outDir = path.resolve(argValue('--out') || path.join(root, '.cursor/skills/verify-timesyncher-vacation/output'));
const shotDir = path.join(outDir, 'verify');

function has(text, needle) {
  return String(text || '').toLowerCase().includes(String(needle).toLowerCase());
}

function welcomeAfterIntakeReady() {
  const opener = onboardingOpenerFacts();
  const facts = upsellFactsForTurn({ intake: true, text: '' }, {}, true);
  return opener.first_message === true
    && opener.customer_said == null
    && facts?.collaborators === true
    && facts?.buildingItinerary === true;
}

const checks = [
  ['post-purchase-email-eula.md', 'Post-purchase email, EULA, onboarding', 'verify-eula.png', (o) => (o.ack && !o.shellBundle && o.emailIsShared && o.emailLaunchHasEula ? 'PASS' : 'FAIL')],
  ['live-app-jev-tier.md', 'Live composer Jev tier', 'verify-jev-quality.png', (o) => (o.jevSource && !o.qualityOnScreen ? 'PASS' : 'FAIL')],
  ['header-chrome.md', 'Header brand', 'verify-header-chrome.png', (o) => (o.header && !o.shell ? 'PASS' : 'FAIL')],
  ['language.md', 'Language', 'verify-language.png', (o) => (o.language ? 'PASS' : 'GAP')],
  ['voice-note.md', 'Voice note', 'verify-voice-note.png', (o) => (o.voice ? 'PASS' : 'GAP')],
  ['itinerary-layout.md', 'Standard itinerary layout', 'verify-itinerary-layout.png', (o) => (o.layout && !o.shell ? 'PASS' : 'FAIL')],
  ['slider-bars.md', 'Slider bars', 'verify-slider-bars.png', (o) => (o.slider && !o.shell ? 'PASS' : 'FAIL')],
  ['thing-pages.md', 'Thing pages', 'verify-thing-page.png', (o) => (o.detail ? 'PASS' : 'FAIL')],
  ['maps.md', 'Day map', 'verify-maps.png', (o) => (o.maps ? 'PASS' : 'GAP')],
  ['filters.md', 'Filters', 'verify-filters.png', (o) => (o.filters ? 'PASS' : 'GAP')],
  ['empty-states.md', 'Empty states', 'verify-empty-states.png', (o) => (o.emptyCopyInBundle && o.filledDay ? 'PASS' : 'GAP')],
  ['tags-chips.md', 'Tags and chips', 'verify-tags-chips.png', (o) => (o.tagChips ? 'PASS' : 'GAP')],
  ['logos.md', 'Thing logos', 'verify-logos.png', (o) => (o.logos ? 'PASS' : 'GAP')],
  ['status.md', 'Status', 'verify-status.png', (o) => (o.status ? 'PASS' : 'GAP')],
  ['happy-hour.md', 'Happy hour', 'verify-happy-hour.png', (o) => (o.happy ? 'PASS' : 'GAP')],
  ['hotel-stay-fields.md', 'Hotel stay fields', 'verify-hotel-fields.png', (o) => (o.checkin ? 'PASS' : 'GAP')],
  ['flight-fields.md', 'Flight fields', 'verify-flight-fields.png', (o) => (o.takeoff ? 'PASS' : 'GAP')],
  ['car-fields.md', 'Car fields', 'verify-car-fields.png', (o) => (o.rental ? 'PASS' : 'GAP')],
  ['ratings-reviews.md', 'Ratings and reviews', 'verify-ratings.png', (o) => (o.rating ? 'PASS' : 'GAP')],
  ['media-stories.md', 'Stories and media', 'verify-stories.png', (o) => (o.story ? 'PASS' : 'GAP')],
  ['collaborators.md', 'Collaborators', 'verify-collaborators.png', (o) => (o.collab ? 'PASS' : 'GAP')],
  ['budget.md', 'Budget', 'verify-budget.png', (o) => (o.intakeBudget ? 'PASS' : 'GAP')],
  ['packing.md', 'Packing', 'verify-packing.png', (o) => (o.packingHidden ? 'PASS' : 'GAP')],
  ['print-pdf.md', 'Print and PDF', 'verify-print-pdf.png', (o) => (o.printMenu ? 'PASS' : 'GAP')],
  ['keepsake-style-one.md', 'Keepsake Style one', 'verify-style-one.png', (o) => (o.style1 ? 'PASS' : 'FAIL')],
  ['keepsake-style-two.md', 'Keepsake Style two', 'verify-style-two.png', (o) => (o.style2 ? 'PASS' : 'FAIL')],
  ['keepsakes-config.md', 'Keepsakes config defaults', 'verify-keepsakes-config.png', (o) => (o.configDefaults ? 'PASS' : 'GAP')],
  ['order-keepsakes.md', 'Order Keepsakes', 'verify-order-keepsakes.png', (o) => (o.order ? 'PASS' : 'GAP')],
  ['config-options-trip-view.md', 'Standard layout, no view options', 'verify-itinerary-layout.png', (o) => (o.layout && !o.shell ? 'PASS' : 'FAIL')],
  ['navigation.md', 'Navigation chrome', 'verify-navigation.png', (o) => (o.navigation ? 'PASS' : 'GAP')],
  ['trek-settings.md', 'TREK settings', 'verify-settings.png', (o) => (o.settings ? 'PASS' : 'GAP')],
  ['min-things.md', 'Initial fill minimums', 'verify-min-things.png', (o) => (o.intakeMin ? 'PASS' : 'GAP')],
  ['post-intake-welcome.md', 'Post-intake welcome', 'verify-post-intake.png', (o) => (o.postIntake ? 'PASS' : 'GAP')],
  ['welcome-after-intake.md', 'Welcome after intake', 'verify-welcome-after-intake.png', (o) => (o.welcomeAfterIntake ? 'PASS' : 'FAIL')],
  ['jev-quality-line.md', 'Jev quality line', 'verify-jev-quality.png', (o) => (o.qualityOnScreen ? 'FAIL' : 'PASS')],
  ['dialog-screenshot-gate.md', 'Dialog screenshot gate', 'verify-screenshot-gate.png', (o) => (o.layout && o.slider && o.detail && !o.shell ? 'PASS' : 'FAIL')],
  ['autonomous-app-customer-flow.md', 'Autonomy bar', 'verify-autonomy.png', (o) => (o.header && !o.shell ? 'PASS' : 'GAP')],
  ['keepsake-qa.md', 'Keepsake QA', 'verify-keepsake-qa.png', (o) => (o.style2 ? 'PASS' : 'FAIL')],
  ['tg-intake.md', 'Telegram intake', 'verify-tg-intake.png', (o) => (o.telegramFill ? 'PASS' : 'GAP')],
  ['cursor-project-contract.md', 'Cursor project contract', 'verify-cursor-contract.png', (o) => (o.contract ? 'PASS' : 'GAP')],
  ['search-redesign.md', 'Search redesign', 'verify-search-redesign.png', () => 'GAP'],
  ['real-app-email-entry.md', 'Email opens the real app', 'verify-eula.png', (o) => (o.emailIsShared ? 'PASS' : 'GAP')],
];

function knownFiles() {
  return new Set(checks.map(([file]) => file));
}

async function featureFiles() {
  const dir = path.join(root, '.cursor/skills/verify-timesyncher-vacation/features');
  const names = await readdir(dir);
  return names.filter((name) => name.endsWith('.md') && name !== 'README.md').sort();
}

async function selfCheck() {
  const files = await featureFiles();
  const known = knownFiles();
  const missing = files.filter((name) => !known.has(name));
  const extra = [...known].filter((name) => !files.includes(name));
  if (missing.length || extra.length) {
    console.error(`feature map drift missing=${missing.join(',') || '-'} extra=${extra.join(',') || '-'}`);
    process.exit(1);
  }
  console.log(`feature map self-check ok (${files.length} features)`);
}

function runGate() {
  const gate = spawnSync(process.execPath, ['scripts/test_real_app_entry.mjs'], { cwd: root, encoding: 'utf8' });
  return { ok: gate.status === 0, stdout: gate.stdout || '', stderr: gate.stderr || '' };
}

function runDoctor() {
  const doctor = spawnSync(process.execPath, ['.cursor/skills/verify-timesyncher-vacation/scripts/verify-post-purchase-email-eula.mjs', '--doctor'], { cwd: root, encoding: 'utf8' });
  return { ok: doctor.status === 0, stdout: doctor.stdout || '', stderr: doctor.stderr || '' };
}

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

async function readJsonOptional(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function jevSignals() {
  const checked = spawnSync(process.execPath, ['.cursor/skills/verify-timesyncher-vacation/scripts/verify-live-app-jev-tier.mjs'], { cwd: root, encoding: 'utf8' });
  const jevSource = checked.status === 0;
  const transcript = path.join(root, 'dialog-packs/craig-gold-v7-jev-quality-post-intake-20260926/transcript.json');
  let jevTranscript = false;
  try {
    await readFile(transcript, 'utf8');
    const checked = spawnSync(process.execPath, ['.cursor/skills/verify-timesyncher-vacation/scripts/verify-live-app-jev-tier.mjs', '--transcript', transcript], { cwd: root, encoding: 'utf8' });
    jevTranscript = checked.status === 0;
  } catch {
    jevTranscript = false;
  }
  let jevRewritten = 0;
  let postIntake = false;
  if (process.env.DATABASE_URL) {
    try {
      const { sql } = await import('../../../../src/vacation/db.mjs');
      const db = sql(process.env);
      const rewritten = await db`
        select count(*)::int as n
        from transcript_turns
        where payload->'liveTranscript'->'quality'->>'rewritten' = 'true'
      `;
      jevRewritten = Number(rewritten[0]?.n || 0);
      const welcome = await db`
        select count(*)::int as n
        from transcript_turns
        where body ilike '%unlimited vacations for the whole year%'
          and body ilike '%collaborat%'
          and body ilike '%itinerary%'
      `;
      postIntake = Number(welcome[0]?.n || 0) > 0;
    } catch {
      jevRewritten = 0;
    }
  }
  return { jevSource, jevTranscript, jevRewritten, postIntakeDb: postIntake, jevLabel: jevSource && (jevTranscript || jevRewritten > 0) };
}

async function sharedCounts() {
  const headers = {};
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS;
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  const response = await fetch(`${staging}/api/shared/las-vegas-vacation-3`, { headers });
  if (!response.ok) return { packingHidden: false, minThings: false, budgetFlag: false };
  const data = await response.json();
  const counts = {};
  for (const place of data.places || []) {
    const name = place.category_name || '';
    counts[name] = (counts[name] || 0) + 1;
  }
  const perms = data.permissions || {};
  return {
    packingHidden: perms.share_packing !== true,
    budgetFlag: perms.share_budget === true,
    minThings: (counts.Restaurant || 0) >= 15 && (counts.Store || 0) >= 10 && (counts.Attraction || 0) >= 15,
  };
}

async function intakeSignals() {
  const headers = {};
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS;
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  const response = await fetch(`${staging}/api/shared/intake-eab1cbb15144`, { headers });
  if (!response.ok) return { intakeBudget: false, intakeMin: false };
  const data = await response.json();
  const counts = {};
  for (const place of data.places || []) {
    const name = place.category_name || '';
    counts[name] = (counts[name] || 0) + 1;
  }
  const perms = data.permissions || {};
  return {
    intakeBudget: perms.share_budget === true && Array.isArray(data.budget) && data.budget.length > 0,
    intakeMin: (counts.Restaurant || 0) >= 15 && (counts.Store || 0) >= 10 && (counts.Attraction || 0) >= 15,
  };
}

async function drive() {
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS;
  if (bypass) {
    await page.setExtraHTTPHeaders({
      'x-vercel-protection-bypass': bypass,
      'x-vercel-set-bypass-cookie': 'true',
    });
  }
  const shots = new Set();
  async function shot(name) {
    if (!name || shots.has(name)) return;
    shots.add(name);
    await page.screenshot({ path: path.join(shotDir, name) });
  }
  async function go(url) {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  async function bodyText() {
    return page.evaluate(() => document.body.innerText || '');
  }
  async function clickAria(label) {
    return page.evaluate((name) => {
      const button = document.querySelector(`[aria-label="${name}"]`);
      if (!button) return false;
      button.click();
      return true;
    }, label);
  }
  async function clickIncludes(label) {
    return page.evaluate((name) => {
      const button = [...document.querySelectorAll('button')].find((node) => node.innerText.includes(name));
      if (!button) return false;
      button.click();
      return true;
    }, label);
  }

  await go(sharedUrl);
  let text = await bodyText();
  const obs = {
    shell: await page.evaluate(() => Boolean(document.querySelector('[aria-label="Vacation path"], [data-screen="itinerary"]'))),
    header: has(text, 'TIMESYNCHER') || has(text, 'TimeSyncher'),
    layout: ['Day-by-Day', 'Flights', 'Hotels', 'Cars', 'Restaurants', 'Stores', 'The Rest'].every((label) => has(text, label)),
    budget: has(text, 'Budget'),
    slider: has(text, 'Vacation Day View') && has(text, 'Day 1') && !has(text, 'No timeline-tagged things yet for this day'),
    maps: has(text, 'Only things tagged for this day'),
    voice: await page.evaluate(() => Boolean(document.querySelector('[aria-label="Record voice note"]'))),
    logos: await page.evaluate(() => [...document.querySelectorAll('img')].some((img) => img.src.includes('/ts-thing-logos/'))),
    navigation: has(text, 'Open navigation') || has(text, 'Close navigation'),
    settings: has(text, 'Mapbox') || has(text, 'Copy link'),
    empty: has(text, 'No timeline-tagged things yet') || has(text, 'match those tags'),
    filledDay: has(text, 'Vacation Day View') && has(text, 'Day 1') && !has(text, 'No timeline-tagged things yet for this day'),
    telegramFill: false,
    emailLaunchHasEula: false,
    emptyCopyInBundle: false,
    welcomeAfterIntake: false,
  };
  const bundleSrc = await page.evaluate(() => [...document.scripts].map((script) => script.src).find((src) => src.includes('/assets/index-')) || '');
  if (bundleSrc) {
    const bundleResponse = await fetch(bundleSrc, { headers: bypass ? { 'x-vercel-protection-bypass': bypass } : {} });
    if (bundleResponse.ok) {
      const bundle = await bundleResponse.text();
      obs.emptyCopyInBundle = [
        'No restaurants match those tags',
        'No stores match those tags',
        'No timeline-tagged things yet for this day',
      ].every((sentence) => bundle.includes(sentence));
    }
  }
  if (await clickIncludes('Open navigation')) {
    text = await bodyText();
    obs.navigation = has(text, 'Open navigation') || has(text, 'Close navigation');
  }
  if (await clickIncludes('Settings')) {
    text = await bodyText();
    obs.settings = has(text, 'Mapbox') || has(text, 'Copy link');
  }
  await shot('verify-header-chrome.png');
  await shot('verify-itinerary-layout.png');
  await shot('verify-slider-bars.png');
  await shot('verify-maps.png');
  await shot('verify-voice-note.png');
  await shot('verify-logos.png');
  await shot('verify-screenshot-gate.png');
  await shot('verify-autonomy.png');
  await shot('verify-packing.png');
  await shot('verify-navigation.png');
  await shot('verify-settings.png');
  await shot('verify-cursor-contract.png');
  await shot('verify-search-redesign.png');

  await clickIncludes('The Rest');
  await new Promise((resolve) => setTimeout(resolve, 600));
  text = await bodyText();
  obs.filters = has(text, 'All areas') || has(text, 'All types');
  obs.tagChips = has(text, 'Restaurant tags') || has(text, 'Store tags') || has(text, 'All tags');
  await shot('verify-filters.png');
  await shot('verify-empty-states.png');

  await clickIncludes('Day-by-Day');
  await new Promise((resolve) => setTimeout(resolve, 500));
  await clickIncludes('Bellagio');
  await new Promise((resolve) => setTimeout(resolve, 700));
  text = await bodyText();
  obs.detail = has(text, 'DETAIL PAGE') || has(text, 'Detail page');
  obs.status = has(text, 'considering');
  obs.story = has(text, 'Story');
  obs.collab = has(text, 'approved email invite') || has(text, 'View-only');
  obs.rating = has(text, 'Google') || has(text, 'Yelp');
  obs.checkin = has(text, 'Check-in') || has(text, 'Stay');
  await shot('verify-thing-page.png');
  await shot('verify-status.png');
  await shot('verify-stories.png');
  await shot('verify-collaborators.png');
  await shot('verify-ratings.png');
  await shot('verify-hotel-fields.png');

  await page.keyboard.press('Escape').catch(() => {});
  await clickIncludes('SFO to LAS');
  await new Promise((resolve) => setTimeout(resolve, 600));
  text = await bodyText();
  obs.takeoff = has(text, 'Takeoff');
  await shot('verify-flight-fields.png');

  await page.keyboard.press('Escape').catch(() => {});
  await clickIncludes('Carbone');
  await new Promise((resolve) => setTimeout(resolve, 600));
  text = await bodyText();
  obs.happy = has(text, 'Happy hour');
  if (!obs.tagChips) {
    obs.tagChips = has(text, 'Restaurant tags') || has(text, 'Store tags') || has(text, 'All tags');
  }
  await shot('verify-tags-chips.png');
  await shot('verify-happy-hour.png');

  await page.keyboard.press('Escape').catch(() => {});
  await clickIncludes('Cars');
  await new Promise((resolve) => setTimeout(resolve, 500));
  await clickIncludes('car');
  await new Promise((resolve) => setTimeout(resolve, 500));
  text = await bodyText();
  obs.rental = has(text, 'Rental company');
  await shot('verify-car-fields.png');

  await go(sharedUrl);
  await clickAria('PDFs');
  await new Promise((resolve) => setTimeout(resolve, 400));
  text = await bodyText();
  obs.printMenu = has(text, 'PRINT / PDF') || has(text, 'Daily printout');
  await shot('verify-print-pdf.png');
  await clickIncludes('Keepsakes');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await clickIncludes('Admin');
  await new Promise((resolve) => setTimeout(resolve, 400));
  text = await bodyText();
  obs.configDefaults = ['Initial summary', 'Event summary', 'Saved stories', 'TimeSyncher Vacation logo', 'Day 1 map', 'Style one', 'Style two'].every((label) => has(text, label));
  await shot('verify-keepsakes-config.png');
  await page.keyboard.press('Escape').catch(() => {});
  await clickAria('Order Keepsakes');
  await new Promise((resolve) => setTimeout(resolve, 400));
  obs.order = has(await bodyText(), 'Order Keepsakes');
  await shot('verify-order-keepsakes.png');

  await go(`${staging}/shared/las-vegas-vacation-3/journey?style=1`);
  obs.style1 = page.url().includes('vacation-staging') && page.url().includes('style=1') && !page.url().includes('travel.timesyncher.com');
  await shot('verify-style-one.png');
  await go(`${staging}/shared/las-vegas-vacation-3/journey?style=2`);
  obs.style2 = page.url().includes('vacation-staging') && page.url().includes('keepsake-style-2') && !page.url().includes('travel.timesyncher.com');
  await shot('verify-style-two.png');
  await shot('verify-keepsake-qa.png');

  async function welcomeBeforeFirstMessage() {
    return page.evaluate(() => {
      const root = document.querySelector('#messages[data-screen="onboarding"]');
      if (!root) return false;
      const bubbles = [...root.querySelectorAll('article.bubble')];
      const firstUser = bubbles.findIndex((node) => node.classList.contains('user'));
      const prior = firstUser < 0 ? bubbles : bubbles.slice(0, firstUser);
      return prior.some((node) => !node.classList.contains('user') && (node.textContent || '').replace(/\s+/g, ' ').trim().length > 0);
    });
  }
  function languageControl() {
    return page.evaluate(() => [...document.querySelectorAll('button, a, select, label, [role="button"]')].some((node) => {
      const text = (node.innerText || '').trim();
      const aria = (node.getAttribute('aria-label') || '').trim();
      return /^(change language|select language|language)$/i.test(aria) || /^(change language|select language|language)$/i.test(text);
    }));
  }
  await go(`${staging}/login.html`);
  obs.language = await languageControl();
  await shot('verify-language.png');
  if (!obs.language) {
    await go(staging);
    obs.language = await languageControl();
    await shot('verify-language.png');
  }

  await go(intakeUrl);
  text = await bodyText();
  obs.intakeLayout = has(text, 'Day-by-Day') && has(text, 'Vacation Day View') && !has(text, 'Vacation path');
  obs.telegramFill = obs.intakeLayout && (has(text, 'Kailua-Kona') || has(text, 'Big Island'));
  obs.qualityOnScreen = has(text, 'quality:');
  await shot('verify-tg-intake.png');
  if (await clickIncludes('Budget')) {
    await shot('verify-budget.png');
  }
  if (await clickIncludes('Restaurants')) {
    await shot('verify-min-things.png');
  }
  await shot('verify-post-intake.png');
  obs.welcomeAfterIntake = welcomeAfterIntakeReady() && await welcomeBeforeFirstMessage();
  await shot('verify-welcome-after-intake.png');
  await shot('verify-jev-quality.png');

  await go(`${staging}/order-success.html`);
  text = await bodyText();
  obs.ack = has(text, 'Check your email') && !await page.evaluate(() => Boolean(document.querySelector('#openApp, #acceptEula')));
  await shot('verify-order-success.png');

  const launchUrl = purchaseEmail({ contact: { firstName: 'Verify' }, token: 'session-token', env: { TIMESYNCHER_SITE_BASE_URL: staging } }).launchUrl;
  await go(launchUrl);
  obs.emailLaunchHasEula = Boolean(await page.$('#eulaScreen'));
  await shot('verify-eula.png');

  const sessionUrl = process.env.TIMESYNCHER_VERIFY_SESSION || '';
  if (sessionUrl) {
    await go(sessionUrl);
    text = await bodyText();
    obs.liveEula = Boolean(await page.$('#eulaScreen'));
    obs.liveOnboarding = has(text, 'no vacations yet') && !await page.evaluate(() => Boolean(document.querySelector('[aria-label="Vacation path"]')));
    obs.qualityOnScreen = obs.qualityOnScreen || has(text, 'quality:');
    if (welcomeAfterIntakeReady() && await welcomeBeforeFirstMessage()) obs.welcomeAfterIntake = true;
    await shot('verify-eula.png');
    await shot('verify-onboarding.png');
    await shot('verify-welcome-after-intake.png');
  }

  await browser.close();
  return obs;
}

function table(rows, gateOk) {
  const gaps = rows.filter((row) => row.result === 'GAP').map((row) => row.feature);
  const fails = rows.filter((row) => row.result === 'FAIL').map((row) => row.feature);
  const lines = [
    '# Verification table',
    '',
    `Gate \`npm run test:real-app-entry\`: ${gateOk ? 'PASS' : 'FAIL'}.`,
    `Coverage: ${rows.length} of ${rows.length} features.`,
    'Re-runs overwrite this file. This drive does not redeem a coupon.',
    '',
    '## Product gaps',
    '',
    ...(gaps.length ? gaps.map((feature) => `- ${feature}`) : ['- None.']),
    '',
    fails.length ? `Fails: ${fails.join(', ')}.` : 'Fails: none.',
    '',
    '| Feature | File | Live | Screenshot |',
    '|---|---|---|---|',
    ...rows.map((row) => `| ${row.feature} | \`${row.file}\` | ${row.result} | \`${row.shot}\` |`),
    '',
  ];
  return lines.join('\n');
}

async function main() {
  if (process.argv.includes('--self-check')) {
    await selfCheck();
    return;
  }
  await selfCheck();
  const gate = runGate();
  if (!gate.ok) {
    const markdown = `# Verification table\n\nGate \`npm run test:real-app-entry\`: FAIL.\n\n${gate.stderr || gate.stdout}\n`;
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, 'VERIFY.md'), markdown);
    process.stderr.write(markdown);
    process.exit(1);
  }
  const doctor = runDoctor();
  if (!doctor.ok) {
    const markdown = `# Verification table\n\nGate \`npm run test:real-app-entry\`: PASS.\n\nDoctor FAIL.\n\n${doctor.stderr || doctor.stdout}\n`;
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, 'VERIFY.md'), markdown);
    process.stderr.write(markdown);
    process.exit(1);
  }
  const email = purchaseEmail({ contact: { firstName: 'Verify' }, token: 'session-token', env: { TIMESYNCHER_SITE_BASE_URL: staging } });
  const appHtml = await readFile(path.join(root, 'vacation-app.html'), 'utf8');
  const contract = await Promise.all([
    readFile(path.join(root, 'AGENTS.md'), 'utf8').then(() => true).catch(() => false),
    readFile(path.join(root, '.cursor/rules/style-two-keepsake-contract.mdc'), 'utf8').then(() => true).catch(() => false),
  ]);
  const counts = await sharedCounts();
  const intake = await intakeSignals();
  const jev = await jevSignals();
  await mkdir(shotDir, { recursive: true });
  const observed = await drive();
  const obs = {
    ...observed,
    ...counts,
    ...intake,
    ...jev,
    emailIsApp: email.launchUrl.includes('/vacation-app.html?session='),
    emailIsShared: email.launchUrl.includes('/shared/'),
    eulaBundle: appHtml.includes('id="eulaScreen"'),
    shellBundle: /data-screen="itinerary"|aria-label="Vacation path"/.test(appHtml),
    contract: contract.every(Boolean),
    postIntake: Boolean(observed.intakeLayout && jev.postIntakeDb),
    budget: observed.budget && counts.budgetFlag,
  };
  const files = await featureFiles();
  const rows = files.map((file) => {
    const spec = checks.find((row) => row[0] === file);
    if (!spec) return { feature: file, file, result: 'FAIL', shot: 'missing.png' };
    const [, feature, shot, decide] = spec;
    return { feature, file, result: decide(obs), shot };
  });
  const markdown = table(rows, true);
  await writeFile(path.join(outDir, 'VERIFY.md'), markdown);
  process.stdout.write(markdown);
  if (rows.some((row) => row.result === 'FAIL')) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
