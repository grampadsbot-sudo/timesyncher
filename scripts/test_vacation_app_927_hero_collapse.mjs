import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);

const heroScript = await readFile(new URL('../public/ts-trip-hero-collapse.js', import.meta.url), 'utf8');
const sharedApp = await readFile(new URL('../shared-app.html', import.meta.url), 'utf8');
const upstreamCss = await readFile(new URL('../public/assets/index-CbEHlMj6.css', import.meta.url), 'utf8');

assert.match(heroScript, /data-ts-trip-site-hero/);
assert.match(heroScript, /data-ts-trip-hero-collapse/);
assert.match(heroScript, /data-ts-hero-collapse/);
assert.match(heroScript, /data-ts-trip-hero-actions/);
assert.match(heroScript, /vk-trip-hero-collapsed:/);
assert.match(heroScript, /localStorage\.setItem/);
assert.match(heroScript, /heroGradientRe/);
assert.match(heroScript, /heroBlackStopRe/);
assert.match(heroScript, /nodeHasBlackTripHeroBg/);
assert.match(heroScript, /getComputedStyle/);
assert.doesNotMatch(heroScript, /includes\('linear-gradient\(135deg, #000'\)/);
assert.match(sharedApp, /ts-trip-hero-collapse\.js/);
assert.match(heroScript, /Collapse vacation header/);
assert.match(heroScript, /Expand vacation header/);
assert.doesNotMatch(heroScript, /Collapse trip header|Expand trip header/);

