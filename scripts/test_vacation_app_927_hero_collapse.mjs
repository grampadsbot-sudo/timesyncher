import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);

const heroScript = await readFile(new URL('../public/ts-trip-hero-collapse.js', import.meta.url), 'utf8');
const sharedApp = await readFile(new URL('../shared-app.html', import.meta.url), 'utf8');

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

const heroFixture = (collapsed) => `<!doctype html>
<html><head><meta charset="utf-8"><style>${heroCss}</style></head><body style="margin:0">
<div data-ts-trip-site-hero="1" data-collapsed="${collapsed}" style="position:relative;box-sizing:border-box;width:100%;padding:20px 16px;color:#fff;background:linear-gradient(135deg, rgb(0, 0, 0) 0%, rgb(15, 23, 42) 50%, rgb(30, 41, 59) 100%);">
  <h1>Craig / Kim NYC June 2026</h1>
  <p data-ts-trip-hero-detail="1" style="margin:8px 0 0;text-align:center">Vacation together</p>
  <div data-ts-trip-hero-detail="1" style="text-align:center;margin-top:4px">Jun 23 – 30, 2026</div>
  <div data-ts-trip-hero-actions="1"><span data-trip-view-root="1" style="display:inline-flex;gap:6px"><span style="width:40px;height:40px;border-radius:999px;background:rgba(255,255,255,.15)"></span><span style="width:40px;height:40px;border-radius:999px;background:rgba(255,255,255,.15)"></span><span style="width:40px;height:40px;border-radius:999px;background:rgba(255,255,255,.15)"></span></span></div>
  <button type="button" data-ts-trip-hero-collapse="1" aria-label="Collapse">▾</button>
</div>
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

  const measureHero = async (collapsed) => {
    await page.setContent(heroFixture(collapsed ? '1' : '0'), { waitUntil: 'load' });
    return page.evaluate(() => {
      const hero = document.querySelector('[data-ts-trip-site-hero="1"]');
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
        titleLineHeight: h1Style ? parseFloat(h1Style.lineHeight) || h1Style.fontSize : 0,
      };
    });
  };

  const expanded = await measureHero(false);
  assert.ok(expanded.titleBox && expanded.btnBox, 'hero title and collapse control required');
  assert.equal(rectsOverlap(expanded.titleBox, expanded.btnBox), false, '#937 expanded: chevron must not overlap title @390');

  const collapsed = await measureHero(true);
  assert.ok(collapsed.titleBox && collapsed.btnBox, 'collapsed hero chrome required');
  assert.equal(rectsOverlap(collapsed.titleBox, collapsed.btnBox), false, '#937 collapsed: chevron must not overlap title @390');
  assert.ok(collapsed.heroHeight <= 57, `#937 collapsed hero height must be ≤56px (+2px slop); got ${collapsed.heroHeight}`);
  assert.ok(collapsed.titleClientHeight <= collapsed.titleLineHeight + 2, '#937 collapsed title must stay one line');
  assert.ok(expanded.heroHeight > collapsed.heroHeight + 24, '#937 expanded hero must stay clearly taller than collapsed');
} finally {
  await browser.close();
}

console.log('vacation app #927 hero collapse regression passed');
