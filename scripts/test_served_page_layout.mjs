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
}

function expectedIds() {
  const checks = ['HEADER', 'COMPOSER', 'HIT', 'CONTROLS', 'BUTTONS', 'OVERFLOW', 'HIDDEN', 'CHROME', 'ROWS'];
  const ids = [];
  for (const tag of ['390', '1280']) {
    for (const state of states) {
      for (const check of checks) ids.push(`APP-${tag}-${state}-${check}`);
      if (state === 'SITE') {
        ids.push(`APP-${tag}-SITE-STACK`, `APP-${tag}-SITE-EMBED`, `APP-${tag}-SITE-FULLSCREEN`, `APP-${tag}-SITE-EXIT`);
      }
    }
    ids.push(`APP-${tag}-PUBLIC`);
  }
  return ids;
}

function measureSource() {
  return (state) => {
    const out = [];
    const check = (id, ok, detail) => out.push({ id, ok: Boolean(ok), detail });
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const id = (name) => `APP-${vw === 390 ? '390' : '1280'}-${state}-${name}`;
    const header = document.querySelector('#appHeader, header.topbar');
    const composer = document.querySelector('#composer');
    const textarea = document.querySelector('#messageText');
    const pane = document.querySelector('.chat-pane');
    const visible = (el, view) => {
      if (!el) return false;
      const win = view || window;
      let node = el;
      while (node && node.nodeType === 1) {
        const style = win.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
        node = node.parentElement;
      }
      return !el.hidden && el.getClientRects().length > 0;
    };

    const dropdown = document.querySelector('#vacationDropdown');
    const headerKids = header ? [...header.children] : [];
    if (state === 'MANY') {
      const onlyDropdown = Boolean(header) && headerKids.length === 1 && headerKids[0] === dropdown;
      const extra = header?.querySelector('img, .brand, .path-nav, .trip-menu, #tripMenu');
      const height = header ? header.getBoundingClientRect().height : 0;
      check(id('HEADER'), onlyDropdown && !extra && height > 0, {
        children: headerKids.map((node) => node.id || node.className),
        extra: extra ? (extra.id || extra.className) : '',
        height,
      });
    } else {
      const box = header?.getBoundingClientRect();
      check(id('HEADER'), !header || box.height === 0, {
        absent: !header,
        height: box ? box.height : null,
      });
    }
    const visibleButtons = [...document.querySelectorAll('.app button')].filter((el) => visible(el)).map((el) => el.id || el.className || el.tagName);
    const allowed = state === 'SITE'
      ? ['attachButton', 'fullScreenButton', 'splitter', 'voiceButton']
      : state === 'MANY'
        ? ['attachButton', 'tripButton', 'voiceButton']
        : ['attachButton', 'voiceButton'];
    const sameButtons = visibleButtons.length === allowed.length && allowed.every((name) => visibleButtons.includes(name));
    check(id('BUTTONS'), sameButtons, { visibleButtons, allowed });

    if (!composer) {
      check(id('COMPOSER'), false, { missing: true });
      check(id('HIT'), false, { missing: true });
      check(id('CONTROLS'), false, { missing: true });
    } else {
      const box = composer.getBoundingClientRect();
      const gap = vh - box.bottom;
      check(id('COMPOSER'), box.top >= -1 && box.bottom <= vh + 1 && box.height > 20 && gap <= 100 && gap >= -1, {
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        height: Math.round(box.height),
        gap: Math.round(gap),
        vh,
      });
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const hitText = hit === textarea || (textarea && textarea.contains(hit));
      check(id('HIT'), Boolean(hitText) && cx >= 0 && cx <= vw && cy >= 0 && cy <= vh, {
        hit: hit ? (hit.id || hit.className || hit.tagName) : null,
        cx: Math.round(cx),
        cy: Math.round(cy),
      });
      const controls = [...composer.querySelectorAll('button, textarea, input, select')].filter((el) => visible(el));
      const controlIds = controls.map((el) => el.id || el.className || el.tagName).sort();
      const expected = ['attachButton', 'messageText', 'voiceButton'];
      const same = controlIds.length === expected.length && expected.every((name) => controlIds.includes(name));
      check(id('CONTROLS'), same && !composer.querySelector('.send-button'), { controlIds });
    }

    const docRight = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    const overflow = [];
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 && rect.height < 1) continue;
      let clipped = false;
      let node = el.parentElement;
      while (node && node !== document.documentElement) {
        const parentStyle = getComputedStyle(node);
        const parentRect = node.getBoundingClientRect();
        const clips = ['hidden', 'clip', 'scroll', 'auto'].includes(parentStyle.overflowX) || parentStyle.overflowX === 'hidden';
        if (clips && rect.right > parentRect.right + 1 && parentRect.right <= vw + 1) {
          clipped = true;
          break;
        }
        node = node.parentElement;
      }
      if (!clipped && rect.right > vw + 1) {
        overflow.push(el.id || el.className || el.tagName);
        if (overflow.length >= 6) break;
      }
    }
    check(id('OVERFLOW'), docRight <= vw + 1 && overflow.length === 0, {
      docRight,
      vw,
      overflow,
    });

    const hiddenBad = [];
    const collectHidden = (doc) => {
      if (!doc) return;
      for (const el of doc.querySelectorAll('[hidden]')) {
        const win = doc.defaultView || window;
        if (win.getComputedStyle(el).display !== 'none') hiddenBad.push(el.id || el.className || el.tagName);
      }
    };
    collectHidden(document);
    const frame = document.querySelector('.site-pane iframe');
    if (frame) {
      try { collectHidden(frame.contentDocument); } catch { hiddenBad.push('iframe-unreachable'); }
    }
    check(id('HIDDEN'), hiddenBad.length === 0, { hiddenBad });

    const chrome = document.querySelector('.app img.mark, .app .brand, .path-nav, [aria-label="Vacation path"], .trip-menu, #tripMenu');
    check(id('CHROME'), !chrome, { found: chrome ? (chrome.id || chrome.className || chrome.tagName) : '' });

    if (!pane) {
      check(id('ROWS'), false, { missing: true });
    } else {
      const rows = getComputedStyle(pane).gridTemplateRows.split(/\s+/).filter(Boolean);
      check(id('ROWS'), rows.length === pane.children.length, {
        rows,
        children: pane.children.length,
      });
    }

    if (state === 'SITE') {
      const site = document.querySelector('.site-pane');
      const splitter = document.querySelector('#splitter');
      const siteBox = site?.getBoundingClientRect();
      const splitBox = splitter?.getBoundingClientRect();
      const chatBox = pane?.getBoundingClientRect();
      const stacked = Boolean(site && splitter && pane)
        && siteBox.bottom <= splitBox.top + 2
        && splitBox.bottom <= chatBox.top + 2
        && siteBox.height > 20
        && splitBox.height > 0
        && chatBox.height > 20;
      check(id('STACK'), stacked, {
        site: siteBox ? Math.round(siteBox.bottom) : null,
        split: splitBox ? [Math.round(splitBox.top), Math.round(splitBox.bottom)] : null,
        chat: chatBox ? Math.round(chatBox.top) : null,
      });
      let embed = { ready: false };
      try {
        const doc = frame?.contentDocument;
        const win = doc?.defaultView;
        if (doc && win && doc.body) {
          const guest = doc.querySelector('[data-ts-guest-nav], [aria-label="Open navigation"]');
          const guestVisible = Boolean(guest && visible(guest, win));
          const footers = [...doc.querySelectorAll('footer')].filter((el) => visible(el, win));
          const stamp = doc.querySelector('footer[data-build-stamp]');
          const stampVisible = Boolean(stamp && visible(stamp, win));
          embed = {
            ready: true,
            guestVisible,
            stampVisible,
            footers: footers.map((el) => el.getAttribute('data-build-stamp') || el.className || el.id || 'footer'),
            embed: doc.documentElement.getAttribute('data-ts-embed') || '',
          };
        }
      } catch (error) {
        embed = { ready: false, error: String(error) };
      }
      check(id('EMBED'), embed.ready && !embed.guestVisible && !embed.stampVisible && embed.footers.length === 0, embed);
    }
    return out;
  };
}

