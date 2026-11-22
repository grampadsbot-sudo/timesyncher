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

function toViewportRect(iframeRect, innerRect) {
  return {
    left: iframeRect.left + innerRect.left,
    top: iframeRect.top + innerRect.top,
    right: iframeRect.left + innerRect.right,
    bottom: iframeRect.top + innerRect.bottom,
    width: innerRect.width,
    height: innerRect.height,
  };
}

const [vacationHtml, sharedHtml, bundleJs, bundleCss, nycFixtureRaw] = await Promise.all([
  readFile(path.join(root, 'vacation-app.html'), 'utf8'),
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
  if (pathname === '/vacation-app.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(vacationHtml);
  }
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
  if (pathname === '/api/vacation-itinerary') {
    const session = url.searchParams.get('session') || 'session-1109';
    const slug = url.searchParams.get('tripId') || session;
    const single = session.startsWith('single-');
    const title = slug.startsWith('long-')
      ? longTitlePayload.trip.title
      : nycPayload.trip.title;
    const primaryVacation = {
      id: slug,
      title,
      destination: 'New York City',
      startDate: '2026-06-23',
      endDate: '2026-06-30',
      publicUrl: `/shared/${encodeURIComponent(slug)}/`,
      hasItems: true,
    };
    const vacations = single
      ? [primaryVacation]
      : [
          primaryVacation,
          {
            id: `${slug}-alt`,
            title: 'Coastal Fall Retreat 2026',
            destination: 'Monterey',
            startDate: '2026-10-10',
            endDate: '2026-10-14',
            publicUrl: `/shared/${encodeURIComponent(slug)}/`,
            hasItems: true,
          },
        ];
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      ok: true,
      session: { id: session, customerName: 'Test Guest', currentTripId: slug },
      eula: { accepted: true, status: 'accepted' },
      vacations,
      turns: [{ speaker: 'assistant', authorLabel: 'Vacay Keepsake', body: 'Ready to refine your vacation.' }],
      itinerary: [],
      searchProgress: null,
    }));
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
  if (pathname.startsWith('/src/')) {
    const relSrc = pathname.replace(/^\/+/, '');
    const candidate = path.join(root, relSrc);
    if (candidate.startsWith(path.join(root, 'src')) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const ext = path.extname(candidate).toLowerCase();
      res.writeHead(200, { 'content-type': contentTypes[ext] || 'text/javascript; charset=utf-8' });
      return res.end(await readFile(candidate));
    }
  }
  const rel = pathname.replace(/^\/+/, '');
  const candidate = path.join(root, 'public', rel);
  if (candidate.startsWith(path.join(root, 'public')) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    const ext = path.extname(candidate).toLowerCase();
    res.writeHead(200, { 'content-type': contentTypes[ext] || 'application/octet-stream' });
    return res.end(await readFile(candidate));
  }
  res.writeHead(404);
  res.end('');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;

