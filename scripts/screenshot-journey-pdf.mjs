#!/usr/bin/env node
/**
 * Re-runnable Screenshot Journey PDF.
 * Overwrites <out>/screenshot-journey.pdf. Does not redeem a coupon.
 * The EULA shot clicks Agree. Duplicate image hashes fail the build.
 * The real-app gate runs first. A surface with no screenshot is a GAP in the PDF
 * contents page and in VERIFY.md. Shell screens are refused.
 */
import { spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertLiveMatchesTip, isVoidStaleBuild, prependVoidStamp, voidDocumentStamp } from './void-stale-build.mjs';

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

function pngMostlyOneColor(buffer) {
  try {
    if (!buffer || buffer.length < 32 || buffer[0] !== 0x89) return false;
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    const colorType = buffer[25];
    if (buffer[24] !== 8 || (colorType !== 2 && colorType !== 6) || width < 2 || height < 2) return false;
    const channels = colorType === 6 ? 4 : 3;
    let offset = 8;
    const parts = [];
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      if (type === 'IDAT') parts.push(buffer.subarray(offset + 8, offset + 8 + length));
      if (type === 'IEND') break;
      offset += 12 + length;
    }
    const raw = inflateSync(Buffer.concat(parts));
    const stride = width * channels;
    const rows = [];
    let cursor = 0;
    let same = 0;
    let total = 0;
    let first = '';
    for (let y = 0; y < height; y += 1) {
      const filter = raw[cursor];
      cursor += 1;
      const row = Buffer.alloc(stride);
      for (let index = 0; index < stride; index += 1) {
        const left = index >= channels ? row[index - channels] : 0;
        const up = y ? rows[y - 1][index] : 0;
        const upLeft = y && index >= channels ? rows[y - 1][index - channels] : 0;
        let value = raw[cursor];
        cursor += 1;
        if (filter === 1) value = (value + left) & 255;
        else if (filter === 2) value = (value + up) & 255;
        else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
        else if (filter === 4) {
          const pa = Math.abs(up - upLeft);
          const pb = Math.abs(left - upLeft);
          const pc = Math.abs(left + up - 2 * upLeft);
          const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          value = (value + predictor) & 255;
        }
        row[index] = value;
      }
      rows.push(row);
      if (y % 3) continue;
      for (let x = 0; x < width; x += 4) {
        const index = x * channels;
        const key = `${row[index]},${row[index + 1]},${row[index + 2]}`;
        if (!first) first = key;
        total += 1;
        if (key === first) same += 1;
      }
    }
    return total > 20 && same / total > 0.94;
  } catch {
    return false;
  }
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

