import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch (err) {
    void err;
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

function resolveChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const pwDir = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (fs.existsSync(pwDir)) {
    for (const entry of fs.readdirSync(pwDir)) {
      if (!entry.startsWith('chromium-')) continue;
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const full = path.join(pwDir, entry, sub);
        if (fs.existsSync(full)) return full;
      }
    }
  }
  throw new Error('Chrome executable not found (set CHROME_PATH)');
}

function rectsOverlap(a, b, gap = 1) {
  return (
    a.right - gap > b.left &&
    b.right - gap > a.left &&
    a.bottom - gap > b.top &&
    b.bottom - gap > a.top
  );
}

function parseRgbaAlpha(colorText) {
  const rgba = String(colorText || '').match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)/i);
  if (rgba) return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]), a: Number(rgba[4]) };
  const rgb = String(colorText || '').match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: 1 };
  return null;
}

const [sharedHtml, bundleJs, bundleCss, nycFixtureRaw] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'scripts/fixtures/gate-b-nyc-shared-staging.json'), 'utf8'),
]);

const nycPayload = JSON.parse(nycFixtureRaw);
const longTitlePayload = structuredClone(nycPayload);
longTitlePayload.trip.title = 'Summer Family Vacation in New York City and Hudson Valley 2026';

const contentTypes = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === '/assets/index-BKun7ofk.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    return res.end(bundleJs);
  }
  if (pathname === '/assets/index-CbEHlMj6.css') {
    res.writeHead(200, { 'content-type': 'text/css; charset=utf-8' });
    return res.end(bundleCss);
  }
  if (/^\/shared\/[^/]+\/?$/.test(pathname)) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(sharedHtml);
  }
  const apiMatch = pathname.match(/^\/api\/shared\/([^/]+)\/?$/);
  if (apiMatch) {
    const slug = decodeURIComponent(apiMatch[1]);
    const payload = slug.startsWith('long-') ? longTitlePayload : nycPayload;
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(payload));
  }
  if (pathname.endsWith('/edit-access')) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ canEdit: true }));
  }
  if (pathname === '/manifest.webmanifest') {
    res.writeHead(200, { 'content-type': 'application/manifest+json' });
    return res.end(JSON.stringify({ name: 'Vacay Keepsake', start_url: '/' }));
  }
  if (pathname.startsWith('/api/')) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true, notices: [], bindings: [], media: [] }));
  }
  const rel = pathname.replace(/^\/+/, '');
  const candidate = path.join(root, 'public', rel);
  if (candidate.startsWith(path.join(root, 'public')) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    const ext = path.extname(candidate).toLowerCase();
    const buf = await readFile(candidate);
    res.writeHead(200, { 'content-type': contentTypes[ext] || 'application/octet-stream' });
    return res.end(buf);
  }
  res.writeHead(404);
  res.end('');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;