function fullScreenSource() {
  return () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const site = document.querySelector('.site-pane')?.getBoundingClientRect();
    const chat = document.querySelector('.chat-pane');
    const composer = document.querySelector('#composer');
    const splitter = document.querySelector('#splitter');
    const header = document.querySelector('header.topbar');
    const button = document.querySelector('#fullScreenButton');
    const stamp = document.querySelector('footer[data-build-stamp]');
    const stampStyle = stamp ? getComputedStyle(stamp) : null;
    const shown = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
    };
    const visibleButtons = [...document.querySelectorAll('.app button')].filter(shown).map((el) => el.id || el.getAttribute('aria-label'));
    return {
      fills: Boolean(site) && site.top <= 2 && site.left <= 2 && site.right >= vw - 2 && site.bottom >= vh - 2,
      chatHidden: !shown(chat),
      composerHidden: !shown(composer),
      splitterHidden: !shown(splitter),
      headerGone: !header || header.getBoundingClientRect().height === 0,
      stampHidden: !stamp || stampStyle.visibility === 'hidden' || stamp.getClientRects().length === 0,
      label: button?.getAttribute('aria-label') || '',
      visibleButtons,
      site: site ? {
        top: Math.round(site.top),
        right: Math.round(site.right),
        bottom: Math.round(site.bottom),
        left: Math.round(site.left),
        vw,
        vh,
      } : null,
    };
  };
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
        await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
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