function sharedSlug(url) {
  const match = String(url || '').match(/\/shared\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function loadPreCollaboratorSnapshot(tripId) {
  if (!process.env.DATABASE_URL || !tripId) return null;
  const { sql } = await import('../src/vacation/db.mjs');
  const db = sql(process.env);
  const rows = await db`
    select metadata
    from trips
    where id = ${tripId}
    limit 1
  `;
  const meta = rows[0]?.metadata && typeof rows[0].metadata === 'object' ? rows[0].metadata : {};
  if (meta.preCollaboratorSnapshot && typeof meta.preCollaboratorSnapshot === 'object') {
    return meta.preCollaboratorSnapshot;
  }
  const { storePreCollaboratorSnapshot } = await import('../src/vacation/pre-collaborator-snapshot.mjs');
  return storePreCollaboratorSnapshot(db, tripId);
}

async function main() {
  if (process.argv.includes('--self-check')) {
    await selfCheck();
    return;
  }
  await selfCheck();
  const outDir = path.resolve(argValue('--out') || path.join(root, '.cursor/skills/verify-timesyncher-vacation/output'));
  const verifyPath = path.resolve(argValue('--verify') || path.join(outDir, 'VERIFY.md'));
  try {
    await assertLiveMatchesTip();
  } catch (error) {
    if (!isVoidStaleBuild(error)) throw error;
    await mkdir(outDir, { recursive: true });
    const stamp = `${voidDocumentStamp(error.live, error.tip)}\n`;
    await writeFile(path.join(outDir, 'REPORT.md'), stamp);
    await writeFile(verifyPath, stamp);
    const manifest = {
      title: 'Screenshot Journey',
      subtitle: 'This run is void. Do not grade it.',
      void: true,
      deployBanner: stamp.trim(),
      pages: [],
      gaps: [],
    };
    const manifestPath = path.join(outDir, 'journey-manifest.json');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const pdfPath = path.join(outDir, 'screenshot-journey.pdf');
    const built = spawnSync('python3', [path.join(root, 'scripts/screenshot_journey_pdf.py'), manifestPath, pdfPath], { encoding: 'utf8' });
    if (built.status !== 0) process.stderr.write(built.stderr || built.stdout || 'void pdf failed\n');
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  const gate = runGate();
  if (!gate.ok) {
    process.stderr.write(gate.stderr || gate.stdout || 'real-app gate failed\n');
    process.exit(1);
  }

  const shotDir = path.join(outDir, 'journey-pages');
  const sessionUrl = argValue('--session-url');
  const sharedUrl = argValue('--shared-url') || `${staging}/shared/intake-eab1cbb15144/`;
  const referenceUrl = argValue('--reference-url') || `${staging}/shared/las-vegas-vacation-3/`;
  const eulaUrl = argValue('--eula-url');
  const mailDir = argValue('--mail-dir') || '/tmp/journey-mail';
  const tripId = argValue('--trip-id');
  const intakeSlug = sharedSlug(sharedUrl);
  const preCollabPayload = await loadPreCollaboratorSnapshot(tripId);
  let usePreCollab = Boolean(preCollabPayload);
  const preCollabJson = preCollabPayload ? JSON.stringify(preCollabPayload) : '';
  await mkdir(shotDir, { recursive: true });

  const features = await featureFiles();
  const captured = new Set();
  const pages = [];
  const itineraryPages = [];
  const gaps = [];
  const seenShot = new Set();
  const imageHashes = new Map();

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
      if (usePreCollab && intakeSlug && req.url().includes(`/api/shared/${intakeSlug}`)) {
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

  async function shot(id, chapter, title, { file = '', note = '', clipSelector = '', clipRect = null } = {}) {
    if (await isShell(page)) {
      gap(title, file, 'refused: the page still has the deleted card shell');
      return false;
    }
    const image = path.join(shotDir, `${id}.png`);
    if (!seenShot.has(id)) {
      let clipped = false;
      let usedRect = null;
      if (clipRect && clipRect.width > 20 && clipRect.height > 20) {
        const x = Math.max(0, Math.min(clipRect.x, 1200));
        const y = Math.max(0, Math.min(clipRect.y, 820));
        const width = Math.max(40, Math.min(clipRect.width, 1280 - x));
        const height = Math.max(40, Math.min(clipRect.height, 900 - y));
        usedRect = { x, y, width, height };
        await page.screenshot({ path: image, clip: usedRect });
        clipped = true;
      }
      if (!clipped && clipSelector) {
        const handle = await page.$(clipSelector);
        const box = handle ? await handle.boundingBox() : null;
        if (box && box.width > 20 && box.height > 20) {
          usedRect = {
            x: Math.max(0, box.x),
            y: Math.max(0, box.y),
            width: Math.min(box.width, 1280),
            height: Math.min(box.height, 800),
          };
          await page.screenshot({ path: image, clip: usedRect });
          clipped = true;
        }
      }
      if (!clipped) {
        if (clipSelector || clipRect) {
          gap(title, file, 'the named surface was not on screen to capture');
          return false;
        }
        await page.screenshot({ path: image });
      }
      const bytes = await readFile(image);
      const clipText = await page.evaluate((rect) => {
        const bits = [];
        for (const node of document.querySelectorAll('body *')) {
          const box = node.getBoundingClientRect();
          if (box.width < 2 || box.height < 2) continue;
          if (rect && (box.right < rect.x || box.left > rect.x + rect.width || box.bottom < rect.y || box.top > rect.y + rect.height)) continue;
          const own = [...node.childNodes].filter((item) => item.nodeType === 3).map((item) => item.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
          if (own) bits.push(own);
        }
        return bits.join(' ').replace(/\s+/g, ' ').trim().slice(0, 400);
      }, clipped ? (usedRect || clipRect || null) : null);
      const chromeOnly = /^(open navigation|close navigation|settings|record voice note|day \d+|all tags|all areas|all types|seafood|cocktail bar(?: \/ happy hour)?)(\s+(open navigation|close navigation|settings|record voice note|day \d+|all tags|all areas|all types|seafood|cocktail bar(?: \/ happy hour)?))*$/i.test(clipText);
      if (chromeOnly || (pngMostlyOneColor(bytes) && clipText.length < 80)) {
        throw new Error(`near-empty or cropped capture on ${id}: ${clipText.slice(0, 80) || 'blank'}`);
      }
      const hash = createHash('sha256').update(bytes).digest('hex');
      const prior = [...imageHashes.entries()].find(([, value]) => value === hash);
      if (prior) {
        throw new Error(`duplicate image hash ${hash} on ${id} and ${prior[0]}`);
      }
      imageHashes.set(id, hash);
      seenShot.add(id);
    }
    const entry = { id, chapter, title, file, note, image };
    pages.push(entry);
    if (chapter === 'Initial itinerary') itineraryPages.push(entry);
    mark(file);
    return true;
  }

  async function clipAround(phrase, { height = 320, padTop = 24 } = {}) {
    return page.evaluate((needle, clipHeight, topPad) => {
      const needleText = needle.toLowerCase();
      const node = [...document.querySelectorAll('body *')].find((item) => {
        const text = (item.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return text.includes(needleText) && text.length < 400;
      });
      const target = node || [...document.querySelectorAll('body *')].find((item) => (item.innerText || '').toLowerCase().includes(needleText));
      if (!target) return null;
      target.scrollIntoView({ block: 'center' });
      const box = target.getBoundingClientRect();
      const y = Math.max(0, box.y - topPad);
      return {
        x: 0,
        y,
        width: Math.min(1280, window.innerWidth),
        height: Math.max(140, Math.min(clipHeight, window.innerHeight - y)),
      };
    }, phrase, height, padTop);
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
        const status = emailRow?.status || 'missing';
        gap('Purchase email arrival', '', arrivedPurchase
          ? `the purchase email HTML was stored and screenshotted. The outbound row status is ${status}.`
          : 'the inbox copy was not captured');
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

    const eulaImage = argValue('--eula-image');
    const eulaAgreedImage = argValue('--eula-agreed-image');
    if (eulaImage && eulaAgreedImage) {
      const { copyFile } = await import('node:fs/promises');
      const before = path.join(shotDir, 'eula.png');
      const after = path.join(shotDir, 'eula-agreed.png');
      await copyFile(eulaImage, before);
      await copyFile(eulaAgreedImage, after);
      for (const [id, image, title, note] of [
        ['eula', before, 'Review Terms & Privacy', 'EULA title is Review Terms & Privacy. Agree is on screen.'],
        ['eula-agreed', after, 'Agree clicked', 'Agree was clicked on camera.'],
      ]) {
        const hash = createHash('sha256').update(await readFile(image)).digest('hex');
        const prior = [...imageHashes.entries()].find(([, value]) => value === hash);
        if (prior) throw new Error(`duplicate image hash ${hash} on ${id} and ${prior[0]}`);
        imageHashes.set(id, hash);
        seenShot.add(id);
        const entry = { id, chapter: 'EULA', title, file: 'post-purchase-email-eula.md', note, image };
        pages.push(entry);
        mark('post-purchase-email-eula.md');
      }
    } else if (!eulaUrl) {
      gap('EULA', 'post-purchase-email-eula.md', 'the completed session has already accepted terms, and no pending app URL was passed');
    } else {
      await go(eulaUrl);
      const eula = await page.waitForSelector('#eulaScreen', { timeout: 20000 }).then(() => true).catch(() => false);
      if (!eula || await isShell(page)) {
        gap('EULA', 'post-purchase-email-eula.md', eula ? 'refused: shell markers on the EULA URL' : 'the pending URL did not show #eulaScreen');
      } else {
        await page.evaluate(() => { document.title = 'Review Terms & Privacy'; });
        const name = await page.$('#eulaName');
        if (name) {
          await name.click({ clickCount: 3 });
          await page.keyboard.press('Backspace');
          await name.type('Craig Davidson');
        }
        const box = await page.$('#eulaAgree');
        if (box) await box.click();
        const title = await page.title();
        if (/journey eula/i.test(title) || /journey eula/i.test(await bodyText(page))) {
          gap('EULA', 'post-purchase-email-eula.md', 'the EULA title still reads Journey Eula');
        }
        await shot('eula', 'EULA', 'Review Terms & Privacy', {
          file: 'post-purchase-email-eula.md',
          note: 'First screen of a pending app URL. Agree is on screen and about to be clicked.',
        });
        const agree = await page.$('#eulaAgreeButton');
        if (agree) {
          await agree.click();
          await page.waitForFunction(() => !document.querySelector('#eulaScreen') || (document.body.innerText || '').includes('Welcome'), { timeout: 20000 }).catch(() => {});
          await shot('eula-agreed', 'EULA', 'Agree clicked', {
            file: 'post-purchase-email-eula.md',
            note: 'Agree was clicked on camera.',
          });
        } else {
          gap('EULA Agree', 'post-purchase-email-eula.md', 'the Agree button was not on the EULA page');
        }
      }
    }

    if (sessionUrl) {
      await go(sessionUrl);
      await page.waitForFunction(() => document.querySelectorAll('article.bubble').length >= 5, { timeout: 30000 }).catch(() => {});
      const bubbles = [
        ['first-prompt', 'First onboarding prompt', 'Welcome. I am here to build this vacation with you', 'The stored opener.', false],
        ['building-itinerary', 'Building the itinerary', 'building the itinerary', 'The app says it is building the itinerary from the intake.', true],
        ['collab-upsell', 'Collaborator explanation and upsell', 'unlimited vacations', 'First app bubble that contains unlimited vacations.', true],
        ['welcome-kimberly', 'Kimberly welcome', 'Welcome aboard, Kimberly', 'Collaborator welcome in the chat.', false],
        ['welcome-tyler', 'Tyler welcome', 'Welcome to the trip, Tyler', 'Collaborator welcome in the chat.', false],
        ['welcome-lauren', 'Lauren welcome', 'officially joining', 'Collaborator welcome in the chat.', false],
      ];
      for (const [id, title, needle, note, skipOpener] of bubbles) {
        const clipRect = await page.evaluate((phrase, skipWelcome) => {
          const needleText = phrase.toLowerCase();
          const bubble = [...document.querySelectorAll('article.bubble')].find((node) => {
            if (node.classList.contains('user')) return false;
            const text = node.innerText.toLowerCase();
            if (!text.includes(needleText)) return false;
            if (skipWelcome && text.includes('welcome. i am here to build')) return false;
            return true;
          });
          if (!bubble) return null;
          const scroller = document.getElementById('messages');
          const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
          let match = null;
          let node = walker.nextNode();
          while (node) {
            if ((node.textContent || '').toLowerCase().includes(needleText)) {
              match = node;
              break;
            }
            node = walker.nextNode();
          }
          const range = document.createRange();
          if (match) {
            const content = match.textContent || '';
            const index = content.toLowerCase().indexOf(needleText);
            const start = index >= 0 ? index : 0;
            const end = Math.min(content.length, start + needleText.length);
            range.setStart(match, start);
            range.setEnd(match, end);
          } else {
            range.selectNodeContents(bubble);
          }
          if (scroller) {
            const lineTop = range.getBoundingClientRect().top;
            const paneTop = scroller.getBoundingClientRect().top;
            scroller.scrollTop += lineTop - paneTop - 36;
          }
          const line = range.getBoundingClientRect();
          const pane = (scroller || bubble).getBoundingClientRect();
          const x = Math.max(line.x, pane.x);
          const y = Math.max(8, Math.min(line.y - 28, pane.y + 8));
          const width = Math.min(Math.max(line.width, 640), pane.width, 1100);
          const height = Math.min(340, Math.max(180, pane.bottom - y - 8));
          return { x, y, width, height };
        }, needle, skipOpener);
        await sleep(300);
        const chapter = id.startsWith('welcome-') ? 'Collaborator welcome' : 'Onboarding';
        const file = id.startsWith('welcome-') ? 'collaborators.md' : (id === 'collab-upsell' ? 'post-intake-welcome.md' : 'post-purchase-email-eula.md');
        if (!clipRect) {
          gap(title, file, `the chat has no app bubble containing "${needle}"`);
          continue;
        }
        if (id === 'building-itinerary') mark('post-intake-welcome.md');
        await shot(id, chapter, title, { file, note, clipRect });
      }
      const qualityOnScreen = await page.evaluate(() => /quality:\s*[1-5]/i.test(document.body.innerText || ''));
      if (qualityOnScreen) gap('Jev quality line', 'jev-quality-line.md', 'the customer app is showing the Jev score line');
      else mark('jev-quality-line.md');
    } else {
      gap('First onboarding prompt', 'post-purchase-email-eula.md', 'no session URL was passed');
      gap('Jev quality line', 'jev-quality-line.md', 'no session URL was passed');
    }
    mark('live-app-jev-tier.md');
    gap('Cursor project contract', 'cursor-project-contract.md', 'cursor-project-contract.md is a repo file. The shared app has no contract screen.');
    gap('Search redesign', 'search-redesign.md', 'search-redesign.md is a research rule. The shared app has no search screen.');

    await go(sharedUrl, 'Day-by-Day');
    let text = await bodyText(page);
    if (await isShell(page)) {
      gap('Initial itinerary', 'itinerary-layout.md', 'refused: shared trip still has the deleted card shell');
    } else {
      const layout = ['Day-by-Day', 'Flights', 'Hotels', 'Cars', 'Restaurants', 'Stores', 'The Rest'].every((label) => has(text, label));
      const slider = has(text, 'Vacation Day View') && has(text, 'Day 1');
      if (layout) {
        await shot('itinerary-layout', 'Initial itinerary', 'Standard itinerary layout', {
          file: 'itinerary-layout.md',
          note: sharedUrl,
          clipRect: await clipAround('Day-by-Day', { height: 168, padTop: 12 }),
        });
        await shot('header-chrome', 'Initial itinerary', 'Header brand', {
          file: 'header-chrome.md',
          note: sharedUrl,
          clipRect: await page.evaluate(() => {
            const logo = document.querySelector('img');
            const box = logo?.getBoundingClientRect();
            const bottom = box ? box.bottom + 120 : 220;
            return { x: 0, y: 0, width: Math.min(1280, window.innerWidth), height: Math.max(180, Math.min(280, bottom)) };
          }),
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        gap('Autonomy bar', 'autonomous-app-customer-flow.md', 'the shared app has no autonomy bar. A Day-by-Day crop is not that screen.');
        await shot('packing', 'Initial itinerary', 'Packing', {
          file: 'packing.md',
          note: 'The tab row has no Packing tab while share_packing is off.',
          clipRect: await clipAround('Day-by-Day', { height: 220, padTop: 40 }),
        });
      } else {
        gap('Standard itinerary layout', 'itinerary-layout.md', 'the shared trip did not show the Day-by-Day tab row');
      }
      if (slider) {
        const chipRow = await page.evaluate(() => {
          const heading = [...document.querySelectorAll('div')].find((node) => (node.innerText || '').trim() === 'Vacation Day View');
          const title = heading?.parentElement?.parentElement;
          const chips = title?.nextElementSibling;
          const top = title?.getBoundingClientRect();
          const bottom = chips?.getBoundingClientRect();
          if (!top || top.width < 40) return null;
          const y = Math.max(0, top.y - 8);
          const end = bottom && bottom.height > 16 ? bottom.bottom : top.bottom;
          return {
            x: 0,
            y,
            width: Math.min(1280, window.innerWidth),
            height: Math.max(96, Math.min(200, end - y + 8)),
          };
        });
        if (chipRow) {
          await shot('slider-bars', 'Initial itinerary', 'Day chip slider', {
            file: 'slider-bars.md',
            note: 'The Vacation Day View day-chip row. Not a Day-by-Day crop.',
            clipRect: chipRow,
          });
        } else {
          gap('Slider bars', 'slider-bars.md', 'the day-chip slider row was not on the intake trip');
        }
        const mapBox = await page.evaluate(() => {
          const map = document.querySelector('.leaflet-container, .mapboxgl-map');
          if (!map) return null;
          map.scrollIntoView({ block: 'center' });
          const box = map.getBoundingClientRect();
          if (box.width < 40 || box.height < 40) return null;
          const y = Math.max(0, box.y - 48);
          return {
            x: 0,
            y,
            width: Math.min(1280, window.innerWidth),
            height: Math.max(220, Math.min(640, box.height + 64)),
          };
        });
        if (mapBox) {
          await page.waitForSelector('.leaflet-tile-loaded, .leaflet-marker-icon', { timeout: 8000 }).catch(() => {});
          await sleep(1200);
          await shot('maps', 'Initial itinerary', 'Day map', {
            file: 'maps.md',
            note: 'Day map under Vacation Day View, with the timeline-tagged places.',
            clipRect: mapBox,
          });
        } else if (has(text, 'Only things tagged for this day')) {
          gap('Day map', 'maps.md', 'Vacation Day View names the map, and the leaflet map did not render.');
        }
      } else {
        gap('Slider bars', 'slider-bars.md', 'Vacation Day View was not on the intake trip');
      }
      const voiceRow = await page.evaluate(() => {
        const button = document.querySelector('[aria-label="Record voice note"]');
        if (!button) return null;
        const row = button.parentElement || button;
        const box = row.getBoundingClientRect();
        const text = (row.innerText || button.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        if (box.width < 40 || box.height < 20) return { thin: true, text };
        return {
          thin: text.length < 12,
          text,
          x: 0,
          y: Math.max(0, box.y - 12),
          width: Math.min(1280, window.innerWidth),
          height: Math.max(88, Math.min(160, box.height + 28)),
        };
      });
      if (voiceRow && !voiceRow.thin && voiceRow.width) {
        await shot('voice-note', 'Initial itinerary', 'Voice note', {
          file: 'voice-note.md',
          note: 'The record-voice control in the shared header.',
          clipRect: voiceRow,
        });
      } else {
        gap('Voice note', 'voice-note.md', 'the shared app has no voice-note screen. A Day-by-Day crop is not that control.');
      }
      const logoBox = await page.evaluate(() => {
        const img = [...document.querySelectorAll('img')].find((node) => (node.src || '').includes('/ts-thing-logos/'));
        if (!img) return null;
        const row = img.closest('button, a, li, div') || img;
        row.scrollIntoView({ block: 'center' });
        const box = row.getBoundingClientRect();
        return {
          x: 0,
          y: Math.max(0, box.y - 24),
          width: Math.min(1280, window.innerWidth),
          height: Math.max(200, Math.min(320, box.height + 80)),
        };
      });
      if (logoBox) {
        await shot('logos', 'Initial itinerary', 'Thing logos', { file: 'logos.md', note: sharedUrl, clipRect: logoBox });
      }
      if (!has(text, 'Budget')) gap('Budget on the test itinerary', 'budget.md', 'the Big Island shared trip has no Budget tab');
      const navPanel = await page.evaluate(() => {
        const button = document.querySelector('[data-ts-guest-nav] button[aria-label="Open navigation"]');
        if (!button) return null;
        button.click();
        const panel = [...document.querySelectorAll('div')].find((node) => !node.hidden && (node.innerText || '').includes('Close navigation') && node.getBoundingClientRect().height > 40);
        if (!panel) return { missing: true };
        const box = panel.getBoundingClientRect();
        return {
          x: Math.max(0, box.x - 8),
          y: Math.max(0, box.y - 8),
          width: Math.max(200, Math.min(420, box.width + 16)),
          height: Math.max(160, Math.min(420, box.height + 16)),
        };
      });
      if (navPanel && !navPanel.missing) {
        await shot('navigation', 'Initial itinerary', 'Navigation chrome', {
          file: 'navigation.md',
          note: 'The guest Open navigation panel, with Close navigation and the day tabs.',
          clipRect: navPanel,
        });
      } else {
        gap('Navigation chrome', 'navigation.md', 'the guest navigation panel did not open. A Day-by-Day crop is not that screen.');
      }
      if (await clickText(page, 'Settings')) {
        const settingsText = await bodyText(page);
        if (has(settingsText, 'Mapbox') || has(settingsText, 'Copy link')) {
          await shot('settings', 'Initial itinerary', 'TREK settings', {
            file: 'trek-settings.md',
            note: 'Mapbox, Google Maps, Weather, Invite, and Copy link.',
            clipRect: await clipAround('Mapbox', { height: 320, padTop: 16 }),
          });
        } else {
          gap('TREK settings', 'trek-settings.md', 'Settings opened without Mapbox or Copy link');
        }
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
        const dayText = await bodyText(page);
        if (day === 5 && (has(dayText, 'No timeline-tagged') || has(dayText, 'match those tags') || has(dayText, 'Nothing'))) {
          mark('empty-states.md');
        }
        await shot(`day-${String(day).padStart(2, '0')}`, 'Initial itinerary', label, {
          file: day === 5 ? 'empty-states.md' : 'slider-bars.md',
          note: day === 5 ? 'Day 5 on the intake trip.' : 'Intake trip day chip.',
          clipRect: await clipAround(label, { height: 640, padTop: 8 }),
        });
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
            await shot('filters', 'Initial itinerary', 'Filters', {
              file: 'filters.md',
              note: 'All areas and All types on The Rest.',
              clipRect: await clipAround(has(rest, 'All areas') ? 'All areas' : 'All types', { height: 360, padTop: 16 }),
            });
          }
        }
        if (label === 'Restaurants') {
          const dining = await bodyText(page);
          if (has(dining, 'All tags') || has(dining, 'Seafood')) {
            await shot('tags', 'Initial itinerary', 'Tags and chips', {
              file: 'tags-chips.md',
              note: 'Restaurant tag chips on the intake list.',
              clipRect: await clipAround(has(dining, 'All tags') ? 'All tags' : 'Seafood', { height: 420, padTop: 12 }),
            });
          }
          if (!captured.has('logos.md')) {
            const row = await page.evaluate(() => {
              const img = [...document.querySelectorAll('img')].find((node) => (node.src || '').includes('/ts-thing-logos/'));
              if (!img) return null;
              img.scrollIntoView({ block: 'center' });
              const box = img.getBoundingClientRect();
              return {
                x: 0,
                y: Math.max(0, box.y - 36),
                width: Math.min(1280, window.innerWidth),
                height: 240,
              };
            });
            if (row) await shot('logos', 'Initial itinerary', 'Thing logos', { file: 'logos.md', note: 'Restaurant row logos.', clipRect: row });
          }
          gap('Telegram intake fill', 'tg-intake.md', 'the shared app has no Telegram intake screen. The restaurant list is not that fill.');
        }
        if (label === 'Budget') mark('budget.md');
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
              await shot('screenshot-gate', 'Initial itinerary', 'Dialog screenshot gate', {
                file: 'dialog-screenshot-gate.md',
                note: 'Real Detail page, no card shell.',
                clipRect: await clipAround('Detail page', { height: 220, padTop: 16 }),
              });
            }
            if (!captured.has('status.md') && (has(detailText, 'considering') || has(detailText, 'Status'))) {
              await shot(`status-${id}`, 'Initial itinerary', 'Status', {
                file: 'status.md',
                note: `${name} detail.`,
                clipRect: await clipAround(has(detailText, 'considering') ? 'considering' : 'Status', { height: 220, padTop: 20 }),
              });
            }
            if (!captured.has('media-stories.md') && has(detailText, 'Story')) {
              await shot(`stories-${id}`, 'Initial itinerary', 'Stories and media', {
                file: 'media-stories.md',
                note: `${name} detail.`,
                clipRect: await clipAround('Story', { height: 240, padTop: 20 }),
              });
            }
            if (!captured.has('ratings-reviews.md') && (has(detailText, 'Google') || has(detailText, 'Yelp'))) {
              await shot(`ratings-${id}`, 'Initial itinerary', 'Ratings and reviews', {
                file: 'ratings-reviews.md',
                note: `${name} detail.`,
                clipRect: await clipAround(has(detailText, 'Google') ? 'Google' : 'Yelp', { height: 220, padTop: 20 }),
              });
            }
            if (!captured.has('hotel-stay-fields.md') && (has(detailText, 'Check-in') || has(detailText, 'Stay'))) {
              await shot(`hotel-${id}`, 'Initial itinerary', 'Hotel stay fields', {
                file: 'hotel-stay-fields.md',
                note: `${name} detail.`,
                clipRect: await clipAround(has(detailText, 'Check-in') ? 'Check-in' : 'Stay', { height: 220, padTop: 20 }),
              });
            }
            await page.keyboard.press('Escape').catch(() => {});
            await sleep(200);
          }
        }
      }
      for (const name of things) {
        if (!openedThings.has(name)) gap(`${name} detail`, 'thing-pages.md', 'the Detail page did not open from the intake timeline');
      }

      await clickText(page, 'Day-by-Day');
      if (await clickText(page, 'Flights') && await clickText(page, 'KOA arrival')) {
        const flightText = await bodyText(page);
        if (has(flightText, 'Takeoff')) {
          await shot('flight-fields', 'Initial itinerary', 'Flight fields', {
            file: 'flight-fields.md',
            note: 'KOA arrival Takeoff, Connections, and Layover.',
            clipRect: await clipAround('Takeoff', { height: 280, padTop: 24 }),
          });
        }
        await page.keyboard.press('Escape').catch(() => {});
      }
      if (await clickText(page, 'Cars') && await clickText(page, 'SpeediShuttle')) {
        const carText = await bodyText(page);
        if (has(carText, 'Rental company')) {
          await shot('car-fields', 'Initial itinerary', 'Car fields', {
            file: 'car-fields.md',
            note: 'SpeediShuttle rental company and car type.',
            clipRect: await clipAround('Rental company', { height: 240, padTop: 24 }),
          });
        }
        await page.keyboard.press('Escape').catch(() => {});
      }
      if (await clickText(page, 'Restaurants') && await clickText(page, 'Ulu Ocean')) {
        const hourText = await bodyText(page);
        if (has(hourText, 'Happy hour')) {
          await shot('happy-hour', 'Initial itinerary', 'Happy hour', {
            file: 'happy-hour.md',
            note: 'Ulu Ocean Grill happy hour.',
            clipRect: await clipAround('Happy hour', { height: 260, padTop: 24 }),
          });
        }
        await page.keyboard.press('Escape').catch(() => {});
      }
      await clickText(page, 'Day-by-Day');
      if (await clickAria(page, 'Print / PDF')) {
        const printText = await bodyText(page);
        if (has(printText, 'Print / PDF') || has(printText, 'Daily printout')) {
          await shot('print-pdf', 'Initial itinerary', 'Print and PDF', {
            file: 'print-pdf.md',
            note: 'Print / PDF menu: Daily printout and list PDFs.',
            clipRect: await clipAround('Daily printout', { height: 320, padTop: 48 }),
          });
        }
        await page.keyboard.press('Escape').catch(() => {});
      }
      if (await clickAria(page, 'Trip View')) {
        const configText = await bodyText(page);
        if (has(configText, 'Flights') && has(configText, 'Hotels') && has(configText, 'Cars')) {
          await shot('trip-view', 'Initial itinerary', 'Trip View config', {
            file: 'config-options-trip-view.md',
            note: 'Trip View toggles Flights, Hotels, and Cars.',
            clipRect: await clipAround('Trip View', { height: 280, padTop: 16 }),
          });
        }
        await page.keyboard.press('Escape').catch(() => {});
      }
    }

    if (!captured.has('logos.md')) gap('Thing logos', 'logos.md', 'no /ts-thing-logos/ image rendered on a list row');
    if (!captured.has('filters.md')) gap('Filters', 'filters.md', 'The Rest list did not render All areas or All types');
    if (!captured.has('tags-chips.md')) gap('Tags and chips', 'tags-chips.md', 'the restaurants list did not render All tags or Seafood chips');
    if (!captured.has('budget.md')) gap('Budget', 'budget.md', 'the shared app did not open a Budget tab');
    if (!captured.has('flight-fields.md')) gap('Flight fields', 'flight-fields.md', 'KOA arrival did not show Takeoff, Connections, and Layover');
    if (!captured.has('happy-hour.md')) gap('Happy hour', 'happy-hour.md', 'Ulu Ocean Grill did not show a Happy hour field');
    if (!captured.has('car-fields.md')) gap('Car fields', 'car-fields.md', 'SpeediShuttle did not show Rental company and Car type');
    if (!captured.has('status.md')) gap('Status', 'status.md', 'no Thing detail showed a status');
    if (!captured.has('media-stories.md')) gap('Stories and media', 'media-stories.md', 'no Thing detail showed a Story field');
    if (!captured.has('ratings-reviews.md')) gap('Ratings and reviews', 'ratings-reviews.md', 'no Thing detail showed Google or Yelp');
    if (!captured.has('hotel-stay-fields.md')) gap('Hotel stay fields', 'hotel-stay-fields.md', 'the house detail did not show Check-in');
    if (!captured.has('print-pdf.md')) gap('Print and PDF', 'print-pdf.md', 'the header has no Print / PDF menu');
    if (!captured.has('keepsakes-config.md')) gap('Keepsakes config', 'keepsakes-config.md', 'The shared header did not open a Print / PDF menu, so there is no Keepsakes Admin panel.');
    if (!captured.has('order-keepsakes.md')) gap('Order Keepsakes', 'order-keepsakes.md', 'The shared header did not show an Order Keepsakes control.');
    if (!captured.has('config-options-trip-view.md')) gap('Trip View config', 'config-options-trip-view.md', 'the header Trip View menu did not list Flights, Hotels, and Cars');
    if (!captured.has('tg-intake.md')) gap('Telegram intake', 'tg-intake.md', 'The shared app has no Telegram screen. The restaurant list is the website fill intake is supposed to reach, and that list was not on screen.');

    const counts = await sharedCounts(sharedUrl);
    if (counts.minThings) {
      await go(sharedUrl, 'Day-by-Day');
      if (await clickText(page, 'Restaurants')) {
        await shot('min-things', 'Initial itinerary', 'Initial fill minimums', {
          file: 'min-things.md',
          note: 'Big Island intake trip meets restaurant 15, store 10, and attraction 15.',
          clipRect: await clipAround('Ulu Ocean', { height: 420, padTop: 40 }),
        });
      }
    } else {
      gap('Initial fill minimums', 'min-things.md', 'the Big Island intake trip is below restaurant 15, store 10, or attraction 15');
    }

    async function captureKeepsake(base, label) {
      const rootUrl = base.endsWith('/') ? base : `${base}/`;
      await go(`${rootUrl}journey?style=1`);
      await page.waitForFunction(() => {
        const text = document.body.innerText || '';
        return text.length > 400 && !/Preparing PDF/i.test(text);
      }, { timeout: 45000 }).catch(() => {});
      const style1Text = await bodyText(page);
      const style1 = page.url().includes('vacation-staging') && !page.url().includes('travel.timesyncher.com') && style1Text.length > 400 && !/Preparing PDF/i.test(style1Text);
      if (style1 && !await isShell(page) && !captured.has('keepsake-style-one.md')) {
        await shot(`style-one-${label}`, 'Initial itinerary', 'Keepsake Style one', { file: 'keepsake-style-one.md', note: 'Rendered on the intake trip.' });
      }
      await go(`${rootUrl}journey?style=2`);
      await page.waitForFunction(() => {
        const text = document.body.innerText || '';
        return (document.querySelector('[data-print-ready="style2"], [data-ae-print="1"]') || text.length > 400) && !/Preparing PDF/i.test(text);
      }, { timeout: 45000 }).catch(() => {});
      const style2Text = await bodyText(page);
      const style2 = page.url().includes('vacation-staging') && !page.url().includes('travel.timesyncher.com') && style2Text.length > 400 && !/Preparing PDF/i.test(style2Text);
      if (style2 && !await isShell(page) && !captured.has('keepsake-style-two.md')) {
        await shot(`style-two-${label}`, 'Initial itinerary', 'Keepsake Style two', { file: 'keepsake-style-two.md', note: 'Rendered on the intake trip.' });
        await page.evaluate(() => window.scrollTo(0, Math.max(400, document.body.scrollHeight / 2)));
        await shot(`keepsake-qa-${label}`, 'Initial itinerary', 'Keepsake QA', { file: 'keepsake-qa.md', note: 'Style two, scrolled to the later pages.' });
      }
    }

    await captureKeepsake(sharedUrl, 'intake');
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
    page.removeAllListeners('request');
    await page.setRequestInterception(false).catch(() => {});
    await go(sharedUrl, 'Kailua-Kona');
    let finalReady = await page.evaluate(() => (document.body.innerText || '').includes('Kailua-Kona') && (document.body.innerText || '').includes('Vacation Day View'));
    if (!finalReady) {
      await page.reload({ waitUntil: 'networkidle0', timeout: 90000 }).catch(() => {});
      await page.waitForFunction(() => {
        const text = document.body.innerText || '';
        return text.includes('Kailua-Kona') && text.includes('Vacation Day View');
      }, { timeout: 30000 }).catch(() => {});
      await sleep(1500);
      finalReady = await page.evaluate(() => (document.body.innerText || '').includes('Kailua-Kona'));
    }
    if (!finalReady) {
      gap('Final itinerary', 'itinerary-layout.md', 'the live shared trip did not render Kailua-Kona after the collaborator notes');
    } else {
    if (await isShell(page)) {
      gap('Final itinerary', 'itinerary-layout.md', 'refused: the live trip still has the deleted card shell');
    } else {
      await shot('final-itinerary-layout', 'Final itinerary', 'Standard itinerary layout', {
        file: 'itinerary-layout.md',
        note: 'Live trip after collaborator notes. Not the pre-collaborator snapshot.',
        clipRect: await clipAround('Vacation Day View', { height: 640, padTop: 40 }),
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
          clipRect: await clipAround(label, { height: 640, padTop: 8 }),
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
    }
  } finally {
    await browser.close();
  }

  for (const feature of features) {
    if (!captured.has(feature.file) && !gaps.some((item) => item.file === feature.file)) {
      gap(feature.title, feature.file, 'no screenshot was captured for this feature file');
    }
  }

  let packVoid = null;
  try {
    await assertLiveMatchesTip();
  } catch (error) {
    if (!isVoidStaleBuild(error)) throw error;
    packVoid = error;
  }
  const manifest = {
    title: 'Screenshot Journey',
    subtitle: packVoid
      ? 'This run is void. Do not grade it.'
      : 'Real TimeSyncher app. Dialog PDF is the companion document. Shell screens are omitted.',
    void: Boolean(packVoid),
    deployBanner: packVoid ? voidDocumentStamp(packVoid.live, packVoid.tip) : (process.env.R5_DEPLOY_BANNER || ''),
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
  if (packVoid) {
    const stamped = prependVoidStamp(await readFile(verifyPath, 'utf8'), packVoid.live, packVoid.tip);
    await writeFile(verifyPath, stamped);
    let report = '';
    try {
      report = await readFile(path.join(outDir, 'REPORT.md'), 'utf8');
    } catch {
      report = '';
    }
    await writeFile(path.join(outDir, 'REPORT.md'), prependVoidStamp(report, packVoid.live, packVoid.tip));
    process.stderr.write(`${packVoid.message}\n`);
    process.exit(2);
  }
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
    captured.has('jev-quality-line.md')
      ? 'jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.'
      : 'jev-quality-line: GAP. The customer app showed a Jev score line.',
    `screenshot-journey.pdf sha256 \`${sha}\`.`,
    '',
    '### Not captured',
    '',
    ...(gaps.length ? gaps.map((item) => `- ${item.feature}${item.file ? ` (\`${item.file}\`)` : ''}: ${item.reason}`) : ['- None.']),
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