const measureState = async (page) =>
  page.evaluate(() => {
    const hero = document.querySelector('[data-ts-trip-site-hero]');
    const h1 = hero?.querySelector('h1');
    const btn = hero?.querySelector('[data-ts-trip-hero-collapse]');
    const slogan = hero?.querySelector('[data-ts-trip-hero-slogan]');
    const actions = hero?.querySelector('[data-ts-trip-hero-actions]');
    const details = hero ? [...hero.querySelectorAll('[data-ts-trip-hero-detail]')] : [];
    const datesPill = details.find((el) => getComputedStyle(el).display === 'inline-flex' || /days?/i.test(el.textContent || '')) || details[details.length - 1] || null;
    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const heroStyle = hero ? getComputedStyle(hero) : null;
    const h1Style = h1 ? getComputedStyle(h1) : null;
    const sloganStyle = slogan ? getComputedStyle(slogan) : null;
    const btnRect = rectOf(btn);
    let btnTopmost = false;
    if (btn && btnRect && btnRect.width > 0 && btnRect.height > 0) {
      const hit = document.elementFromPoint(btnRect.left + btnRect.width / 2, btnRect.top + btnRect.height / 2);
      btnTopmost = Boolean(hit && (hit === btn || btn.contains(hit)));
    }
    let h1LineRects = 0;
    if (h1 && h1.firstChild) {
      const range = document.createRange();
      range.selectNodeContents(h1);
      const rects = [...range.getClientRects()]
        .filter((r) => r.width > 0 && r.height > 0)
        .sort((a, b) => a.top - b.top);
      let lineBottom = -Infinity;
      for (const r of rects) {
        if (r.top >= lineBottom - 1) {
          h1LineRects += 1;
          lineBottom = r.bottom;
        } else {
          lineBottom = Math.max(lineBottom, r.bottom);
        }
      }
    }
    const flowChildren = hero
      ? [...hero.children].filter((el) => {
          const cs = getComputedStyle(el);
          return cs.display !== 'none' && cs.position !== 'absolute';
        })
      : [];
    const lastFlowBottom = flowChildren.length
      ? Math.max(...flowChildren.map((el) => el.getBoundingClientRect().bottom))
      : 0;
    const otherVisibleWhenCollapsed = hero
      ? [...hero.children]
          .filter((el) => el !== h1 && el !== btn)
          .filter((el) => getComputedStyle(el).display !== 'none')
          .map((el) => el.tagName)
      : [];
    return {
      collapsed: hero?.getAttribute('data-collapsed') || '',
      heroRect: rectOf(hero),
      heroPaddingTop: heroStyle ? parseFloat(heroStyle.paddingTop) : 0,
      heroPaddingBottom: heroStyle ? parseFloat(heroStyle.paddingBottom) : 0,
      h1Text: (h1?.textContent || '').trim(),
      h1Rect: rectOf(h1),
      h1FontSize: h1Style ? parseFloat(h1Style.fontSize) : 0,
      h1FontWeight: h1Style ? Number(h1Style.fontWeight) : 0,
      h1Color: h1Style?.color || '',
      h1LineHeight: h1Style ? parseFloat(h1Style.lineHeight) : 0,
      h1WhiteSpace: h1Style?.whiteSpace || '',
      h1TextOverflow: h1Style?.textOverflow || '',
      h1OverflowX: h1Style?.overflowX || '',
      h1ScrollWidth: h1?.scrollWidth ?? 0,
      h1ClientWidth: h1?.clientWidth ?? 0,
      h1LineRects,
      btnRect,
      btnTopmost,
      btnAriaLabel: btn?.getAttribute('aria-label') || '',
      btnAriaExpanded: btn?.getAttribute('aria-expanded') || '',
      sloganExists: Boolean(slogan),
      sloganText: slogan?.textContent ?? '',
      sloganRect: rectOf(slogan),
      sloganDisplay: sloganStyle?.display || '',
      sloganFontStyle: sloganStyle?.fontStyle || '',
      sloganFontSize: sloganStyle ? parseFloat(sloganStyle.fontSize) : 0,
      sloganFontWeight: sloganStyle ? Number(sloganStyle.fontWeight) : 0,
      sloganOpacity: sloganStyle ? parseFloat(sloganStyle.opacity) : 0,
      sloganColor: sloganStyle?.color || '',
      sloganLetterSpacing: sloganStyle ? parseFloat(sloganStyle.letterSpacing) || 0 : 0,
      datesRect: rectOf(datesPill),
      datesDisplay: datesPill ? getComputedStyle(datesPill).display : '',
      actionsDisplay: actions ? getComputedStyle(actions).display : '',
      detailDisplays: details.map((el) => getComputedStyle(el).display),
      lastFlowBottom,
      otherVisibleWhenCollapsed,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: resolveChromeExecutable(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();

  for (const vp of [
    { name: '390', width: 390, height: 844 },
    { name: '430', width: 430, height: 932 },
  ]) {
    const slug = `nyc-1107-${vp.name}`;
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
    await page.goto(`${origin}/shared/${slug}/?embed=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('[data-ts-trip-site-hero="1"] [data-ts-trip-hero-slogan="1"]', { timeout: 30000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const expanded = await measureState(page);
    assert.equal(expanded.collapsed, '0', `${vp.name} expanded: starts expanded`);
    assert.ok(expanded.heroPaddingTop >= 12 && expanded.heroPaddingTop <= 16, `${vp.name} expanded R5: balanced top padding (${expanded.heroPaddingTop})`);
    assert.ok(Math.abs(expanded.heroPaddingTop - expanded.heroPaddingBottom) <= 1, `${vp.name} expanded R5: equal top/bottom padding (${expanded.heroPaddingTop} vs ${expanded.heroPaddingBottom})`);
    assert.ok(Math.abs((expanded.h1Rect.top - expanded.heroRect.top) - expanded.heroPaddingTop) <= 1.5, `${vp.name} expanded R5: no dead black space above title`);
    assert.ok(Math.abs((expanded.heroRect.bottom - expanded.lastFlowBottom) - expanded.heroPaddingBottom) <= 1.5, `${vp.name} expanded R5: no dead black space below content`);

    assert.equal(expanded.sloganExists, true, `${vp.name} expanded R6: slogan element present`);
    assert.equal(expanded.sloganText, 'The Art of Remembering', `${vp.name} expanded R6: exact slogan text`);
    assert.notEqual(expanded.sloganDisplay, 'none', `${vp.name} expanded R6: slogan visible`);
    assert.ok(expanded.sloganRect.width > 0 && expanded.sloganRect.height > 0, `${vp.name} expanded R6: slogan has non-zero box`);
    const heroCenterX = expanded.heroRect.left + expanded.heroRect.width / 2;
    const sloganCenterX = expanded.sloganRect.left + expanded.sloganRect.width / 2;
    assert.ok(Math.abs(sloganCenterX - heroCenterX) <= 1.5, `${vp.name} expanded R6: slogan horizontally centered (${sloganCenterX} vs ${heroCenterX})`);
    assert.ok(expanded.datesRect && expanded.sloganRect.top >= expanded.datesRect.bottom - 0.5, `${vp.name} expanded R6: slogan under dates pill`);
    assert.ok(expanded.sloganRect.bottom <= expanded.heroRect.bottom, `${vp.name} expanded R6: slogan inside dark hero band`);
    assert.equal(expanded.sloganFontStyle, 'italic', `${vp.name} expanded R6: slogan italic`);
    assert.ok(expanded.sloganFontSize >= 13 && expanded.sloganFontSize <= 14, `${vp.name} expanded R6: slogan 13-14px (got ${expanded.sloganFontSize})`);
    assert.ok(expanded.sloganFontWeight <= 400, `${vp.name} expanded R6: slogan light weight (got ${expanded.sloganFontWeight})`);
    const sloganRgba = parseRgbaAlpha(expanded.sloganColor);
    assert.ok(sloganRgba && sloganRgba.r === 255 && sloganRgba.g === 255 && sloganRgba.b === 255, `${vp.name} expanded R6/R12: slogan white ink (${expanded.sloganColor})`);
    const effectiveOpacity = expanded.sloganOpacity * (sloganRgba?.a ?? 1);
    assert.equal(effectiveOpacity, 1, `${vp.name} expanded R6/R12: slogan full white opacity (got ${effectiveOpacity})`);
    assert.ok(expanded.sloganLetterSpacing > 0, `${vp.name} expanded R6: slogan slight letter-spacing (got ${expanded.sloganLetterSpacing})`);

    assert.ok(expanded.btnRect.width >= 44 && expanded.btnRect.height >= 44, `${vp.name} expanded R4: toggle >= 44x44`);
    assert.equal(expanded.btnTopmost, true, `${vp.name} expanded R4: toggle tappable/topmost`);
    assert.equal(rectsOverlap(expanded.h1Rect, expanded.btnRect), false, `${vp.name} expanded: toggle does not overlap title`);
    assert.equal(expanded.btnAriaLabel, 'Collapse vacation header', `${vp.name} expanded R8: vacation aria-label`);
    assert.equal(expanded.btnAriaExpanded, 'true', `${vp.name} expanded R4: aria-expanded true`);
    assert.ok(!/trip/i.test(expanded.btnAriaLabel), `${vp.name} expanded R8: no trip wording`);
    assert.ok(expanded.docOverflow <= 0, `${vp.name} expanded R7: no horizontal overflow (got ${expanded.docOverflow})`);

    await page.click('[data-ts-trip-hero-collapse]');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const collapsed = await measureState(page);
    assert.equal(collapsed.collapsed, '1', `${vp.name} collapsed: data-collapsed=1`);
    assert.ok(collapsed.heroRect.height >= 56 && collapsed.heroRect.height <= 64, `${vp.name} collapsed R1: compact bar 56-64px (got ${collapsed.heroRect.height})`);
    assert.equal(collapsed.h1Text, 'Craig / Kim NYC June 2026', `${vp.name} collapsed R2: vacation name shown`);
    assert.ok(collapsed.h1FontSize >= 17 && collapsed.h1FontSize <= 18, `${vp.name} collapsed R2: font-size 17-18px (got ${collapsed.h1FontSize})`);
    assert.ok(collapsed.h1FontSize < expanded.h1FontSize, `${vp.name} collapsed R2: smaller than expanded title (${collapsed.h1FontSize} vs ${expanded.h1FontSize})`);
    assert.ok(collapsed.h1FontWeight >= 600, `${vp.name} collapsed R2: semibold weight >= 600 (got ${collapsed.h1FontWeight})`);
    const h1Rgba = parseRgbaAlpha(collapsed.h1Color);
    assert.ok(h1Rgba && h1Rgba.r >= 245 && h1Rgba.g >= 245 && h1Rgba.b >= 245, `${vp.name} collapsed R2: white title (${collapsed.h1Color})`);
    assert.equal(collapsed.h1WhiteSpace, 'nowrap', `${vp.name} collapsed R2: single-line nowrap`);
    assert.equal(collapsed.h1TextOverflow, 'ellipsis', `${vp.name} collapsed R2: ellipsis enabled`);
    assert.equal(collapsed.h1OverflowX, 'hidden', `${vp.name} collapsed R2: overflow hidden`);
    assert.equal(collapsed.h1LineRects, 1, `${vp.name} collapsed R2: renders on 1 line`);
    assert.ok(collapsed.h1ScrollWidth <= collapsed.h1ClientWidth, `${vp.name} collapsed R2: NYC title fits without clipping`);
    const collapsedCenterX = collapsed.heroRect.left + collapsed.heroRect.width / 2;
    const collapsedTitleCenterX = collapsed.h1Rect.left + collapsed.h1Rect.width / 2;
    assert.ok(Math.abs(collapsedTitleCenterX - collapsedCenterX) <= 1.5, `${vp.name} collapsed R2: title centered (${collapsedTitleCenterX} vs ${collapsedCenterX})`);

    assert.equal(collapsed.sloganDisplay, 'none', `${vp.name} collapsed R3: slogan hidden`);
    assert.equal(collapsed.actionsDisplay, 'none', `${vp.name} collapsed R3: actions hidden`);
    assert.ok(collapsed.detailDisplays.every((d) => d === 'none'), `${vp.name} collapsed R3: subtitle and dates pill hidden`);
    assert.deepEqual(collapsed.otherVisibleWhenCollapsed, [], `${vp.name} collapsed R3: no other visible hero children`);

    assert.ok(collapsed.btnRect.width >= 44 && collapsed.btnRect.height >= 44, `${vp.name} collapsed R4: toggle >= 44x44`);
    assert.equal(collapsed.btnTopmost, true, `${vp.name} collapsed R4: toggle tappable/topmost`);
    assert.equal(rectsOverlap(collapsed.h1Rect, collapsed.btnRect), false, `${vp.name} collapsed R2/R4: toggle does not overlap title`);
    assert.equal(collapsed.btnAriaLabel, 'Expand vacation header', `${vp.name} collapsed R8: vacation aria-label`);
    assert.equal(collapsed.btnAriaExpanded, 'false', `${vp.name} collapsed R4: aria-expanded false`);
    assert.ok(!/trip/i.test(collapsed.btnAriaLabel), `${vp.name} collapsed R8: no trip wording`);
    assert.ok(collapsed.docOverflow <= 0, `${vp.name} collapsed R7: no horizontal overflow (got ${collapsed.docOverflow})`);

    assert.equal(await page.evaluate((k) => localStorage.getItem(k), `vk-trip-hero-collapsed:${slug}`), '1', `${vp.name} R4: state stored`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('[data-ts-trip-site-hero="1"][data-collapsed="1"]', { timeout: 30000 });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const reloaded = await measureState(page);
    assert.equal(reloaded.collapsed, '1', `${vp.name} R4: collapsed state persists after reload`);
    assert.ok(reloaded.heroRect.height >= 56 && reloaded.heroRect.height <= 64, `${vp.name} R1/R4: height stays 56-64px after reload`);

    await page.click('[data-ts-trip-hero-collapse]');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const reexpanded = await measureState(page);
    assert.equal(reexpanded.collapsed, '0', `${vp.name} R4: re-expand works`);
    assert.notEqual(reexpanded.sloganDisplay, 'none', `${vp.name} R6: slogan returns on re-expand`);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('[data-ts-trip-site-hero="1"][data-collapsed="0"]', { timeout: 30000 });
  }

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(`${origin}/shared/long-1107/?embed=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[data-ts-trip-site-hero="1"] [data-ts-trip-hero-collapse="1"]', { timeout: 30000 });
  await page.click('[data-ts-trip-hero-collapse]');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const longCollapsed = await measureState(page);
  assert.ok(longCollapsed.heroRect.height >= 56 && longCollapsed.heroRect.height <= 64, `long collapsed R1: compact bar 56-64px (got ${longCollapsed.heroRect.height})`);
  assert.equal(longCollapsed.h1LineRects, 1, 'long collapsed R2: single line');
  assert.equal(longCollapsed.h1TextOverflow, 'ellipsis', 'long collapsed R2: ellipsis active');
  assert.ok(longCollapsed.h1ScrollWidth > longCollapsed.h1ClientWidth, 'long collapsed R2: long title truncates with ellipsis');
  assert.equal(rectsOverlap(longCollapsed.h1Rect, longCollapsed.btnRect), false, 'long collapsed R2: chevron does not overlap truncated title');
  assert.ok(longCollapsed.docOverflow <= 0, 'long collapsed R7: no horizontal overflow');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log('issue #1107 hero states test passed');
