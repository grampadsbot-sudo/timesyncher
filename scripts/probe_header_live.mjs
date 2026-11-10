#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const argBase = process.argv[2] ? String(process.argv[2]).replace(/\/$/, '') : '';
const BASE = argBase || String(process.env.HDR_PROBE_BASE || 'https://vacation-staging.timesyncher.com').replace(/\/$/, '');
const APP_SESSION = String(process.env.HDR_PROBE_APP_SESSION || '').trim();
const SHARED_SLUG = String(process.env.HDR_PROBE_SHARED_SLUG || '8CQX').trim();
const evidenceDir = path.resolve(
  process.env.HDR_PROBE_EVIDENCE_DIR || path.join(root, '../vkfill-920-job'),
);

const viewports = [
  { width: 390, height: 844, tag: '390' },
  { width: 1280, height: 800, tag: '1280' },
];

function boxesIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function isGrayScaleColor(cssColor) {
  const s = String(cssColor || '').trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'rgba(0, 0, 0, 0)') return true;
  const rgb = s.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    const [, r, g, b] = rgb.map(Number);
    return Math.max(r, g, b) - Math.min(r, g, b) <= 8;
  }
  return /^#([0-9a-f]{3,8})$/i.test(s) || s === '#fff' || s === '#ffffff' || s === '#000' || s === '#111827';
}

