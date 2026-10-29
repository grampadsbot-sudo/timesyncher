#!/usr/bin/env node
/**
 * Local Gate B budget proof. Does not deploy.
 * Catalog page: every fixture place as a legacy flex budget div (base shape).
 * Head page: day-timeline assignments only, as data-ts-budget-row divs, plus stray list li.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assignedPlaceIds } from '../../../src/vacation/itinerary-minimums.mjs';
import { collectBudgetEvidence } from './budget-rows.mjs';

const fixturePath = process.env.TSV_CAPTURE_FIXTURE
  || new URL('../../fixtures/gate-b-nyc-shared-staging.json', import.meta.url);
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
const shared = JSON.parse(readFileSync(fixturePath, 'utf8'));
const timelineIds = assignedPlaceIds(shared);
const places = (shared.places || []).filter((place) => place && place.id != null);

function nameOf(place) {
  return String(place.name || place.title || `place ${place.id}`).replace(/[<>&]/g, '');
}

function row(place, marked) {
  const attrs = marked
    ? ` data-ts-budget-row="1" data-place-id="${place.id}"`
    : '';
  return `<div${attrs} style="display:flex;justify-content:space-between;gap:10px;padding:4px 0 4px 12px"><button>${nameOf(place)}</button><span>$10</span></div>`;
}

function page(rows, extra = '') {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div data-ts-budget-panel="1"><div>Overall trip budget</div>${rows}${extra}</div>
<pre id="out"></pre>
<script>
const collect = ${collectBudgetEvidence.toString()};
const evidence = collect();
document.getElementById('out').textContent = JSON.stringify(evidence);
</script></body></html>`;
}

function capture(html) {
  const dir = join(tmpdir(), `budget-proof-${process.pid}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'page.html');
  writeFileSync(file, html);
  const stdout = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    `--user-data-dir=${join(dir, 'profile')}`,
    '--virtual-time-budget=2000', '--dump-dom', `file://${file}`,
  ], { encoding: 'utf8', timeout: 25000, maxBuffer: 12 * 1024 * 1024 });
  const start = stdout.indexOf('<pre id="out">');
  const end = stdout.indexOf('</pre>', start);
  if (start < 0 || end < 0) throw new Error('budget evidence missing from chrome dump');
  return JSON.parse(stdout.slice(start + '<pre id="out">'.length, end).replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
}

const catalog = capture(page(places.map((place) => row(place, false)).join('')));
const head = capture(page(
  places.filter((place) => timelineIds.has(Number(place.id))).map((place) => row(place, true)).join(''),
  '<li data-list-row="1">stray list row</li><li data-list-row="1">second stray</li>',
));
const headIds = new Set(head.budget_membership.map((row) => String(row.place_id)));
const missing = [...timelineIds].filter((id) => !headIds.has(String(id)));
const extra = head.budget_membership.filter((row) => !timelineIds.has(Number(row.place_id)));
const receipt = {
  tip: process.env.GIT_TIP || null,
  fixture: String(fixturePath),
  catalog_places: places.length,
  timeline_assigned: timelineIds.size,
  catalog_budget_row_count: catalog.budget_row_count,
  head_budget_row_count: head.budget_row_count,
  head_matches_timeline: missing.length === 0 && extra.length === 0 && head.budget_row_count === timelineIds.size,
  stray_li_excluded: !head.budget_membership.some((row) => /stray/.test(row.name)),
  catalog_text_has_overall: /overall trip budget/i.test(catalog.budget_text),
  head_text_has_overall: /overall trip budget/i.test(head.budget_text),
  missing_timeline_ids: missing,
  extra_head_rows: extra.map((row) => row.name),
};
if (!receipt.head_matches_timeline || !receipt.stray_li_excluded || catalog.budget_row_count !== places.length) {
  console.error(JSON.stringify(receipt, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(receipt, null, 2));
