/** Shared-page thing-card DOM grading (harness-only; approved PDF thing print contract). */

import { logoChipInkPresent } from './lib/logo-pixel-ink-grade.mjs';
import { gradeSharedTabLogoUrlRecords } from './shepherd-staging-smoke-grader-lib.mjs';

const THING_CARD_TAB_KEYWORDS = ['cars', 'hotels', 'restaurants', 'stores', 'flights', 'events'];

const SORT_CONTROL_RE = /^(name|price)(\s*[↑↓])?$/i;

export function thingCardFailOnSortControlsFromEnv(env = process.env) {
  const raw = env?.THING_CARD_FAIL_ON_SORT_CONTROLS;
  if (raw == null || String(raw).trim() === '') return false;
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Default false; set env `THING_CARD_FAIL_ON_SORT_CONTROLS` to `1`/`true`/`yes` to fail closed on Name/Price sort UI. */
export const THING_CARD_FAIL_ON_SORT_CONTROLS = thingCardFailOnSortControlsFromEnv();

export function thingCardSortControlLabel(text) {
  const label = String(text || '').replace(/\s+/g, ' ').trim();
  if (!label) return null;
  if (SORT_CONTROL_RE.test(label)) return label;
  if (/^price\b/i.test(label) && /[↑↓]/.test(label)) return label;
  return null;
}

export function populatedThingCardTabs(sharedJson = {}) {
  const tabs = [];
  for (const tab of THING_CARD_TAB_KEYWORDS) {
    const evidence = gradeSharedTabLogoUrlRecords(sharedJson, tab);
    if ((evidence.placeCount || 0) > 0) tabs.push(tab);
  }
  return tabs;
}

/**
 * Pure grade from in-page scan rows (see evaluateThingCardTabDom source in thing-card harness).
 */
export function gradeThingCardTabScan(scan = {}, inkByRowIndex = {}, options = {}) {
  const failures = [];
  const tab = scan.tab || 'unknown';
  const viewport = scan.viewport || null;
  const failOnSortControls = options.failOnSortControls ?? THING_CARD_FAIL_ON_SORT_CONTROLS;
  if (failOnSortControls) {
    for (const sortLabel of scan.sortControls || []) {
      failures.push({
        rule: 'sort_control',
        tab,
        viewport,
        detail: `forbidden sort control: ${sortLabel}`,
      });
    }
  }
  const rows = scan.rows || [];
  if (!rows.length && scan.expectedRows > 0) {
    failures.push({
      rule: 'thing_rows',
      tab,
      viewport,
      detail: 'populated tab has zero list rows in DOM',
    });
  }
  for (const row of rows) {
    const summary = String(row.summaryText || '').trim();
    if (!summary) {
      failures.push({
        rule: 'reservation_summary',
        tab,
        viewport,
        rowTitle: row.title || null,
        detail: 'row missing non-empty reservation summary',
      });
    }
    const ink = inkByRowIndex[row.index];
    if (ink && ink.inkPresent === false) {
      failures.push({
        rule: 'logo_ink',
        tab,
        viewport,
        rowTitle: row.title || null,
        detail: ink.inkError || 'logo chip lacks painted ink',
      });
    } else if (row.requiresLogo && ink == null) {
      failures.push({
        rule: 'logo_ink',
        tab,
        viewport,
        rowTitle: row.title || null,
        detail: 'logo chip ink not measured',
      });
    }
  }
  return { pass: failures.length === 0, failures, rowCount: rows.length };
}

export function gradeThingCardHarnessResult({ tabs = [], probes = [] } = {}) {
  const failures = [];
  for (const probe of probes) {
    if (probe.skipped) {
      failures.push({ rule: 'skipped', detail: probe.reason || 'skipped', tab: probe.tab, viewport: probe.viewport });
      continue;
    }
    for (const f of probe.failures || []) failures.push(f);
  }
  const required = ['cars', 'hotels'].filter((t) => tabs.includes(t));
  for (const tab of required) {
    const hasProbe = probes.some((p) => p.tab === tab && !p.skipped);
    if (!hasProbe) {
      failures.push({ rule: 'required_tab', tab, detail: `missing probe for required tab ${tab}` });
    }
  }
  return { pass: failures.length === 0, failures, probes };
}

export function rowInkGradeFromCom(com = {}) {
  const present = logoChipInkPresent(com);
  return {
    inkPresent: present,
    inkError: present ? null : (com?.error || 'ink_below_min_mass'),
  };
}

/** Serialized for page.evaluate — keep self-contained. */
export const EVALUATE_THING_CARD_TAB_DOM_SOURCE = `(() => {
  function sortControls() {
    const hits = [];
    for (const el of document.querySelectorAll('button, [role="button"]')) {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const label = String(el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (/^(name|price)(\\s*[↑↓])?$/i.test(label) || (/^price\\b/i.test(label) && /[↑↓]/.test(label))) {
        hits.push(label);
      }
    }
    return hits;
  }
  function rowNodes() {
    const live = document.querySelector('[data-shared-live-tab]');
    const scope = live || document;
    return Array.from(scope.querySelectorAll('li[data-list-row="1"], li[data-has-logo="1"]')).filter((li) => {
      const st = getComputedStyle(li);
      const r = li.getBoundingClientRect();
      return st.display !== 'none' && st.visibility !== 'hidden' && r.height > 4 && r.width > 20;
    });
  }
  return function evaluateThingCardTabDom() {
    const rows = rowNodes().map((li, index) => {
      const summaryEl = li.querySelector('[data-list-summary], [data-row-summary]');
      const title = li.querySelector('strong')?.textContent?.trim() || '';
      const chip = li.querySelector('[data-ts-logo-chip], img.tiny-logo, .thing-emoji');
      const img = li.querySelector('img.tiny-logo, [data-ts-logo-chip] img');
      const src = img?.getAttribute('src') || li.getAttribute('data-logo-src') || '';
      li.setAttribute('data-ts-thing-card-row-idx', String(index));
      return {
        index,
        title,
        summaryText: summaryEl ? String(summaryEl.textContent || '').trim() : '',
        requiresLogo: Boolean(chip),
        logoSrc: String(src || '').trim(),
      };
    });
    return { sortControls: sortControls(), rows };
  };
})()`;
