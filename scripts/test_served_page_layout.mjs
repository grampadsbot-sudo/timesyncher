#!/usr/bin/env node
/**
 * Served-page layout checks for features/screens/app.md.
 * Headless Chrome against local HTML and fixture JSON. No network.
 *
 * The offline unit-test job does not install Chrome or puppeteer-core
 * (PUPPETEER_SKIP_DOWNLOAD=1), so this file is listed in
 * scripts/online-tests.txt, not scripts/offline-tests.txt.
 * Run: node scripts/test_served_page_layout.mjs
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fullScreenSource, measureSource } from './layout-app-measure.mjs';
import { loadPuppeteer, sessions, slug, startServer, states, viewports } from './layout-shell-harness.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

async function assertSpec() {
  const text = await readFile(path.join(root, 'features/screens/app.md'), 'utf8');
  assert.match(text, /It's a Grok-like text interface: just a text box with the file-add and speak buttons\. The dropdown of vacations shows up if a customer has more than one vacation\. Otherwise nothing in the header\. The vacation website shows up on top once it has stuff in it\. There is a control slider in the middle once the vacation shows up\. Nothing else\./);
  assert.match(text, /The header should be hidden if there are not multiple vacations\. Not just empty\. I also think we need a full screen control in the web site area\./);
  assert.match(text, /\| 0 vacations \| hidden \(0px, not rendered\) \|/);
  assert.match(text, /\| 1 vacation, no site content yet \| hidden \(0px, not rendered\) \|/);
  assert.match(text, /\| 1 vacation with site content \| hidden \(0px, not rendered\) \|/);
  assert.match(text, /\| 2\+ vacations \| vacation dropdown only \|/);
  assert.match(text, /\| Website full-screen \| none \| website fills the viewport, with an exit-full-screen control \| none \| none \|/);
  assert.match(text, /text box with file-add, speak and send buttons/);
  assert.match(text, /never removes the basic controls any chat app needs, such as a send button/);
}

function expectedIds() {
  const checks = ['HEADER', 'COMPOSER', 'HIT', 'CONTROLS', 'BUTTONS', 'OVERFLOW', 'HIDDEN', 'CHROME', 'ROWS'];
  const ids = [];
  for (const tag of ['390', '1280']) {
    for (const state of states) {
      for (const check of checks) ids.push(`APP-${tag}-${state}-${check}`);
      if (state === 'NONE') ids.push(`APP-${tag}-NONE-FOOTER`, `APP-${tag}-NONE-PIN`);
      if (state === 'SITE') {
        ids.push(`APP-${tag}-SITE-STACK`, `APP-${tag}-SITE-EMBED`, `APP-${tag}-SITE-FULLSCREEN`, `APP-${tag}-SITE-EXIT`);
      }
    }
    ids.push(`APP-${tag}-PUBLIC`, `APP-${tag}-SEND`);
    if (tag === '390') ids.push('APP-390-SEND-TAP', 'APP-390-SEND-BLANK');
  }
  return ids;
}

async function openComposer(browser, server, viewport, mobile) {
  const page = await browser.newPage();
  await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith(server.origin) || url.startsWith('data:')) request.continue();
    else request.abort().catch((error) => { console.error(error); });
  });
  await page.goto(`${server.origin}/vacation-app.html?session=${sessions.NONE}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#messageText', { timeout: 15000 });
  return page;
}

async function checkComposerEnter(browser, server, viewport, results) {
  const mobile = viewport.tag === '390';
  const page = await openComposer(browser, server, viewport, mobile);
  try {
    const send = await page.evaluate(() => { const named = [...document.querySelectorAll('button')].find((el) => (el.getAttribute('aria-label') || el.textContent || '').trim() === 'Send'); const box = named?.getBoundingClientRect(); const form = document.querySelector('#composer')?.getBoundingClientRect(); const style = named ? getComputedStyle(named) : null; const visible = Boolean(named && style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0); const inside = Boolean(box && form && box.top >= Math.max(-1, form.top - 1) && box.bottom <= Math.min(innerHeight + 1, form.bottom + 1) && box.left >= Math.max(-1, form.left - 1) && box.right <= Math.min(innerWidth + 1, form.right + 1)); const hit = box ? document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) : null; return { visible, inside, hittable: Boolean(hit && (hit === named || named.contains(hit))), width: box?.width || 0, height: box?.height || 0 }; });
    results.push({ id: `APP-${viewport.tag}-SEND`, ok: Boolean(send.visible && send.inside && send.hittable), detail: send });
    if (mobile) {
      const hint = await page.$eval('#messageText', (node) => node.getAttribute('enterkeyhint') || '');
      await page.click('#messageText');
      await page.keyboard.type('Phone send check');
      await page.keyboard.press('Enter');
      const sent = await page.waitForFunction(() => [...document.querySelectorAll('#messages .bubble.user')].some((node) => (node.textContent || '').includes('Phone send check')), { timeout: 4000 }).then(() => true).catch((error) => {
        console.error('phone enter wait ended', error?.name || error);
        return false;
      });
      const detail = await page.evaluate(() => {
        const area = document.querySelector('#messageText');
        const bubble = [...document.querySelectorAll('#messages .bubble.user')].map((node) => node.textContent || '');
        return { value: area.value, bubble, hint: area.getAttribute('enterkeyhint') || '' };
      });
      const bubble = detail.bubble.find((text) => text.includes('Phone send check')) || '';
      results.push({
        id: 'APP-390-ENTER',
        ok: hint === 'send' && sent && detail.value === '' && !detail.value.includes('\n') && bubble.includes('Phone send check') && !bubble.includes('\n'),
        detail: { hint, sent, value: detail.value, bubble },
      });
      const tapped = await page.waitForFunction(() => !document.querySelector('#tsTyping'), { timeout: 4000 }).catch((error) => { console.error('send tap wait ended', error?.name || error); }).then(() => page.click('#messageText')).then(() => page.keyboard.type('Tap send check')).then(() => page.tap('button[aria-label="Send"]')).then(() => page.evaluate(() => ({ value: document.querySelector('#messageText').value, bubble: [...document.querySelectorAll('#messages .bubble.user')].map((node) => node.textContent || '').find((text) => text.includes('Tap send check')) || '' }))).catch((error) => ({ value: 'threw', bubble: '', error: String(error?.message || error) }));
      results.push({ id: 'APP-390-SEND-TAP', ok: tapped.value === '' && tapped.bubble.includes('Tap send check'), detail: tapped });
      const blank = await page.waitForFunction(() => !document.querySelector('#tsTyping'), { timeout: 4000 }).catch((error) => { console.error('blank send wait ended', error?.name || error); }).then(() => page.click('#messageText')).then(() => page.keyboard.type('   ')).then(() => page.tap('button[aria-label="Send"]')).then(() => page.evaluate(() => ({ value: document.querySelector('#messageText').value, status: document.querySelector('#composerStatus')?.textContent || '', bubbles: document.querySelectorAll('#messages .bubble.user').length }))).catch((error) => ({ value: 'threw', status: '', bubbles: -1, error: String(error?.message || error) }));
      results.push({ id: 'APP-390-SEND-BLANK', ok: blank.value === '   ' && blank.status === 'Something went wrong. Please try again.' && blank.bubbles === 2, detail: blank });
    } else {
      await page.click('#messageText');
      await page.keyboard.type('Shift line');
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
      await page.waitForFunction(() => (document.querySelector('#messageText').value || '').includes('\n'), { timeout: 2000 }).catch((error) => {
        console.error('shift newline wait ended', error?.name || error);
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      const detail = await page.evaluate(() => ({
        value: document.querySelector('#messageText').value,
        sent: [...document.querySelectorAll('#messages .bubble.user')].some((node) => (node.textContent || '').includes('Shift line')),
      }));
      results.push({
        id: 'APP-1280-SHIFT',
        ok: detail.value.includes('Shift line') && detail.value.includes('\n') && detail.sent === false,
        detail,
      });
    }
  } finally {
    await page.close();
  }
}

async function shot(page, dir, name) {
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, name), fullPage: false });
}

async function main() {
  await assertSpec();
  const ids = expectedIds();
  const server = await startServer();
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
  });
  const results = [];
  const shotDir = process.env.SCREENSHOT_DIR || '';
  try {
    for (const viewport of viewports) {
      for (const state of states) {
        const page = await browser.newPage();
        const mobile = viewport.tag === '390';
        await page.setViewport({
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          isMobile: mobile,
          hasTouch: mobile,
        });
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          const url = request.url();
          if (url.startsWith(server.origin) || url.startsWith('data:')) request.continue();
          else request.abort().catch((error) => { console.error(error); });
        });
        const target = `${server.origin}/vacation-app.html?session=${sessions[state]}`;
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('#composer', { timeout: 15000 });
        if (state === 'SITE') {
          await page.waitForSelector('.site-pane iframe', { timeout: 10000 });
          await page.evaluate(() => new Promise((resolve) => {
            const frame = document.querySelector('.site-pane iframe');
            if (!frame) return resolve();
            if (frame.contentDocument?.readyState === 'complete' && frame.contentDocument.body) return resolve();
            frame.addEventListener('load', () => resolve(), { once: true });
          }));
          await page.waitForFunction(() => {
            const doc = document.querySelector('.site-pane iframe')?.contentDocument;
            return (doc?.body?.innerText || '').includes('Sample week');
          }, { timeout: 15000 });
        }
        const measured = await page.evaluate(measureSource(), state);
        results.push(...measured);
        if (state === 'MANY') {
          const menu = await page.$('#vacationDropdown');
          const tripButton = await page.$('#tripButton');
          if (!menu || !tripButton) {
            results.push({ id: `APP-${viewport.tag}-MANY-MENU`, ok: false, detail: { missing: !menu ? 'vacationDropdown' : 'tripButton' } });
          } else {
            await tripButton.click();
            const opened = await page.$eval('#vacationDropdown', (node) => node.classList.contains('open'));
            await page.click('#messageText');
            const closed = await page.$eval('#vacationDropdown', (node) => !node.classList.contains('open') && getComputedStyle(node.querySelector('.trip-list')).visibility === 'hidden');
            results.push({ id: `APP-${viewport.tag}-MANY-MENU`, ok: opened && closed, detail: { opened, closed } });
          }
        }
        await shot(page, shotDir, `app-${viewport.tag}-${state.toLowerCase()}.png`);
        if (state === 'SITE') {
          const fullId = `APP-${viewport.tag}-SITE-FULLSCREEN`;
          const exitId = `APP-${viewport.tag}-SITE-EXIT`;
          const control = await page.$('#fullScreenButton');
          if (!control) {
            results.push({ id: fullId, ok: false, detail: { missing: true } });
            results.push({ id: exitId, ok: false, detail: { missing: true } });
          } else {
            await control.click();
            const entered = await page.evaluate(fullScreenSource());
            await shot(page, shotDir, `app-${viewport.tag}-site-fullscreen.png`);
            const onlyExit = entered.visibleButtons.length === 1 && entered.visibleButtons[0] === 'fullScreenButton';
            results.push({
              id: fullId,
              ok: entered.fills && entered.chatHidden && entered.composerHidden && entered.splitterHidden && entered.headerGone && entered.stampHidden && entered.label === 'Exit full screen' && onlyExit,
              detail: entered,
            });
            await page.click('#fullScreenButton');
            const restored = await page.evaluate(measureSource(), state);
            const stack = restored.find((row) => row.id.endsWith('-STACK'));
            const composerRow = restored.find((row) => row.id.endsWith('-COMPOSER'));
            const headerRow = restored.find((row) => row.id.endsWith('-HEADER'));
            const buttonsRow = restored.find((row) => row.id.endsWith('-BUTTONS'));
            const exitControl = await page.$eval('#fullScreenButton', (node) => ({
              label: node.getAttribute('aria-label'),
              pressed: node.getAttribute('aria-pressed'),
            }));
            results.push({
              id: exitId,
              ok: Boolean(stack?.ok && composerRow?.ok && headerRow?.ok && buttonsRow?.ok) && exitControl.label === 'Full screen' && exitControl.pressed === 'false',
              detail: { stack: stack?.detail, composer: composerRow?.detail, header: headerRow?.detail, buttons: buttonsRow?.detail, ...exitControl },
            });
            await shot(page, shotDir, `app-${viewport.tag}-site-split.png`);
          }
        }
        await page.close();
      }
      const pub = await browser.newPage();
      await pub.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      await pub.setRequestInterception(true);
      pub.on('request', (request) => {
        const url = request.url();
        if (url.startsWith(server.origin) || url.startsWith('data:')) request.continue();
        else request.abort().catch((error) => { console.error(error); });
      });
      await pub.goto(`${server.origin}/shared/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await pub.waitForFunction(() => (document.body?.innerText || '').includes('Sample week'), { timeout: 15000 });
      const shared = await pub.evaluate(() => {
        const footer = document.querySelector('footer[data-build-stamp]');
        const style = footer ? getComputedStyle(footer) : null;
        const box = footer ? footer.getBoundingClientRect() : null;
        const vh = window.innerHeight;
        return {
          embed: document.documentElement.getAttribute('data-ts-embed') || '',
          trip: document.documentElement.getAttribute('data-ts-trip') || '',
          top: window.top === window.self,
          root: Boolean(document.querySelector('#root')),
          guest: Boolean(document.querySelector('[data-ts-guest-nav], [aria-label="Open navigation"]')),
          openNav: /Open navigation/.test(document.body?.innerText || ''),
          settings: [...document.querySelectorAll('button')].some((node) => (node.textContent || '').trim() === 'Settings'),
          footerVisible: Boolean(box && style.display !== 'none' && style.visibility !== 'hidden' && box.top < vh && box.bottom <= vh + 1 && box.height > 8),
          footerPosition: style?.position || '',
          footerTop: box ? Math.round(box.top) : null,
          footerBottom: box ? Math.round(box.bottom) : null,
          vh,
        };
      });
      results.push({
        id: `APP-${viewport.tag}-PUBLIC`,
        ok: shared.embed === '' && shared.trip === '1' && shared.top && shared.root && !shared.guest && !shared.openNav && !shared.settings && shared.footerVisible && shared.footerPosition === 'static',
        detail: shared,
      });
      await shot(pub, shotDir, `shared-${viewport.tag}.png`);
      await pub.close();
      await checkComposerEnter(browser, server, viewport, results);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  const byId = new Map(results.map((row) => [row.id, row]));
  for (const id of ids) {
    if (!byId.has(id)) results.push({ id, ok: false, detail: { missing: 'not measured' } });
  }
  results.sort((a, b) => a.id.localeCompare(b.id));
  const outPath = process.env.LAYOUT_RESULTS || '/tmp/layout-results.json';
  await writeFile(outPath, JSON.stringify(results, null, 2));
  const brief = results.map(({ id, ok }) => ({ id, ok }));
  console.log(`LAYOUT_RESULTS ${JSON.stringify(brief)}`);
  const failed = results.filter((row) => !row.ok);
  if (failed.length) {
    console.error(failed.map((row) => `${row.id} ${JSON.stringify(row.detail)}`).join('\n'));
    process.exit(1);
  }
  console.log(`app shell layout passed (${results.length} assertions)`);
}

await main();