const gradientRe = /linear-gradient\(\s*135deg/i;
const blackStopRe = /(?:#000(?:000)?\b|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))/i;
const matchesTripHeroBg = (text) => gradientRe.test(text) && blackStopRe.test(text);

const liveRgbStyle =
  'background: linear-gradient(135deg, rgb(0, 0, 0) 0%, rgb(15, 23, 42) 50%, rgb(30, 41, 59) 100%); color: white;';
const hexHeroStyle =
  'background: linear-gradient(135deg, #000 0%, #0f172a 50%, #1e293b 100%); color: white;';

assert.equal(matchesTripHeroBg(liveRgbStyle), true, 'rgb(0,0,0) serialized hero must match');
assert.equal(matchesTripHeroBg(hexHeroStyle), true, '#000 hero must still match');
assert.equal(
  liveRgbStyle.includes('linear-gradient(135deg, #000'),
  false,
  '#930 regression: old substring guard rejects live rgb hero',
);

assert.match(heroScript, /\[data-ts-trip-hero-collapse\]\{[^}]*position:absolute;right:4px/);
assert.match(heroScript, /\[data-ts-trip-hero-collapse\]\{[^}]*border:0;border-radius:0;background:transparent/);
assert.match(heroScript, /\[data-ts-trip-hero-collapse\]\{[^}]*width:44px;height:44px;min-width:44px;min-height:44px/);
assert.match(heroScript, /\[data-collapsed="1"\][^'"]*\[data-ts-trip-hero-collapse\]\{[^}]*rotate\(180deg\)/);
assert.doesNotMatch(heroScript, /\[data-collapsed="1"\][^'"]*h1\{[^}]*text-overflow:ellipsis/);
assert.doesNotMatch(heroScript, /\[data-collapsed="1"\][^'"]*h1\{[^}]*white-space:nowrap/);
assert.match(heroScript, /\[data-ts-trip-site-hero\]\[data-collapsed="1"\][^'"]*\[data-ts-trip-hero-actions\]\{display:none!important\}/);

const cssRules = [...heroScript.matchAll(/'([^']+)'/g)]
  .map((m) => m[1])
  .filter((rule) => rule.startsWith('['));
const heroCss = cssRules.join('\n');
assert.ok(heroCss.includes('data-ts-trip-site-hero'), 'injected hero CSS must be present');

const makeHeroFixture = (titleText) => `<!doctype html>
<html><head><meta charset="utf-8"><style>${upstreamCss}</style></head><body style="margin:0;font-family:Arial,sans-serif">
<div id="hero" style="position:relative;padding:32px 20px 28px;text-align:center;color:#fff;background:linear-gradient(135deg, rgb(0, 0, 0) 0%, rgb(15, 23, 42) 50%, rgb(30, 41, 59) 100%);">
  <div style="position:absolute;top:-60px;right:-60px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,.03)"></div>
  <div style="position:absolute;bottom:-40px;left:-40px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.02)"></div>
  <h1 style="margin:0 0 4px;font-size:26px;font-weight:700;letter-spacing:-.5px">${titleText}</h1>
  <div id="description" style="font-size:13px;opacity:.5;max-width:400px;margin:0 auto;line-height:1.5">Las Vegas to New York · Jun 23–30, 2026 · UWS / Lincoln Center priority · planning options only</div>
  <div id="dates" style="margin-top:10px;display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:20px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08)"><span style="font-size:12px;font-weight:500;opacity:.8">Jun 23, 2026 — Jun 30, 2026</span><span style="font-size:11px;opacity:.4">·</span><span style="font-size:11px;opacity:.5">8 days</span></div>
  <div id="actions" style="margin-top:8px;display:flex;justify-content:center;gap:6px;flex-wrap:wrap"><div data-trip-view-root="1" style="display:inline-flex"><button style="width:30px;height:30px" aria-label="Config Options"></button></div><button style="width:30px;height:30px" aria-label="PDFs"></button><button style="width:30px;height:30px" aria-label="Order Keepsakes"></button></div>
</div>
<main>Itinerary</main>
</body></html>`;

const rectsOverlap = (a, b, gap = 1) =>
  a.right - gap > b.left &&
  b.right - gap > a.left &&
  a.bottom - gap > b.top &&
  b.bottom - gap > a.top;

let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (err) {
  void err;
  puppeteer = require('/tmp/pptr/node_modules/puppeteer-core');
}
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const measureHero = async (page) =>
  page.evaluate(() => {
    const hero = document.getElementById('hero');
    const h1 = hero?.querySelector('h1');
    const btn = hero?.querySelector('[data-ts-trip-hero-collapse]');
    const svg = btn?.querySelector('svg');
    const heroBox = hero?.getBoundingClientRect();
    const titleBox = h1?.getBoundingClientRect();
    const btnBox = btn?.getBoundingClientRect();
    const svgBox = svg?.getBoundingClientRect();
    const heroStyle = hero ? getComputedStyle(hero) : null;
    const h1Style = h1 ? getComputedStyle(h1) : null;
    const btnStyle = btn ? getComputedStyle(btn) : null;
    return {
      collapsed: hero?.getAttribute('data-collapsed'),
      heroBox: heroBox
        ? { left: heroBox.left, top: heroBox.top, right: heroBox.right, bottom: heroBox.bottom, width: heroBox.width, height: heroBox.height }
        : null,
      heroPaddingTop: heroStyle ? parseFloat(heroStyle.paddingTop) : 0,
      heroPaddingBottom: heroStyle ? parseFloat(heroStyle.paddingBottom) : 0,
      titleBox: titleBox
        ? { left: titleBox.left, top: titleBox.top, right: titleBox.right, bottom: titleBox.bottom, width: titleBox.width, height: titleBox.height }
        : null,
      btnBox: btnBox
        ? { left: btnBox.left, top: btnBox.top, right: btnBox.right, bottom: btnBox.bottom, width: btnBox.width, height: btnBox.height }
        : null,
      svgBox: svgBox ? { width: svgBox.width, height: svgBox.height } : null,
      btnStyle: btnStyle
        ? {
            borderTopWidth: btnStyle.borderTopWidth,
            borderRadius: btnStyle.borderRadius,
            backgroundColor: btnStyle.backgroundColor,
            color: btnStyle.color,
            transform: btnStyle.transform,
          }
        : null,
      btnAriaLabel: btn?.getAttribute('aria-label') || '',
      btnAriaExpanded: btn?.getAttribute('aria-expanded') || '',
      btnChevronDir: btn?.getAttribute('data-chevron-direction') || '',
      titleScrollWidth: h1?.scrollWidth ?? 0,
      titleClientWidth: h1?.clientWidth ?? 0,
      titleOverflow: h1Style?.textOverflow,
      detailBoxes: ['description', 'dates', 'actions'].map((id) => {
        const node = document.getElementById(id);
        const rect = node.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, width: rect.width, display: getComputedStyle(node).display };
      }),
      itineraryTop: document.querySelector('main').getBoundingClientRect().top,
      docOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

const assertNoCircleChrome = (m, label) => {
  assert.equal(m.btnStyle.borderTopWidth, '0px', `${label}: no border on chevron button`);
  assert.equal(m.btnStyle.borderRadius, '0px', `${label}: no circular border-radius`);
  assert.equal(m.btnStyle.backgroundColor, 'rgba(0, 0, 0, 0)', `${label}: transparent background`);
  assert.ok(m.svgBox && Math.abs(m.svgBox.width - 20) <= 2 && Math.abs(m.svgBox.height - 20) <= 2, `${label}: ~20px chevron glyph`);
  assert.ok(m.btnBox.width >= 44 && m.btnBox.height >= 44, `${label}: tap target >= 44x44`);
  assert.ok(m.btnBox.right <= m.heroBox.right + 1 && m.btnBox.right >= m.heroBox.right - 12, `${label}: chevron sits at right edge`);
  assert.ok(m.docOverflow <= 0, `${label}: zero horizontal overflow`);
};

const assertCenteredAndAligned = (m, label, isCollapsed) => {
  const heroCenterX = m.heroBox.left + m.heroBox.width / 2;
  const titleCenterX = m.titleBox.left + m.titleBox.width / 2;
  const titleCenterY = m.titleBox.top + m.titleBox.height / 2;
  const btnCenterY = m.btnBox.top + m.btnBox.height / 2;
  assert.ok(Math.abs(titleCenterX - heroCenterX) <= 1.5, `${label}: title horizontally centered (${titleCenterX} vs ${heroCenterX})`);
  assert.ok(Math.abs(btnCenterY - titleCenterY) <= 1.5, `${label}: chevron vertically centered with title (${btnCenterY} vs ${titleCenterY})`);
  assert.equal(rectsOverlap(m.titleBox, m.btnBox), false, `${label}: chevron must not overlap title`);
  assert.ok(m.heroPaddingTop >= 12 && m.heroPaddingTop <= 14, `${label}: top padding 12-14px (got ${m.heroPaddingTop})`);
  assert.equal(m.heroPaddingTop, m.heroPaddingBottom, `${label}: equal top and bottom padding`);
  assert.ok(Math.abs((m.titleBox.top - m.heroBox.top) - m.heroPaddingTop) <= 1.5, `${label}: no extra black space above title`);
  assert.ok(m.titleScrollWidth <= m.titleClientWidth + 1, `${label}: title must not clip horizontally`);
  assert.notEqual(m.titleOverflow, 'ellipsis', `${label}: title must not use ellipsis`);
  if (isCollapsed) {
    const heroCenterY = m.heroBox.top + m.heroBox.height / 2;
    const topGap = m.titleBox.top - m.heroBox.top;
    const bottomGap = m.heroBox.bottom - m.titleBox.bottom;
    assert.ok(Math.abs(titleCenterY - heroCenterY) <= 1.5, `${label}: collapsed title vertically centered in band (${titleCenterY} vs ${heroCenterY})`);
    assert.ok(Math.abs(topGap - bottomGap) <= 1.5, `${label}: collapsed top/bottom gap equal (${topGap} vs ${bottomGap})`);
    const expectedHeight = m.titleBox.height + m.heroPaddingTop + m.heroPaddingBottom;
    assert.ok(Math.abs(m.heroBox.height - expectedHeight) <= 1.5, `${label}: collapsed band height fits title + padding (${m.heroBox.height} vs ${expectedHeight})`);
  }
};

try {
  let currentFixture = makeHeroFixture('Craig / Kim NYC June 2026');
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => request.respond({ status: 200, contentType: 'text/html', body: currentFixture }));

  for (const vp of [
    { name: '390', width: 390, height: 844 },
    { name: '430', width: 430, height: 932 },
    { name: '1280', width: 1280, height: 800 },
  ]) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await page.goto(`http://hero.test/shared/hero-layout-${vp.name}`, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    const base = await measureHero(page);
    await page.evaluate(heroScript);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const expanded = await measureHero(page);
    assert.ok(expanded.titleBox && expanded.btnBox, `${vp.name}: title and collapse control required`);
    assertNoCircleChrome(expanded, `${vp.name} expanded`);
    assertCenteredAndAligned(expanded, `${vp.name} expanded`, false);
    assert.equal(expanded.btnAriaLabel, 'Collapse vacation header');
    assert.equal(expanded.btnAriaExpanded, 'true');
    assert.equal(expanded.btnChevronDir, 'up');
    for (let i = 1; i < expanded.detailBoxes.length; i += 1) {
      assert.ok(expanded.detailBoxes[i].top >= expanded.detailBoxes[i - 1].bottom, `${vp.name}: subtitle, date chip and actions occupy separate rows`);
    }
    assert.ok(Math.abs(expanded.detailBoxes[1].width - base.detailBoxes[1].width) <= 1, `${vp.name}: date chip retains natural width`);

    await page.click('[data-ts-trip-hero-collapse]');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const collapsed = await measureHero(page);
    assertNoCircleChrome(collapsed, `${vp.name} collapsed`);
    assertCenteredAndAligned(collapsed, `${vp.name} collapsed`, true);
    assert.equal(collapsed.btnAriaLabel, 'Expand vacation header');
    assert.equal(collapsed.btnAriaExpanded, 'false');
    assert.equal(collapsed.btnChevronDir, 'down');
    assert.notEqual(collapsed.btnStyle.transform, expanded.btnStyle.transform, `${vp.name}: chevron flips transform on collapse`);
    assert.ok(collapsed.heroBox.height <= 60, `${vp.name}: collapsed band slim (got ${collapsed.heroBox.height})`);
    assert.ok(expanded.heroBox.height > collapsed.heroBox.height + 24, `${vp.name}: expanded hero taller than collapsed`);
    assert.ok(collapsed.detailBoxes.every((box) => box.display === 'none'), `${vp.name}: collapsed details and actions hidden`);
    assert.ok(collapsed.itineraryTop < expanded.itineraryTop, `${vp.name}: collapsing moves itinerary up`);
    assert.equal(await page.evaluate((k) => localStorage.getItem(k), `vk-trip-hero-collapsed:hero-layout-${vp.name}`), '1');

    await page.reload({ waitUntil: 'load' });
    await page.evaluate(heroScript);
    assert.equal(await page.$eval('#hero', (hero) => hero.dataset.collapsed), '1', `${vp.name}: collapse survives reload`);
    await page.click('[data-ts-trip-hero-collapse]');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const reexpanded = await measureHero(page);
    assert.ok(Math.abs(reexpanded.heroBox.height - expanded.heroBox.height) <= 1, `${vp.name}: re-expanding restores full height`);
    assert.equal(reexpanded.btnAriaLabel, 'Collapse vacation header');
    assert.equal(reexpanded.btnChevronDir, 'up');
  }

  currentFixture = makeHeroFixture('Summer Family Vacation in New York City and Hudson Valley 2026');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.goto('http://hero.test/shared/hero-long-title', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(heroScript);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const longExpanded = await measureHero(page);
  assertNoCircleChrome(longExpanded, '390 long expanded');
  assertCenteredAndAligned(longExpanded, '390 long expanded', false);
  await page.click('[data-ts-trip-hero-collapse]');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const longCollapsed = await measureHero(page);
  assertNoCircleChrome(longCollapsed, '390 long collapsed');
  assertCenteredAndAligned(longCollapsed, '390 long collapsed', true);
} finally {
  await browser.close();
}

console.log('vacation app #927/#1095 hero collapse regression passed');