const measureShell = async (page, frame) => {
  const parent = await page.evaluate(() => {
    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const iframe = document.querySelector('.site-pane iframe');
    const fsBtn = document.querySelector('#fullScreenButton') || document.querySelector('.fullscreen-button');
    const app = document.querySelector('.app');
    return {
      fullscreenActive: Boolean(app?.classList.contains('site-fullscreen')),
      iframeRect: rectOf(iframe),
      fsRect: rectOf(fsBtn),
      fsLabel: fsBtn?.getAttribute('aria-label') || '',
      parentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  const inner = await frame.evaluate(() => {
    const rectOf = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const hero = document.querySelector('[data-ts-trip-site-hero]');
    const h1 = hero?.querySelector('h1');
    const btn = hero?.querySelector('[data-ts-trip-hero-collapse]');
    const slogan = hero?.querySelector('[data-ts-trip-hero-slogan]');
    const actions = hero?.querySelector('[data-ts-trip-hero-actions]');
    const details = hero ? [...hero.querySelectorAll('[data-ts-trip-hero-detail]')] : [];
    const h1Style = h1 ? getComputedStyle(h1) : null;
    const btnStyle = btn ? getComputedStyle(btn) : null;
    const sloganStyle = slogan ? getComputedStyle(slogan) : null;
    const btnRect = rectOf(btn);
    let btnTopmost = false;
    if (btn && btnRect && btnRect.width > 0 && btnRect.height > 0) {
      const hit = document.elementFromPoint(btnRect.left + btnRect.width / 2, btnRect.top + btnRect.height / 2);
      btnTopmost = Boolean(hit && (hit === btn || btn.contains(hit)));
    }
    const otherVisible = hero
      ? [...hero.children]
          .filter((el) => el !== h1 && el !== btn)
          .filter((el) => getComputedStyle(el).display !== 'none')
          .map((el) => el.tagName)
      : [];
    return {
      collapsed: hero?.getAttribute('data-collapsed') || '',
      heroRect: rectOf(hero),
      h1Text: (h1?.textContent || '').trim(),
      h1Rect: rectOf(h1),
      h1FontSize: h1Style ? parseFloat(h1Style.fontSize) : 0,
      btnRect,
      btnLeftCss: btnStyle?.left || '',
      btnTransform: btnStyle?.transform || '',
      btnTopmost,
      btnAriaLabel: btn?.getAttribute('aria-label') || '',
      btnAriaExpanded: btn?.getAttribute('aria-expanded') || '',
      btnChevronDir: btn?.getAttribute('data-chevron-direction') || '',
      sloganText: slogan?.textContent ?? '',
      sloganDisplay: sloganStyle?.display || '',
      sloganColor: sloganStyle?.color || '',
      sloganOpacity: sloganStyle ? parseFloat(sloganStyle.opacity) : 0,
      sloganFontStyle: sloganStyle?.fontStyle || '',
      sloganFontSize: sloganStyle ? parseFloat(sloganStyle.fontSize) : 0,
      sloganLetterSpacing: sloganStyle ? parseFloat(sloganStyle.letterSpacing) || 0 : 0,
      sloganRect: rectOf(slogan),
      actionsDisplay: actions ? getComputedStyle(actions).display : '',
      detailDisplays: details.map((el) => getComputedStyle(el).display),
      otherVisible,
      iframeOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  const btnViewportRect = parent.iframeRect && inner.btnRect
    ? toViewportRect(parent.iframeRect, inner.btnRect)
    : null;
  const parentHitTag = btnViewportRect
    ? await page.evaluate(({ x, y }) => {
        const hit = document.elementFromPoint(x, y);
        return {
          tag: hit?.tagName || '',
          id: hit?.id || '',
          isFs: Boolean(hit?.closest('#fullScreenButton, .fullscreen-button')),
        };
      }, { x: btnViewportRect.left + btnViewportRect.width / 2, y: btnViewportRect.top + btnViewportRect.height / 2 })
    : null;
  return { ...parent, ...inner, btnViewportRect, parentHitTag };
};

const assertLeftAndClear = (m, label, isCollapsed, expandedFontSize = null) => {
  assert.ok(m.heroRect && m.h1Rect && m.btnRect && m.fsRect && m.btnViewportRect, `${label}: required boxes present`);
  const heroCenterX = m.heroRect.left + m.heroRect.width / 2;
  const h1CenterX = m.h1Rect.left + m.h1Rect.width / 2;
  const h1CenterY = m.h1Rect.top + m.h1Rect.height / 2;
  const btnCenterX = m.btnRect.left + m.btnRect.width / 2;
  const btnCenterY = m.btnRect.top + m.btnRect.height / 2;

  assert.ok(m.btnRect.left >= m.heroRect.left - 1 && m.btnRect.left <= m.heroRect.left + 12, `${label} R1: chevron on left edge (left=${m.btnRect.left}, heroLeft=${m.heroRect.left})`);
  assert.ok(btnCenterX < heroCenterX, `${label} R1: chevron on left half of header`);
  assert.ok(m.heroRect.right - m.btnRect.right > m.heroRect.width / 2, `${label} R1: chevron not on right side`);
  assert.ok(Math.abs(btnCenterY - h1CenterY) <= 1.5, `${label} R1: chevron vertically aligned with title (${btnCenterY} vs ${h1CenterY})`);

  assert.equal(rectsOverlap(m.h1Rect, m.btnRect), false, `${label} R2: chevron does not overlap title`);
  assert.ok(m.btnRect.right <= m.h1Rect.left + 0.5, `${label} R2: chevron stays strictly left of title (${m.btnRect.right} vs ${m.h1Rect.left})`);

  assert.equal(rectsOverlap(m.btnViewportRect, m.fsRect), false, `${label} R3: chevron does not overlap fullscreen control (${JSON.stringify(m.btnViewportRect)} vs ${JSON.stringify(m.fsRect)})`);
  assert.ok(m.btnViewportRect.right < m.fsRect.left, `${label} R3: chevron stays left of right-side fullscreen control (${m.btnViewportRect.right} vs ${m.fsRect.left})`);
  assert.equal(m.parentHitTag?.isFs, false, `${label} R3: parent hit test at chevron center is not fullscreen control`);

  assert.ok(Math.abs(h1CenterX - heroCenterX) <= 1.5, `${label} R4: title horizontally centered (${h1CenterX} vs ${heroCenterX})`);

  assert.ok(m.btnRect.width >= 44 && m.btnRect.height >= 44, `${label} R5: tap target >= 44x44 (${m.btnRect.width}x${m.btnRect.height})`);
  assert.equal(m.btnTopmost, true, `${label} R5: chevron topmost inside iframe`);

  if (isCollapsed) {
    assert.equal(m.collapsed, '1', `${label} R6: data-collapsed=1`);
    assert.equal(m.sloganDisplay, 'none', `${label} R6: slogan hidden when collapsed`);
    assert.equal(m.actionsDisplay, 'none', `${label} R6: actions hidden when collapsed`);
    assert.ok(m.detailDisplays.every((d) => d === 'none'), `${label} R6: details hidden when collapsed`);
    assert.deepEqual(m.otherVisible, [], `${label} R6: only title and chevron visible when collapsed`);
    assert.ok(m.heroRect.height >= 56 && m.heroRect.height <= 64, `${label} R6: compact collapsed bar (got ${m.heroRect.height})`);
    if (expandedFontSize !== null) {
      assert.ok(m.h1FontSize < expandedFontSize, `${label} R6: collapsed title smaller than expanded (${m.h1FontSize} vs ${expandedFontSize})`);
    }
    assert.equal(m.btnAriaLabel, 'Expand vacation header', `${label} R8: expand aria-label`);
    assert.equal(m.btnAriaExpanded, 'false', `${label} R8: aria-expanded=false`);
    assert.equal(m.btnChevronDir, 'down', `${label} R8: chevron points down`);
  } else {
    assert.equal(m.collapsed, '0', `${label} R7: data-collapsed=0`);
    assert.equal(m.sloganText, 'The Art of Remembering', `${label} R7: exact slogan text`);
    assert.notEqual(m.sloganDisplay, 'none', `${label} R7: slogan visible`);
    assert.ok(m.sloganRect && m.sloganRect.bottom <= m.heroRect.bottom + 0.5, `${label} R7: slogan inside dark band`);
    assert.equal(m.sloganColor, 'rgb(255, 255, 255)', `${label} R12: slogan color white rgb(255, 255, 255) (got ${m.sloganColor})`);
    assert.equal(m.sloganOpacity, 1, `${label} R12: slogan full opacity 1 (got ${m.sloganOpacity})`);
    assert.equal(m.sloganFontStyle, 'italic', `${label} R12: slogan italic style preserved`);
    assert.ok(m.sloganFontSize >= 13 && m.sloganFontSize <= 14, `${label} R12: slogan size 13-14px preserved (got ${m.sloganFontSize})`);
    assert.ok(m.sloganLetterSpacing > 0, `${label} R12: slogan letter-spacing preserved (got ${m.sloganLetterSpacing})`);
    assert.equal(m.btnAriaLabel, 'Collapse vacation header', `${label} R8: collapse aria-label`);
    assert.equal(m.btnAriaExpanded, 'true', `${label} R8: aria-expanded=true`);
    assert.equal(m.btnChevronDir, 'up', `${label} R8: chevron points up`);
  }
  assert.ok(!/trip/i.test(m.btnAriaLabel), `${label} R8: copy uses vacation, never trip`);
  assert.ok(m.iframeOverflow <= 0, `${label} R9: no iframe horizontal overflow (got ${m.iframeOverflow})`);
  assert.ok(m.parentOverflow <= 0, `${label} R9: no shell horizontal overflow (got ${m.parentOverflow})`);
};

const settleFrame = async (frame) => {
  await frame.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
};

const waitForSiteFrame = async (page) => {
  await page.waitForSelector('.site-pane iframe', { timeout: 30000 });
  await page.waitForSelector('#fullScreenButton', { timeout: 30000 });
  const iframeHandle = await page.$('.site-pane iframe');
  const frame = await iframeHandle.contentFrame();
  assert.ok(frame, 'site pane iframe must attach');
  await frame.waitForSelector('[data-ts-trip-site-hero="1"] [data-ts-trip-hero-collapse="1"]', { timeout: 30000 });
  await settleFrame(frame);
  return frame;
};

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
    for (const mode of [
      { key: 'multi', session: `multi-1109-${vp.name}` },
      { key: 'single', session: `single-1109-${vp.name}` },
    ]) {
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2 });
      await page.goto(`${origin}/vacation-app.html?session=${mode.session}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      let frame = await waitForSiteFrame(page);
      await frame.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      frame = await waitForSiteFrame(page);

      const splitExpanded = await measureShell(page, frame);
      assertLeftAndClear(splitExpanded, `${vp.name} ${mode.key} split expanded`, false);

      await frame.click('[data-ts-trip-hero-collapse]');
      await settleFrame(frame);
      const splitCollapsed = await measureShell(page, frame);
      assertLeftAndClear(splitCollapsed, `${vp.name} ${mode.key} split collapsed`, true, splitExpanded.h1FontSize);
      assert.notEqual(splitCollapsed.btnTransform, splitExpanded.btnTransform, `${vp.name} ${mode.key}: chevron flips on collapse`);

      if (mode.key === 'single') {
        await page.$eval('#fullScreenButton', (el) => el.click());
      } else {
        await page.click('#fullScreenButton');
      }
      await settleFrame(frame);
      const fsCollapsed = await measureShell(page, frame);
      assert.equal(fsCollapsed.fullscreenActive, true, `${vp.name} ${mode.key}: site-fullscreen active`);
      assertLeftAndClear(fsCollapsed, `${vp.name} ${mode.key} fullscreen collapsed`, true, splitExpanded.h1FontSize);

      await frame.click('[data-ts-trip-hero-collapse]');
      await settleFrame(frame);
      const fsExpanded = await measureShell(page, frame);
      assert.equal(fsExpanded.fullscreenActive, true, `${vp.name} ${mode.key}: site-fullscreen still active`);
      assertLeftAndClear(fsExpanded, `${vp.name} ${mode.key} fullscreen expanded`, false);

      await page.click('#fullScreenButton');
      await settleFrame(frame);
      await frame.click('[data-ts-trip-hero-collapse]');
      await settleFrame(frame);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      frame = await waitForSiteFrame(page);
      const persisted = await measureShell(page, frame);
      assertLeftAndClear(persisted, `${vp.name} ${mode.key} reload persisted collapsed`, true, splitExpanded.h1FontSize);
    }
  }

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(`${origin}/vacation-app.html?session=long-1109-390`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  let longFrame = await waitForSiteFrame(page);
  await longFrame.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  longFrame = await waitForSiteFrame(page);
  await page.click('#fullScreenButton');
  await settleFrame(longFrame);
  const longExpanded = await measureShell(page, longFrame);
  assertLeftAndClear(longExpanded, '390 long fullscreen expanded', false);
  await longFrame.click('[data-ts-trip-hero-collapse]');
  await settleFrame(longFrame);
  const longCollapsed = await measureShell(page, longFrame);
  assertLeftAndClear(longCollapsed, '390 long fullscreen collapsed', true, longExpanded.h1FontSize);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log('issue #1109 hero toggle left test passed');