const probeEval = () => {
  const mapIframeRect = (frame, r) => {
    const frameBox = frame.getBoundingClientRect();
    return {
      left: frameBox.left + r.left,
      top: frameBox.top + r.top,
      right: frameBox.left + r.right,
      bottom: frameBox.top + r.bottom,
      width: r.width,
      height: r.height,
    };
  };
  const visible = (el, doc = document) => {
    if (!el) return false;
    const win = doc.defaultView || window;
    let node = el;
    while (node && node.nodeType === 1) {
      const st = win.getComputedStyle(node);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
      node = node.parentElement;
    }
    return el.getClientRects().length > 0;
  };
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  };
  const pickSwitchers = (doc) =>
    [...doc.querySelectorAll('[data-trip-switcher], select[data-trip-switcher], #tripButton[data-trip-switcher]')].filter((el) =>
      visible(el, doc.defaultView || window),
    );
  const frame = document.querySelector('.site-pane iframe');
  const switchers = pickSwitchers(document);
  let iframeSwitchers = [];
  let iframeHeaderRects = [];
  try {
    const idoc = frame?.contentDocument;
    if (idoc) {
      iframeSwitchers = pickSwitchers(idoc);
      iframeHeaderRects = [...idoc.querySelectorAll('[data-ts-shared-header], [data-shared-trip-header]')]
        .filter((el) => visible(el, idoc.defaultView))
        .map((el) => rect(el));
    }
  } catch (err) {
    iframeSwitchers = [{ error: String(err?.message || err) }];
  }
  const wordmark = document.querySelector('.vk-app-brand, [data-vk-wordmark]');
  const logo = document.querySelector('.vk-app-brand img, #appHeader img.mark, [data-vk-wordmark] img');
  const appSwitcher = document.querySelector('#tripButton[data-trip-switcher], [data-trip-switcher]');
  const fsBtn = document.querySelector('#fullScreenButton');
  const fsBox = fsBtn && visible(fsBtn) ? rect(fsBtn) : null;
  let fsOverlap = false;
  const vw = window.innerWidth;
  const guardEls = [
    ...document.querySelectorAll('#appHeader, header.topbar, .vk-app-brand, [data-vk-wordmark], #tripButton, [data-trip-switcher-root]'),
  ].filter((el) => visible(el));
  if (fsBox) {
    for (const el of guardEls) {
      if (el === fsBtn || fsBtn.contains(el) || el.contains(fsBtn)) continue;
      const r = rect(el);
      if (r.width < 1 || r.height < 1) continue;
      if (boxesIntersect(fsBox, r)) {
        fsOverlap = true;
        break;
      }
    }
    if (!fsOverlap && frame?.contentDocument) {
      try {
        const idoc = frame.contentDocument;
        const iwin = frame.contentWindow;
        for (const el of idoc.querySelectorAll('[data-ts-shared-header] *, [data-shared-trip-header] *')) {
          if (!visible(el, iwin)) continue;
          const local = rect(el);
          const mapped = mapIframeRect(frame, local);
          if (mapped.width < 1 || mapped.height < 1) continue;
          if (boxesIntersect(fsBox, mapped)) {
            fsOverlap = true;
            break;
          }
        }
      } catch (err) {
        fsOverlap = fsOverlap || Boolean(String(err?.message || err));
      }
    }
  }
  let logoLockupWidth = 0;
  if (wordmark && visible(wordmark)) {
    const wbox = rect(wordmark);
    logoLockupWidth = wbox.width / Math.max(1, vw);
  }
  const switcherClipped = (() => {
    const btn = appSwitcher;
    if (!btn || !visible(btn)) return false;
    const r = rect(btn);
    if (r.left < -1 || r.right > vw + 1) return true;
    const label = btn.querySelector('span') || btn;
    return label.scrollWidth > label.clientWidth + 1;
  })();
  const switcherLabel = appSwitcher ? String(appSwitcher.textContent || '').trim() : '';
  const taglineOverflow = [...document.querySelectorAll('[data-vk-wordmark] small, .vk-app-brand small')]
    .filter((el) => visible(el))
    .some((el) => {
      const r = rect(el);
      return r.right > vw + 1 || el.scrollWidth > el.clientWidth + 1;
    });
  const micHits = [...document.querySelectorAll('#appHeader *, header.topbar *')]
    .filter((el) => /mic|microphone/i.test(el.textContent || el.getAttribute('aria-label') || ''));
  const colors = [...document.querySelectorAll('#appHeader, #appHeader *')]
    .slice(0, 40)
    .map((el) => getComputedStyle(el).color)
    .filter(Boolean);
  const badColors = colors.filter((c) => !isGrayScaleColor(c) && !/^rgb\(47, 111, 159\)/.test(c));
  return {
    switcherCount: switchers.length + (Array.isArray(iframeSwitchers) ? iframeSwitchers.filter((el) => !el?.error).length : 0),
    iframeSwitchers: iframeSwitchers.length,
    logoNaturalWidth: logo?.naturalWidth || 0,
    logoLockupWidthRatio: Math.round(logoLockupWidth * 1000) / 1000,
    fsOverlap,
    switcherClipped,
    switcherLabel,
    taglineOverflow,
    micHits: micHits.length,
    badColors,
    scrollWidth: document.scrollingElement?.scrollWidth || 0,
    innerWidth: vw,
    iframeHeaderRects: iframeHeaderRects.length,
  };
};

