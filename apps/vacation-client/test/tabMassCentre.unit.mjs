import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

import { TAB_ICONS, TAB_LABELS, TAB_ORDER } from '../src/lib/tabNavModel.mjs';
import { collectCategoryTabInkMetrics } from '../../../scripts/lib/shared-trip-category-tab-icon-metrics.mjs';

const clientRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CHECKS = ['Day-by-Day', 'Flights', 'Hotels'];
const LIMIT = { 390: 0.75, 1280: 0.5 };

function loadPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch {
    return require('/tmp/pptr/node_modules/puppeteer-core');
  }
}

const bundled = await esbuild.build({
  absWorkingDir: clientRoot,
  entryPoints: ['src/lib/paintTabEmoji.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'TabPaint',
  platform: 'browser',
  logLevel: 'silent',
});

const tabs = TAB_ORDER.map((id) => ({ id, label: TAB_LABELS[id], emoji: TAB_ICONS[id] }));

const html = `<!doctype html><meta charset="utf-8"><style>
:root { --bg:#eef1f4; --card:#ffffff; --border:#d1d5db; --text:#111827; --accent:#1e293b; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif; }
.tsv-tabs { display:flex; flex-wrap:nowrap; gap:4px; padding:8px 10px; border-bottom:1px solid var(--border); }
.tsv-tab { flex:1 1 0; min-width:0; min-height:32px; border:1px solid var(--border); background:var(--card); color:var(--text); border-radius:999px; padding:6px 8px; font-size:11px; font-weight:700; line-height:1; display:inline-flex; align-items:center; justify-content:center; gap:4px; }
.tsv-tab.is-active { background:var(--accent); border-color:var(--accent); color:#ffffff; }
.tsv-tab-icon-chip { width:16px; height:16px; min-width:16px; flex:0 0 16px; display:inline-flex; align-items:center; justify-content:center; align-self:center; position:relative; top:0; line-height:1; box-sizing:border-box; font-size:14px; font-weight:600; font-family:'Apple Color Emoji','Segoe UI Emoji',sans-serif; }
.tsv-tab-emoji-wrap { display:inline-flex; align-items:center; justify-content:center; line-height:1; width:16px; height:16px; }
.tsv-tab-emoji-canvas { width:16px; height:16px; display:block; }
.tsv-tab-label { position:relative; height:16px; line-height:16px; display:inline-flex; align-items:center; align-self:center; vertical-align:middle; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
@media (max-width:480px) {
  .tsv-tab:not(.is-active) .tsv-tab-label { display:none !important; }
  .tsv-tab.is-active { flex:1.4 1 0; }
}
@media (min-width:481px) {
  .tsv-tab { padding:8px 10px; font-size:12px; }
}
</style>
<nav class="tsv-tabs" id="tabs"></nav>
<script>
window.boot = (rows) => {
  const nav = document.getElementById('tabs');
  nav.replaceChildren();
  for (const row of rows) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tsv-tab';
    btn.setAttribute('aria-label', row.label);
    btn.dataset.id = row.id;
    const chip = document.createElement('span');
    chip.className = 'tsv-tab-icon-chip';
    chip.setAttribute('data-tab-category', row.id);
    chip.setAttribute('data-ts-category-tab-icon', '1');
    chip.setAttribute('data-ts-logo-chip', '1');
    const wrap = document.createElement('span');
    wrap.className = 'tsv-tab-emoji-wrap';
    wrap.setAttribute('data-ts-tab-emoji', '1');
    const canvas = document.createElement('canvas');
    canvas.className = 'tsv-tab-emoji-canvas';
    canvas.width = 32;
    canvas.height = 32;
    canvas.dataset.emoji = row.emoji;
    wrap.appendChild(canvas);
    chip.appendChild(wrap);
    const label = document.createElement('span');
    label.className = 'tsv-tab-label';
    label.textContent = row.label;
    btn.append(chip, label);
    nav.appendChild(btn);
  }
};
window.paintActive = (id) => {
  for (const btn of document.querySelectorAll('button.tsv-tab')) {
    btn.classList.toggle('is-active', btn.dataset.id === id);
  }
  for (const btn of document.querySelectorAll('button.tsv-tab')) {
    const canvas = btn.querySelector('canvas');
    TabPaint.paintTabEmoji(canvas, canvas.dataset.emoji);
  }
};
</script>`;

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: width === 390 ? 844 : 800, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.addScriptTag({ content: bundled.outputFiles[0].text });
    await page.evaluate((rows) => window.boot(rows), tabs);
    for (const label of CHECKS) {
      const id = tabs.find((row) => row.label === label).id;
      await page.evaluate((active) => window.paintActive(active), id);
      const metrics = await collectCategoryTabInkMetrics(page);
      const row = metrics.find((entry) => entry.tab === label);
      assert.ok(row, `missing mass metric for ${label} at ${width}px`);
      assert.ok(
        Math.abs(row.iconVsTabPx) <= LIMIT[width],
        `${label} mass vs tab pill ${row.iconVsTabPx.toFixed(2)}px at ${width}px (max ${LIMIT[width]})`,
      );
    }
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('tab emoji mass vs pill checks passed');
