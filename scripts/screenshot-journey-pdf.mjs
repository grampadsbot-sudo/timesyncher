#!/usr/bin/env node
/**
 * Re-runnable Screenshot Journey PDF.
 * Overwrites <out>/screenshot-journey.pdf. Does not redeem a coupon or click Agree.
 * The real-app gate runs first. A surface with no screenshot is a GAP in the PDF
 * contents page and in VERIFY.md. Shell screens are refused.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const featureDir = path.join(root, '.cursor/skills/verify-timesyncher-vacation/features');
const staging = 'https://vacation-staging.timesyncher.com';
const require = createRequire(import.meta.url);

const SHELL = '[aria-label="Vacation path"], [data-screen="itinerary"], [data-screen="thing"]';

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? '' : (process.argv[index + 1] || '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function has(text, needle) {
  return String(text || '').toLowerCase().includes(String(needle).toLowerCase());
}

async function featureFiles() {
  const names = await readdir(featureDir);
  const files = [];
  for (const name of names.filter((item) => item.endsWith('.md') && item !== 'README.md').sort()) {
    const markdown = await readFile(path.join(featureDir, name), 'utf8');
    const title = (markdown.match(/^#\s+(.+)$/m) || [null, name])[1].trim();
    files.push({ file: name, title });
  }
  return files;
}

async function selfCheck() {
  const files = await featureFiles();
  if (!files.length) {
    console.error('feature map has no feature files');
    process.exit(1);
  }
  console.log(`screenshot journey self-check ok (${files.length} feature files)`);
}

function runGate() {
  const gate = spawnSync(process.execPath, ['scripts/test_real_app_entry.mjs'], { cwd: root, encoding: 'utf8' });
  return { ok: gate.status === 0, stdout: gate.stdout || '', stderr: gate.stderr || '' };
}

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

async function isShell(page) {
  return page.evaluate((selector) => Boolean(document.querySelector(selector)), SHELL);
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText || '');
}

async function clickText(page, label, { exact = false } = {}) {
  const clicked = await page.evaluate((name, exactMatch) => {
    const norm = (node) => (node.innerText || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    const button = [...document.querySelectorAll('button')].find((node) => {
      const text = norm(node);
      return exactMatch ? text === name : text.toLowerCase().includes(name.toLowerCase());
    });
    if (!button) return false;
    button.click();
    return true;
  }, label, exact);
  if (clicked) await sleep(700);
  return clicked;
}

async function clickAria(page, label) {
  const clicked = await page.evaluate((name) => {
    const button = document.querySelector(`[aria-label="${name}"]`);
    if (!button) return false;
    button.click();
    return true;
  }, label);
  if (clicked) await sleep(500);
  return clicked;
}

function sessionToken(sessionUrl) {
  try {
    return new URL(sessionUrl).searchParams.get('session') || '';
  } catch {
    return '';
  }
}

async function purchaseEmailHtml(token) {
  if (!token || !process.env.DATABASE_URL) return null;
  const { sql } = await import('../src/vacation/db.mjs');
  const db = sql(process.env);
  const rows = await db`
    select subject, status, html_body
    from outbound_emails
    where session_id = (select id from onboarding_sessions where token = ${token} limit 1)
      and subject = 'Your TimeSyncher Vacation purchase is confirmed'
    order by created_at desc
    limit 1
  `;
  return rows[0] || null;
}

function launchHref(html) {
  const match = String(html || '').match(/href="([^"]*\/shared\/[^"]+)"/i);
  return match ? match[1] : '';
}

async function readMail(dir, name) {
  try {
    return await readFile(path.join(dir, name), 'utf8');
  } catch {
    return '';
  }
}

const INTAKE_TRIP_ID = 'eab1cbb1-5144-4be4-b856-92f0a3769db3';

async function loadPreCollaboratorSnapshot() {
  if (!process.env.DATABASE_URL) return null;
  const { sql } = await import('../src/vacation/db.mjs');
  const { storePreCollaboratorSnapshot } = await import('../src/vacation/pre-collaborator-snapshot.mjs');
  const db = sql(process.env);
  return storePreCollaboratorSnapshot(db, INTAKE_TRIP_ID);
}

async function main() {
  if (process.argv.includes('--self-check')) {
    await selfCheck();
    return;
  }
  await selfCheck();
  const gate = runGate();
  if (!gate.ok) {
    process.stderr.write(gate.stderr || gate.stdout || 'real-app gate failed\n');
    process.exit(1);
  }

  const outDir = path.resolve(argValue('--out') || path.join(root, '.cursor/skills/verify-timesyncher-vacation/output'));
  const shotDir = path.join(outDir, 'journey-pages');
  const verifyPath = path.resolve(argValue('--verify') || path.join(outDir, 'VERIFY.md'));
  const sessionUrl = argValue('--session-url');
  const sharedUrl = argValue('--shared-url') || `${staging}/shared/intake-eab1cbb15144/`;
  const referenceUrl = argValue('--reference-url') || `${staging}/shared/las-vegas-vacation-3/`;
  const eulaUrl = argValue('--eula-url');
  const mailDir = argValue('--mail-dir') || '/tmp/journey-mail';
  const preCollabPayload = await loadPreCollaboratorSnapshot();
  let usePreCollab = Boolean(preCollabPayload);
  const preCollabJson = preCollabPayload ? JSON.stringify(preCollabPayload) : '';
  await mkdir(shotDir, { recursive: true });

  const features = await featureFiles();
  const captured = new Set();
  const pages = [];
  const itineraryPages = [];
  const gaps = [];
  const seenShot = new Set();

  function gap(feature, file, reason) {
    gaps.push({ feature, file, reason });
  }

  function mark(file) {
    if (file) captured.add(file);
  }

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
  if (preCollabJson) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (usePreCollab && req.url().includes('/api/shared/intake-eab1cbb15144')) {
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: preCollabJson,
        }).catch(() => {});
        return;
      }
      req.continue().catch(() => {});
    });
  }

  async function shot(id, chapter, title, { file = '', note = '' } = {}) {
    if (await isShell(page)) {
      gap(title, file, 'refused: the page still has the deleted card shell');
      return false;
    }
    const image = path.join(shotDir, `${id}.png`);
    if (!seenShot.has(id)) {
      await page.screenshot({ path: image });
      seenShot.add(id);
    }
    const entry = { id, chapter, title, file, note, image };
    pages.push(entry);
    if (chapter === 'Initial itinerary') itineraryPages.push(entry);
    mark(file);
    return true;
  }

  async function go(url, ready = '') {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (ready) {
      await page.waitForFunction((needle) => (document.body.innerText || '').includes(needle), { timeout: 30000 }, ready).catch(() => {});
    }
    await sleep(700);
  }

  try {
    const token = sessionToken(sessionUrl);
    const orderUrl = token ? `${staging}/order-success.html?session=${encodeURIComponent(token)}` : `${staging}/order-success.html`;
    await go(orderUrl);
    await page.waitForFunction(() => (document.body.innerText || '').includes('Purchase confirmed') || (document.body.innerText || '').includes('Check your email'), { timeout: 20000 }).catch(() => {});
    const purchaseText = await bodyText(page);
    if (has(purchaseText, 'Purchase confirmed') || has(purchaseText, 'Check your email')) {
      await shot('purchase', 'Purchase', 'Purchase confirmed', {
        file: 'post-purchase-email-eula.md',
        note: 'Order-success acknowledgement. No Open App button.',
      });
    } else {
      gap('Purchase', 'post-purchase-email-eula.md', 'order-success did not show the purchase acknowledgement');
    }

    const emailRow = await purchaseEmailHtml(token);
    const arrivedPurchase = await readMail(mailDir, 'purchase.html');
    const purchaseHtml = arrivedPurchase || emailRow?.html_body || '';
    const emailHref = launchHref(purchaseHtml);
    if (!purchaseHtml) {
      gap('Purchase email', 'post-purchase-email-eula.md', 'no stored purchase email for this session');
      gap('Email opens the real app', 'real-app-email-entry.md', 'no stored purchase email to open');
    } else {
      await page.setContent(purchaseHtml, { waitUntil: 'domcontentloaded' });
      await sleep(300);
      const arrived = Boolean(arrivedPurchase) && emailRow?.status === 'sent';
      await shot('purchase-email', 'Purchase email', 'Purchase email', {
        file: 'post-purchase-email-eula.md',
        note: arrived ? 'Arrived purchase email.' : `Purchase email. Provider status is ${emailRow?.status || 'missing'}.`,
      });
      if (!arrived) {
        gap('Purchase email arrival', '', 'the inbox copy was not captured, or the stored outbound status is not sent');
      }
      if (!emailHref || purchaseHtml.includes('vacation-app.html')) {
        gap('Email opens the real app', 'real-app-email-entry.md', 'the purchase email href is still vacation-app.html, not /shared/');
      } else {
        mark('real-app-email-entry.md');
      }
    }

    if (!emailHref) {
      gap('Email click', 'post-purchase-email-eula.md', 'the purchase email has no /shared/ href to open');
    } else {
      await go(emailHref, 'Day-by-Day');
      if (await isShell(page)) {
        gap('Email click', 'post-purchase-email-eula.md', 'refused: the email href still has the deleted card shell');
      } else if (!page.url().includes('/shared/')) {
        gap('Email click', 'real-app-email-entry.md', 'the email href did not stay on the real /shared/ app');
      } else {
        await shot('email-click', 'Email click', 'App URL from the purchase email', {
          file: 'real-app-email-entry.md',
          note: emailHref,
        });
      }
    }

    if (!eulaUrl) {
      gap('EULA', 'post-purchase-email-eula.md', 'the completed session has already accepted terms, and no pending app URL was passed');
    } else {
      await go(eulaUrl);
      const eula = await page.waitForSelector('#eulaScreen', { timeout: 20000 }).then(() => true).catch(() => false);
      if (!eula || await isShell(page)) {
        gap('EULA', 'post-purchase-email-eula.md', eula ? 'refused: shell markers on the EULA URL' : 'the pending URL did not show #eulaScreen');
      } else {
        await shot('eula', 'EULA', 'Review Terms & Privacy', {
          file: 'post-purchase-email-eula.md',
          note: 'First screen of a pending app URL. Agree was not clicked.',
        });
      }
    }

    if (sessionUrl) {
      await go(sessionUrl);
      await page.waitForFunction(() => document.querySelectorAll('article.bubble').length >= 5, { timeout: 30000 }).catch(() => {});
      const bubbles = [
        ['first-prompt', 'First onboarding prompt', 'Welcome. I am here to build this vacation with you', 'The stored opener.'],
        ['building-itinerary', 'Building the itinerary', 'building the itinerary', 'The app says it is building the itinerary from the intake.'],
        ['collab-upsell', 'Collaborator explanation and upsell', 'unlimited vacations for the whole year', 'The same intake reply names collaborators and unlimited vacations for the whole year.'],
        ['welcome-kimberly', 'Kimberly welcome', 'all set, Kimberly', 'Collaborator welcome in the chat.'],
        ['welcome-tyler', 'Tyler welcome', 'Welcome to the crew', 'Collaborator welcome in the chat.'],
        ['welcome-lauren', 'Lauren welcome', 'Welcome aboard', 'Collaborator welcome in the chat.'],
      ];
      for (const [id, title, needle, note] of bubbles) {
        const found = await page.evaluate((phrase) => {
          const bubble = [...document.querySelectorAll('article.bubble')].find((node) => node.innerText.toLowerCase().includes(phrase.toLowerCase()) && !node.classList.contains('user'));
          if (!bubble) return false;
          bubble.scrollIntoView({ block: 'center' });
          return true;
        }, needle);
        await sleep(300);
        const chapter = id.startsWith('welcome-') ? 'Collaborator welcome' : 'Onboarding';
        const file = id.startsWith('welcome-') ? 'collaborators.md' : (id === 'collab-upsell' ? 'post-intake-welcome.md' : 'post-purchase-email-eula.md');
        if (!found) {
          gap(title, file, `the chat has no app bubble containing "${needle}"`);
          continue;
        }
        if (id === 'building-itinerary') mark('post-intake-welcome.md');
        await shot(id, chapter, title, { file, note });
      }
      const chatText = await bodyText(page);
      if (!has(chatText, 'quality:')) {
        gap('Jev quality line', 'jev-quality-line.md', 'the customer app does not paint the quality score line; it is in the Dialog PDF');
      } else {
        mark('jev-quality-line.md');
      }
    } else {
      gap('First onboarding prompt', 'post-purchase-email-eula.md', 'no session URL was passed');
      gap('Jev quality line', 'jev-quality-line.md', 'no session URL was passed');
    }
    gap('Live composer Jev tier', 'live-app-jev-tier.md', 'Jev-before-model is not its own screen; the Dialog PDF and the source check carry it');
    gap('Cursor project contract', 'cursor-project-contract.md', 'the contract is a repo file, not an app surface');
    gap('Telegram intake', 'tg-intake.md', 'Telegram intake is not a control on the guest website');

    await go(sharedUrl, 'Day-by-Day');
    let text = await bodyText(page);
    if (await isShell(page)) {
      gap('Initial itinerary', 'itinerary-layout.md', 'refused: shared trip still has the deleted card shell');
    } else {
      const layout = ['Day-by-Day', 'Flights', 'Hotels', 'Cars', 'Restaurants', 'Stores', 'The Rest'].every((label) => has(text, label));
      const slider = has(text, 'Vacation Day View') && has(text, 'Day 1');
      if (layout) {
        await shot('itinerary-layout', 'Initial itinerary', 'Standard itinerary layout', { file: 'itinerary-layout.md', note: sharedUrl });
        await shot('header-chrome', 'Initial itinerary', 'Header brand', { file: 'header-chrome.md', note: sharedUrl });
        await shot('autonomy', 'Initial itinerary', 'Autonomy bar', { file: 'autonomous-app-customer-flow.md', note: 'Real shared app, no card shell.' });
        await shot('packing', 'Initial itinerary', 'Packing', { file: 'packing.md', note: 'Packing tab stays hidden while share_packing is off.' });
      } else {
        gap('Standard itinerary layout', 'itinerary-layout.md', 'the shared trip did not show the Day-by-Day tab row');
      }
      if (slider) {
        await shot('slider-bars', 'Initial itinerary', 'Slider bars', { file: 'slider-bars.md', note: 'Vacation Day View timeline on the intake trip.' });
        if (has(text, 'Only things tagged for this day')) {
          await shot('maps', 'Initial itinerary', 'Day map', { file: 'maps.md', note: sharedUrl });
        }
      } else {
        gap('Slider bars', 'slider-bars.md', 'Vacation Day View was not on the intake trip');
      }
      if (await page.$('[aria-label="Record voice note"]')) {
        await shot('voice-note', 'Initial itinerary', 'Voice note', { file: 'voice-note.md', note: sharedUrl });
      } else {
        gap('Voice note', 'voice-note.md', 'Record voice note is not on the intake trip');
      }
      const logos = await page.evaluate(() => [...document.querySelectorAll('img')].some((img) => (img.src || '').includes('/ts-thing-logos/')));
      if (logos) {
        await shot('logos', 'Initial itinerary', 'Thing logos', { file: 'logos.md', note: sharedUrl });
      }
      if (!has(text, 'Budget')) gap('Budget on the test itinerary', 'budget.md', 'the Big Island shared trip has no Budget tab');
      if (has(text, 'No timeline-tagged things yet') || has(text, 'match those tags')) {
        await shot('empty-states', 'Initial itinerary', 'Empty states', { file: 'empty-states.md' });
      } else {
        gap('Empty states', 'empty-states.md', 'the filled intake days do not show the empty-state sentence');
      }
      if (has(text, 'Open navigation') || has(text, 'Close navigation')) {
        await shot('navigation', 'Initial itinerary', 'Navigation chrome', { file: 'navigation.md' });
      } else {
        gap('Navigation chrome', 'navigation.md', 'Open navigation and Close navigation are not on the guest page');
      }
      if (has(text, 'Mapbox') || has(text, 'Copy link')) {
        await shot('settings', 'Initial itinerary', 'TREK settings', { file: 'trek-settings.md' });
      } else {
        gap('TREK settings', 'trek-settings.md', 'Mapbox, weather, and copy-link settings are not on the guest page');
      }

      for (let day = 1; day <= 10; day += 1) {
        const label = `Day ${day}`;
        const opened = await clickText(page, label, { exact: true });
        if (!opened) {
          gap(label, 'slider-bars.md', `no ${label} chip on the intake trip`);
          continue;
        }
        await shot(`day-${String(day).padStart(2, '0')}`, 'Initial itinerary', label, { file: 'slider-bars.md', note: 'Intake trip day chip.' });
      }

      const tabs = ['Flights', 'Hotels', 'Cars', 'Restaurants', 'Stores', 'The Rest', 'Budget'];
      for (const label of tabs) {
        const opened = await clickText(page, label);
        if (!opened) {
          if (label !== 'Budget') gap(`${label} tab`, 'itinerary-layout.md', `${label} is not a tab on the intake trip`);
          continue;
        }
        const id = `tab-${label.toLowerCase().replace(/\s+/g, '-')}`;
        await shot(id, 'Initial itinerary', `${label} tab`, { file: 'itinerary-layout.md', note: sharedUrl });
        if (label === 'The Rest') {
          const rest = await bodyText(page);
          if (has(rest, 'All areas') || has(rest, 'All types')) {
            await shot('filters', 'Initial itinerary', 'Filters', { file: 'filters.md' });
          }
          const chips = await page.evaluate(() => Boolean(document.querySelector('[data-tag], .tag-chip, [aria-label="Tags"], [aria-label="Tag"]')));
          if (chips) {
            await shot('tags', 'Initial itinerary', 'Tags and chips', { file: 'tags-chips.md' });
          }
        }
        if (label === 'Budget') {
          await shot('budget', 'Initial itinerary', 'Budget', { file: 'budget.md', note: 'Big Island intake trip Budget tab.' });
        }
      }

      await clickText(page, 'Day-by-Day');
      const things = ['Big Island', 'Gardens', 'Groceries', 'Swim', 'Kailua-Kona house'];
      const openedThings = new Set();
      for (let day = 1; day <= 10 && openedThings.size < things.length; day += 1) {
        await clickText(page, `Day ${day}`, { exact: true });
        for (const name of things) {
          if (openedThings.has(name)) continue;
          const opened = await clickText(page, name);
          if (!opened) continue;
          await sleep(400);
          const detailText = await bodyText(page);
          if (has(detailText, 'Detail page') || has(detailText, 'DETAIL PAGE')) {
            const id = `thing-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
            await shot(id, 'Initial itinerary', `${name} detail`, { file: 'thing-pages.md', note: 'Intake trip Detail page.' });
            openedThings.add(name);
            if (!captured.has('dialog-screenshot-gate.md')) {
              await shot('screenshot-gate', 'Initial itinerary', 'Dialog screenshot gate', { file: 'dialog-screenshot-gate.md', note: 'Real Detail page, no card shell.' });
            }
            if (!captured.has('status.md') && (has(detailText, 'considering') || has(detailText, 'Status'))) {
              await shot(`status-${id}`, 'Initial itinerary', 'Status', { file: 'status.md', note: `${name} detail.` });
            }
            if (!captured.has('media-stories.md') && has(detailText, 'Story')) {
              await shot(`stories-${id}`, 'Initial itinerary', 'Stories and media', { file: 'media-stories.md', note: `${name} detail.` });
            }
            if (!captured.has('ratings-reviews.md') && (has(detailText, 'Google') || has(detailText, 'Yelp'))) {
              await shot(`ratings-${id}`, 'Initial itinerary', 'Ratings and reviews', { file: 'ratings-reviews.md', note: `${name} detail.` });
            }
            if (!captured.has('hotel-stay-fields.md') && (has(detailText, 'Check-in') || has(detailText, 'Stay'))) {
              await shot(`hotel-${id}`, 'Initial itinerary', 'Hotel stay fields', { file: 'hotel-stay-fields.md', note: `${name} detail.` });
            }
            await page.keyboard.press('Escape').catch(() => {});
            await sleep(200);
          }
        }
      }
      for (const name of things) {
        if (!openedThings.has(name)) gap(`${name} detail`, 'thing-pages.md', 'the Detail page did not open from the intake timeline');
      }

      if (await clickAria(page, 'PDFs')) {
        const printText = await bodyText(page);
        if (has(printText, 'PRINT / PDF') || has(printText, 'Daily printout')) {
          await shot('print-pdf', 'Initial itinerary', 'Print and PDF', { file: 'print-pdf.md' });
        }
        if (await clickText(page, 'Keepsakes') && await clickText(page, 'Admin')) {
          const admin = await bodyText(page);
          if (['Initial summary', 'Style one', 'Style two'].every((label) => has(admin, label))) {
            await shot('keepsakes-config', 'Initial itinerary', 'Keepsakes config defaults', { file: 'keepsakes-config.md' });
          }
        }
        await page.keyboard.press('Escape').catch(() => {});
      }
      if (await clickAria(page, 'Order Keepsakes')) {
        await shot('order-keepsakes', 'Initial itinerary', 'Order Keepsakes', { file: 'order-keepsakes.md' });
        await page.keyboard.press('Escape').catch(() => {});
      }
      if (await clickAria(page, 'Config Options')) {
        const configText = await bodyText(page);
        if (has(configText, 'TRIP VIEW')) {
          await shot('trip-view', 'Initial itinerary', 'Trip View config', { file: 'config-options-trip-view.md' });
        }
        await page.keyboard.press('Escape').catch(() => {});
      }
    }

    await go(referenceUrl, 'Day-by-Day');
    text = await bodyText(page);
    if (!captured.has('logos.md')) {
      const logos = await page.evaluate(() => [...document.querySelectorAll('img')].some((img) => (img.src || '').includes('/ts-thing-logos/')));
      if (logos) {
        await shot('logos-reference', 'Initial itinerary', 'Thing logos', { file: 'logos.md', note: 'Reference shared trip. The intake page had no thing logos.' });
      } else {
        gap('Thing logos', 'logos.md', 'no thing logo image on the intake trip or the reference trip');
      }
    }
    if (!captured.has('filters.md')) {
      if (await clickText(page, 'The Rest')) {
        const rest = await bodyText(page);
        if (has(rest, 'All areas') || has(rest, 'All types')) {
          await shot('filters-reference', 'Initial itinerary', 'Filters', { file: 'filters.md', note: 'Reference shared trip.' });
        }
      }
    }
    if (!captured.has('tags-chips.md')) gap('Tags and chips', 'tags-chips.md', 'tag chips are not a control on the real guest page');
    if (!captured.has('budget.md')) gap('Budget', 'budget.md', 'the Big Island intake trip did not open a Budget tab');
    if (!captured.has('flight-fields.md')) {
      await clickText(page, 'Day-by-Day');
      if (await clickText(page, 'SFO to LAS') && has(await bodyText(page), 'Takeoff')) {
        await shot('flight-fields', 'Initial itinerary', 'Flight fields', { file: 'flight-fields.md', note: 'Reference shared trip. The intake Flights tab has no Takeoff field.' });
        await page.keyboard.press('Escape').catch(() => {});
      } else {
        gap('Flight fields', 'flight-fields.md', 'Takeoff was not on the intake trip or the reference trip');
      }
    }
    if (!captured.has('happy-hour.md')) {
      if (await clickText(page, 'Carbone') && has(await bodyText(page), 'Happy hour')) {
        await shot('happy-hour', 'Initial itinerary', 'Happy hour', { file: 'happy-hour.md', note: 'Reference shared trip.' });
        await page.keyboard.press('Escape').catch(() => {});
      } else {
        gap('Happy hour', 'happy-hour.md', 'Happy hour was not on a Thing page');
      }
    }
    if (!captured.has('car-fields.md')) {
      await clickText(page, 'Cars');
      const clickedCar = await page.evaluate(() => {
        const norm = (node) => (node.innerText || '').replace(/\s+/g, ' ').trim();
        const button = [...document.querySelectorAll('button')].find((node) => {
          const text = norm(node);
          return /car/i.test(text) && !/Cars/.test(text) && !/Day-by-Day|Flights|Hotels|Restaurants|Stores/.test(text);
        });
        if (!button) return false;
        button.click();
        return true;
      });
      await sleep(600);
      if (clickedCar && has(await bodyText(page), 'Rental company')) {
        await shot('car-fields', 'Initial itinerary', 'Car fields', { file: 'car-fields.md', note: 'Reference shared trip.' });
      } else {
        gap('Car fields', 'car-fields.md', 'Rental company was not on the intake trip or the reference trip');
      }
    }
    if (!captured.has('print-pdf.md') && await clickAria(page, 'PDFs')) {
      if (has(await bodyText(page), 'PRINT / PDF') || has(await bodyText(page), 'Daily printout')) {
        await shot('print-pdf-reference', 'Initial itinerary', 'Print and PDF', { file: 'print-pdf.md', note: 'Reference shared trip.' });
      }
      if (!captured.has('keepsakes-config.md') && await clickText(page, 'Keepsakes') && await clickText(page, 'Admin')) {
        const admin = await bodyText(page);
        if (['Initial summary', 'Style one', 'Style two'].every((label) => has(admin, label))) {
          await shot('keepsakes-config-reference', 'Initial itinerary', 'Keepsakes config defaults', { file: 'keepsakes-config.md', note: 'Reference shared trip.' });
        }
      }
      await page.keyboard.press('Escape').catch(() => {});
    }
    if (!captured.has('order-keepsakes.md') && await clickAria(page, 'Order Keepsakes')) {
      await shot('order-keepsakes-reference', 'Initial itinerary', 'Order Keepsakes', { file: 'order-keepsakes.md', note: 'Reference shared trip.' });
    }
    if (!captured.has('config-options-trip-view.md') && await clickAria(page, 'Config Options') && has(await bodyText(page), 'TRIP VIEW')) {
      await shot('trip-view-reference', 'Initial itinerary', 'Trip View config', { file: 'config-options-trip-view.md', note: 'Reference shared trip.' });
    }
    if (!captured.has('status.md') || !captured.has('ratings-reviews.md') || !captured.has('media-stories.md') || !captured.has('hotel-stay-fields.md')) {
      await clickText(page, 'Day-by-Day');
      if (await clickText(page, 'Bellagio')) {
        const detail = await bodyText(page);
        if (!captured.has('status.md') && has(detail, 'considering')) {
          await shot('status-reference', 'Initial itinerary', 'Status', { file: 'status.md', note: 'Reference shared trip.' });
        }
        if (!captured.has('media-stories.md') && has(detail, 'Story')) {
          await shot('stories-reference', 'Initial itinerary', 'Stories and media', { file: 'media-stories.md', note: 'Reference shared trip.' });
        }
        if (!captured.has('ratings-reviews.md') && (has(detail, 'Google') || has(detail, 'Yelp'))) {
          await shot('ratings-reference', 'Initial itinerary', 'Ratings and reviews', { file: 'ratings-reviews.md', note: 'Reference shared trip.' });
        }
        if (!captured.has('hotel-stay-fields.md') && (has(detail, 'Check-in') || has(detail, 'Stay'))) {
          await shot('hotel-reference', 'Initial itinerary', 'Hotel stay fields', { file: 'hotel-stay-fields.md', note: 'Reference shared trip.' });
        }
        if (!captured.has('collaborators.md') && (has(detail, 'View-only') || has(detail, 'collaborat'))) mark('collaborators.md');
      }
    }

    const counts = await sharedCounts(sharedUrl);
    if (counts.minThings) {
      await go(sharedUrl, 'Day-by-Day');
      if (await clickText(page, 'Restaurants')) {
        await shot('min-things', 'Initial itinerary', 'Initial fill minimums', {
          file: 'min-things.md',
          note: 'Big Island intake trip meets restaurant 15, store 10, and attraction 15.',
        });
      }
    } else {
      gap('Initial fill minimums', 'min-things.md', 'the Big Island intake trip is below restaurant 15, store 10, or attraction 15');
    }

    async function captureKeepsake(base, label) {
      const rootUrl = base.endsWith('/') ? base : `${base}/`;
      await go(`${rootUrl}journey?style=1`);
      await page.waitForFunction(() => location.href.includes('style=1') || location.href.includes('printMode'), { timeout: 20000 }).catch(() => {});
      const style1 = page.url().includes('vacation-staging') && page.url().includes('style=1') && !page.url().includes('travel.timesyncher.com');
      if (style1 && !await isShell(page) && !captured.has('keepsake-style-one.md')) {
        await shot(`style-one-${label}`, 'Initial itinerary', 'Keepsake Style one', { file: 'keepsake-style-one.md', note: 'Stays on vacation-staging.' });
      }
      await go(`${rootUrl}journey?style=2`);
      const style2 = page.url().includes('vacation-staging') && page.url().includes('keepsake-style-2') && !page.url().includes('travel.timesyncher.com');
      if (style2 && !await isShell(page) && !captured.has('keepsake-style-two.md')) {
        await shot(`style-two-${label}`, 'Initial itinerary', 'Keepsake Style two', { file: 'keepsake-style-two.md', note: 'Stays on vacation-staging.' });
        await shot(`keepsake-qa-${label}`, 'Initial itinerary', 'Keepsake QA', { file: 'keepsake-qa.md', note: 'Style two stays on vacation-staging.' });
      }
    }

    await captureKeepsake(sharedUrl, 'intake');
    if (!captured.has('keepsake-style-one.md') || !captured.has('keepsake-style-two.md')) {
      await captureKeepsake(referenceUrl, 'reference');
    }
    if (!captured.has('keepsake-style-one.md')) gap('Keepsake Style one', 'keepsake-style-one.md', 'style=1 did not stay on vacation-staging');
    if (!captured.has('keepsake-style-two.md')) gap('Keepsake Style two', 'keepsake-style-two.md', 'style=2 did not stay on vacation-staging');
    if (!captured.has('keepsake-qa.md')) gap('Keepsake QA', 'keepsake-qa.md', 'Style two did not stay on vacation-staging');

    await go(`${staging}/login.html`);
    let language = has(await bodyText(page), 'language');
    if (!language) {
      await go(staging);
      language = has(await bodyText(page), 'language');
    }
    if (language) {
      await shot('language', 'Initial itinerary', 'Language', { file: 'language.md' });
    } else {
      gap('Language', 'language.md', 'no language control on login.html or the site root');
    }

    if (!preCollabPayload) {
      gap('Separate initial snapshot', '', 'the drive did not store a pre-collaborator itinerary snapshot');
    }
    const collabNames = [
      ['kimberly', 'Kimberly'],
      ['tyler', 'Tyler'],
      ['lauren', 'Lauren'],
    ];
    let collabArrived = 0;
    for (const [id, name] of collabNames) {
      const html = await readMail(mailDir, `${id}.html`);
      if (!html) {
        gap(`${name} collaborator email`, 'collaborators.md', `${name}'s invite was not captured from an inbox`);
        continue;
      }
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      await sleep(200);
      await shot(`email-${id}`, 'Onboarding email', `${name} collaborator invite`, {
        file: 'collaborators.md',
        note: 'Arrived collaborator invite.',
      });
      collabArrived += 1;
    }
    const storedCollab = await onboardingEmailCount(token);
    if (storedCollab.collaborator < 3 || collabArrived < 3) {
      gap('Collaborator onboarding emails', 'collaborators.md', 'Kimberly, Tyler, and Lauren each need a stored sent invite and an arrived copy');
    }

    usePreCollab = false;
    await go(sharedUrl, 'Day-by-Day');
    if (await isShell(page)) {
      gap('Final itinerary', 'itinerary-layout.md', 'refused: the live trip still has the deleted card shell');
    } else {
      await shot('final-itinerary-layout', 'Final itinerary', 'Standard itinerary layout', {
        file: 'itinerary-layout.md',
        note: 'Live trip after collaborator notes. Not the pre-collaborator snapshot.',
      });
      for (let day = 1; day <= 10; day += 1) {
        const label = `Day ${day}`;
        if (!await clickText(page, label, { exact: true })) {
          gap(`Final ${label}`, 'slider-bars.md', `no ${label} chip on the live trip`);
          continue;
        }
        await shot(`final-day-${String(day).padStart(2, '0')}`, 'Final itinerary', label, {
          file: 'slider-bars.md',
          note: 'Live trip after collaborator notes.',
        });
      }
      for (const label of ['Flights', 'Hotels', 'Cars', 'Restaurants', 'Stores', 'The Rest', 'Budget']) {
        if (!await clickText(page, label)) continue;
        await shot(`final-tab-${label.toLowerCase().replace(/\s+/g, '-')}`, 'Final itinerary', `${label} tab`, {
          file: label === 'Budget' ? 'budget.md' : 'itinerary-layout.md',
          note: 'Live trip after collaborator notes.',
        });
      }
      await clickText(page, 'Day-by-Day');
      const finalThings = ['Big Island', 'Gardens', 'Swim', 'Kailua-Kona house'];
      const seenFinal = new Set();
      for (let day = 1; day <= 10 && seenFinal.size < finalThings.length; day += 1) {
        await clickText(page, `Day ${day}`, { exact: true });
        for (const name of finalThings) {
          if (seenFinal.has(name)) continue;
          if (!await clickText(page, name)) continue;
          await sleep(400);
          const detailText = await bodyText(page);
          if (!(has(detailText, 'Detail page') || has(detailText, 'DETAIL PAGE'))) continue;
          const id = `final-thing-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
          await shot(id, 'Final itinerary', `${name} detail`, {
            file: 'thing-pages.md',
            note: 'Live detail after collaborator notes.',
          });
          seenFinal.add(name);
          await page.keyboard.press('Escape').catch(() => {});
          await sleep(200);
        }
      }
    }
  } finally {
    await browser.close();
  }

  for (const feature of features) {
    if (!captured.has(feature.file) && !gaps.some((item) => item.file === feature.file)) {
      gap(feature.title, feature.file, 'no screenshot was captured for this feature file');
    }
  }

  const manifest = {
    title: 'Screenshot Journey',
    subtitle: 'Real TimeSyncher app. Dialog PDF is the companion document. Shell screens are omitted.',
    pages,
    gaps,
  };
  const manifestPath = path.join(outDir, 'journey-manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const pdfPath = path.join(outDir, 'screenshot-journey.pdf');
  const built = spawnSync('python3', [path.join(root, 'scripts/screenshot_journey_pdf.py'), manifestPath, pdfPath], { encoding: 'utf8' });
  if (built.status !== 0) {
    process.stderr.write(built.stderr || built.stdout || 'pdf build failed\n');
    process.exit(1);
  }
  const sha = createHash('sha256').update(await readFile(pdfPath)).digest('hex');
  await writeJourneySection(verifyPath, features.length, captured, gaps, sha);
  process.stdout.write(`screenshot-journey.pdf sha256 ${sha}\n`);
  process.stdout.write(`pages ${pages.length} gaps ${gaps.length} features ${captured.size} of ${features.length}\n`);
}

async function sharedCounts(referenceUrl) {
  const slug = new URL(referenceUrl).pathname.split('/').filter(Boolean).pop();
  const headers = {};
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS;
  if (bypass) headers['x-vercel-protection-bypass'] = bypass;
  const response = await fetch(`${staging}/api/shared/${slug}`, { headers });
  if (!response.ok) return { minThings: false };
  const data = await response.json();
  const counts = {};
  for (const place of data.places || []) counts[place.category_name || ''] = (counts[place.category_name || ''] || 0) + 1;
  return { minThings: (counts.Restaurant || 0) >= 15 && (counts.Store || 0) >= 10 && (counts.Attraction || 0) >= 15 };
}

async function onboardingEmailCount(token) {
  if (!token || !process.env.DATABASE_URL) return { collaborator: 0 };
  const { sql } = await import('../src/vacation/db.mjs');
  const db = sql(process.env);
  const rows = await db`
    select count(distinct i.requested_for)::int as n
    from vacation_collaborator_invites i
    join outbound_emails e on e.metadata->>'collaboratorInviteId' = i.id::text
    where i.trip_id = (
      select trip_id from onboarding_sessions where token = ${token} limit 1
    )
      and i.requested_for in ('Kimberly Davidson', 'Tyler Davidson', 'Lauren Davidson')
      and e.status = 'sent'
  `;
  return { collaborator: Number(rows[0]?.n || 0) };
}

async function writeJourneySection(verifyPath, featureCount, captured, gaps, sha) {
  let existing = '';
  try {
    existing = await readFile(verifyPath, 'utf8');
  } catch {
    existing = '# Verification table\n';
  }
  const lines = [
    '## Screenshot journey',
    '',
    '`scripts/screenshot-journey-pdf.mjs` overwrites `screenshot-journey.pdf`. The real-app gate runs first. The script does not redeem a coupon.',
    '',
    `Captured feature files: ${captured.size} of ${featureCount}.`,
    `screenshot-journey.pdf sha256 \`${sha}\`.`,
    '',
    '### Not captured',
    '',
    ...(gaps.length ? gaps.map((item) => `- ${item.feature}${item.file ? ` (\`${item.file}\`)` : ''}): ${item.reason}`) : ['- None.']),
    '',
  ];
  const section = lines.join('\n');
  const heading = '## Screenshot journey';
  const index = existing.indexOf(heading);
  const next = index === -1 ? `${existing.trimEnd()}\n\n${section}` : `${existing.slice(0, index)}${section}`;
  await writeFile(verifyPath, next);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
