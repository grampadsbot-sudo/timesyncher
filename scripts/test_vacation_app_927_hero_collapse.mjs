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
assert.match(heroScript, /max-width: 844px/);
assert.match(sharedApp, /ts-trip-hero-collapse\.js/);

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

assert.match(heroScript, /grid-template-areas:"toggle title"/);
assert.doesNotMatch(heroScript, /\[data-ts-trip-hero-collapse\]\{[^}]*position:absolute;left:10px;top:8px/);
assert.match(heroScript, /\[data-ts-trip-site-hero\]\[data-collapsed="1"\][^'"]*\[data-ts-trip-hero-actions\]\{display:none!important\}/);

const cssRules = [...heroScript.matchAll(/'([^']+)'/g)]
  .map((m) => m[1])
  .filter((rule) => rule.startsWith('['));
const heroCss = cssRules.join('\n');
assert.ok(heroCss.includes('data-ts-trip-site-hero'), 'injected hero CSS must be present');

const heroFixture = `<!doctype html>
<html><head><meta charset="utf-8"><style>${upstreamCss}</style></head><body style="margin:0;font-family:Arial,sans-serif">
<div id="hero" style="position:relative;padding:32px 20px 28px;text-align:center;color:#fff;background:linear-gradient(135deg, rgb(0, 0, 0) 0%, rgb(15, 23, 42) 50%, rgb(30, 41, 59) 100%);">
  <div style="position:absolute;top:-60px;right:-60px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,.03)"></div>
  <div style="position:absolute;bottom:-40px;left:-40px;width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.02)"></div>
  <h1 style="margin:0 0 4px;font-size:26px;font-weight:700;letter-spacing:-.5px">Craig / Kim NYC June 2026</h1>
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
} catch {
  puppeteer = require('/tmp/pptr/node_modules/puppeteer-core');
}
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.setRequestInterception(true);
  page.on('request', (request) => request.respond({ status: 200, contentType: 'text/html', body: heroFixture }));
  await page.goto('http://hero.test/shared/hero-layout', { waitUntil: 'load' });

  const measureHero = async () => {
    return page.evaluate(() => {
      const hero = document.getElementById('hero');
      const h1 = hero?.querySelector('h1');
      const btn = hero?.querySelector('[data-ts-trip-hero-collapse]');
      const heroBox = hero?.getBoundingClientRect();
      const titleBox = h1?.getBoundingClientRect();
      const btnBox = btn?.getBoundingClientRect();
      const h1Style = h1 ? getComputedStyle(h1) : null;
      return {
        heroHeight: heroBox ? heroBox.height : 0,
        titleBox: titleBox
          ? { left: titleBox.left, top: titleBox.top, right: titleBox.right, bottom: titleBox.bottom }
          : null,
        btnBox: btnBox ? { left: btnBox.left, top: btnBox.top, right: btnBox.right, bottom: btnBox.bottom } : null,
        titleClientHeight: h1?.clientHeight ?? 0,
        titleLineHeight: h1Style ? parseFloat(h1Style.lineHeight) || parseFloat(h1Style.fontSize) : 0,
        titleScrollWidth: h1?.scrollWidth ?? 0,
        titleClientWidth: h1?.clientWidth ?? 0,
        titleOverflow: h1Style?.textOverflow,
        detailBoxes: ['description', 'dates', 'actions'].map((id) => {
          const node = document.getElementById(id);
          const rect = node.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, width: rect.width, display: getComputedStyle(node).display };
        }),
        itineraryTop: document.querySelector('main').getBoundingClientRect().top,
      };
    });
  };

  const base = await measureHero();
  assert.ok(Math.abs(base.heroHeight - 222) <= 1, 'ed8687b expanded hero fixture must retain its measured 390 height');
  await page.evaluate(heroScript);
  const expanded = await measureHero();
  assert.ok(expanded.titleBox && expanded.btnBox, 'hero title and collapse control required');
  assert.equal(rectsOverlap(expanded.titleBox, expanded.btnBox), false, '#937 expanded: chevron must not overlap title @390');
  assert.ok(
    expanded.titleClientHeight <= expanded.titleLineHeight + 2,
    '#937 expanded title must stay one line',
  );
  assert.ok(
    expanded.titleScrollWidth <= expanded.titleClientWidth,
    `#937 expanded title must not clip (scroll ${expanded.titleScrollWidth} vs client ${expanded.titleClientWidth})`,
  );
  assert.notEqual(expanded.titleOverflow, 'ellipsis', '#937 expanded title must not use ellipsis');
  assert.ok(Math.abs(expanded.heroHeight - base.heroHeight) <= 8, `#937 expanded height must stay within 8px of ed8687b (${base.heroHeight}); got ${expanded.heroHeight}`);
  for (let i = 1; i < expanded.detailBoxes.length; i += 1) {
    assert.ok(expanded.detailBoxes[i].top >= expanded.detailBoxes[i - 1].bottom, '#937 subtitle, date chip and actions must occupy separate rows');
  }
  assert.ok(Math.abs(expanded.detailBoxes[1].width - base.detailBoxes[1].width) <= 1, '#937 expanded date chip must retain its natural width');

  await page.click('[data-ts-trip-hero-collapse]');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('hero')).paddingTop === '8px');
  const collapsed = await measureHero();
  assert.ok(collapsed.titleBox && collapsed.btnBox, 'collapsed hero chrome required');
  assert.equal(rectsOverlap(collapsed.titleBox, collapsed.btnBox), false, '#937 collapsed: chevron must not overlap title @390');
  assert.ok(collapsed.heroHeight <= 57, `#937 collapsed hero height must be ≤56px (+2px slop); got ${collapsed.heroHeight}`);
  assert.ok(collapsed.titleClientHeight <= collapsed.titleLineHeight + 2, '#937 collapsed title must stay one line');
  assert.ok(expanded.heroHeight > collapsed.heroHeight + 24, '#937 expanded hero must stay clearly taller than collapsed');
  assert.ok(collapsed.detailBoxes.every((box) => box.display === 'none'), '#937 collapsed details and actions must be hidden');
  assert.ok(collapsed.itineraryTop < expanded.itineraryTop, '#937 collapsing must move the itinerary up');
  assert.equal(await page.evaluate(() => localStorage.getItem('vk-trip-hero-collapsed:hero-layout')), '1');
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(heroScript);
  assert.equal(await page.$eval('#hero', (hero) => hero.dataset.collapsed), '1', '#937 collapse must survive reload');
  await page.click('[data-ts-trip-hero-collapse]');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('hero')).paddingTop === '32px');
  assert.ok(Math.abs((await measureHero()).heroHeight - expanded.heroHeight) <= 1, '#937 re-expanding must restore the full height');
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.waitForFunction(() => !document.querySelector('[data-ts-trip-site-hero]'));
  assert.equal(await page.$('[data-ts-trip-hero-collapse]'), null, '#937 desktop must not retain mobile chrome');
} finally {
  await browser.close();
}

console.log('vacation app #927 hero collapse regression passed');