async function assertAppPage(page, tag) {
  if (!APP_SESSION) {
    console.error('HDR_PROBE_APP_SESSION required for app probe');
    process.exit(2);
  }
  await page.goto(`${BASE}/vacation-app.html?session=${encodeURIComponent(APP_SESSION)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForSelector('#messageText, #appHeader', { timeout: 120000 }).catch((err) => {
    console.error('probe_header_live: app shell wait', err?.message || err);
  });
  await page.waitForSelector('.site-pane iframe', { timeout: 120000 }).catch((err) => {
    console.error('probe_header_live: iframe wait', err?.message || err);
  });

  const metrics = await page.evaluate(probeEval);

  assert.equal(metrics.switcherCount, 1, `app ${tag}: expected 1 visible trip switcher, got ${metrics.switcherCount}`);
  assert.ok(metrics.logoNaturalWidth > 0, `app ${tag}: logo must paint`);
  assert.ok(!metrics.fsOverlap, `app ${tag}: full screen must not overlap header chrome`);
  assert.ok(!metrics.switcherClipped, `app ${tag}: switcher must not clip without fitting viewport`);
  if (tag === '390') {
    assert.ok(metrics.logoLockupWidthRatio <= 0.62, `app ${tag}: logo lockup width ${metrics.logoLockupWidthRatio} > 0.62`);
    assert.ok(!metrics.taglineOverflow, `app ${tag}: tagline must not overflow at 390`);
  }
  assert.equal(metrics.micHits, 0, `app ${tag}: no header mic`);
  assert.equal(metrics.badColors.length, 0, `app ${tag}: header colors must be black/white/gray`);
  assert.ok(metrics.scrollWidth <= metrics.innerWidth + 1, `app ${tag}: horizontal scroll`);
  await page.screenshot({ path: path.join(evidenceDir, `hdr-app-${tag}.png`), fullPage: false });
  return metrics;
}

async function assertSharedPage(page, tag) {
  await page.goto(`${BASE}/shared/${encodeURIComponent(SHARED_SLUG)}/`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.waitForSelector('[data-ts-shared-header], [data-shared-trip-header]', { timeout: 120000 }).catch((err) => {
    console.error('probe_header_live: shared header wait', err?.message || err);
  });

  const metrics = await page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
      return el.getClientRects().length > 0;
    };
    const sel = document.querySelector('[data-trip-switcher]');
    const text = sel ? (sel.options?.[sel.selectedIndex]?.text || sel.value || sel.textContent || '') : '';
    const switchers = [...document.querySelectorAll('[data-trip-switcher]')].filter((el) => visible(el));
    const tagline = document.querySelector('[data-vk-wordmark] small');
    const vw = window.innerWidth;
    const taglineBad = tagline && visible(tagline) && (tagline.getBoundingClientRect().right > vw + 1 || tagline.scrollWidth > tagline.clientWidth + 1);
    return {
      switcherText: String(text).trim(),
      switcherCount: switchers.length,
      scrollWidth: document.scrollingElement?.scrollWidth || 0,
      innerWidth: vw,
      taglineOverflow: Boolean(taglineBad),
      micHits: [...document.querySelectorAll('[data-ts-shared-header] *, [data-shared-trip-header] *')]
        .filter((el) => /mic|microphone/i.test(el.textContent || el.getAttribute('aria-label') || '')).length,
    };
  });

  assert.equal(metrics.switcherCount, 1, `shared ${tag}: expected one switcher, got ${metrics.switcherCount}`);
  if (tag === '390') {
    assert.match(metrics.switcherText, /Craig \/ Kim NYC/i, `shared ${tag}: switcher label`);
    assert.ok(!metrics.taglineOverflow, `shared ${tag}: tagline overflow`);
  }
  assert.ok(metrics.scrollWidth <= metrics.innerWidth + 1, `shared ${tag}: horizontal scroll ${metrics.scrollWidth} > ${metrics.innerWidth}`);
  assert.equal(metrics.micHits, 0, `shared ${tag}: no header mic`);
  await page.screenshot({ path: path.join(evidenceDir, `hdr-shared-${tag}.png`), fullPage: false });
  return metrics;
}

async function main() {
  await mkdir(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const report = { BASE, SHARED_SLUG, evidenceDir, viewports: {} };
  try {
    for (const vp of viewports) {
      const page = await browser.newPage();
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const shared = await assertSharedPage(page, vp.tag);
      await page.close();
      report.viewports[`shared-${vp.tag}`] = shared;
    }
    for (const vp of viewports) {
      const page = await browser.newPage();
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const app = await assertAppPage(page, vp.tag);
      await page.close();
      report.viewports[`app-${vp.tag}`] = app;
    }
    report.status = 'PASS';
    const jsonPath = path.join(evidenceDir, 'probe_header_live.json');
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log('probe_header_live: PASS', JSON.stringify({ BASE, SHARED_SLUG, evidenceDir, jsonPath }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('probe_header_live: FAIL', error?.message || error);
  process.exit(1);
});
