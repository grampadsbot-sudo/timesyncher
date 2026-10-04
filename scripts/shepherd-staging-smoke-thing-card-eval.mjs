/** Shared-page thing-card DOM grading (harness-only; approved PDF thing print contract). */

import { logoChipInkPresent } from './lib/logo-pixel-ink-grade.mjs';
import { gradeSharedTabLogoUrlRecords } from './shepherd-staging-smoke-grader-lib.mjs';

const THING_CARD_TAB_KEYWORDS = ['cars', 'hotels', 'restaurants', 'stores', 'flights', 'events'];

/** Tabs that render list-level tag filter chips (All tags + ci / $n). */
export const THING_CARD_TAG_FILTER_TABS = new Set(['restaurants', 'stores']);

const SORT_CONTROL_RE = /^(name|price)(\s*[↑↓])?$/i;

export function normalizeThingCardTagLabel(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function sortedUniqueThingCardTags(list = []) {
  const out = new Set();
  for (const item of list || []) {
    const label = normalizeThingCardTagLabel(item);
    if (label) out.add(label);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function placeMatchesThingCardTab(place = {}, tabKeyword = '') {
  const tab = String(tabKeyword || '').toLowerCase();
  const name = String(place.name || place.title || '').trim();
  const category = String(place.category_name || place.category || '').toLowerCase();
  const hay = `${name} ${category}`;
  if (tab === 'hotels' || tab === 'hotel') {
    return /hotel|lodging|resort|stay/i.test(hay);
  }
  if (tab === 'cars' || tab === 'car') {
    return /\bcar\b|rental|hertz|alamo|avis|enterprise|budget/i.test(hay);
  }
  if (tab === 'restaurants' || tab === 'restaurant') {
    return /restaurant|dining|food|cafe|bar|grill|bistro|eatery/i.test(hay);
  }
  if (tab === 'stores' || tab === 'store') {
    return /store|shop|retail|market|boutique|mall/i.test(hay);
  }
  return false;
}

function thingCardTagFieldForTab(tab = '') {
  const t = String(tab || '').toLowerCase();
  if (t === 'restaurants' || t === 'restaurant') return 'restaurantTags';
  if (t === 'stores' || t === 'store') return 'storeTags';
  return null;
}

/** Tags on Things in this tab from shared API payload (thingOverrides + place). */
export function apiThingTagsForTab(sharedJson = {}, tab = '') {
  const field = thingCardTagFieldForTab(tab);
  if (!field) return [];
  const places = Array.isArray(sharedJson?.places) ? sharedJson.places : [];
  const overrides = sharedJson?.thingOverrides && typeof sharedJson.thingOverrides === 'object'
    ? sharedJson.thingOverrides
    : {};
  const tags = new Set();
  for (const place of places) {
    if (!placeMatchesThingCardTab(place, tab)) continue;
    const key = `place:${place.id}`;
    const override = overrides[key] && typeof overrides[key] === 'object' ? overrides[key] : {};
    const raw = override[field] ?? place[field];
    const list = Array.isArray(raw)
      ? raw
      : String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const tag of list) {
      const label = normalizeThingCardTagLabel(tag);
      if (label) tags.add(label);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

/**
 * Fail-closed tag-filter parity: filter chip set must equal union of thing tags.
 * @returns {{ pass: boolean, failures: object[], filterTags: string[], thingTags: string[], apiThingTags: string[] }}
 */
export function gradeThingCardTagFilterParity({
  tab = 'unknown',
  viewport = null,
  filterTags = [],
  thingTags = [],
  apiThingTags = [],
} = {}) {
  const failures = [];
  const filters = sortedUniqueThingCardTags(filterTags);
  const things = sortedUniqueThingCardTags(thingTags);
  const apiTags = sortedUniqueThingCardTags(apiThingTags);
  const tabKey = String(tab || '').toLowerCase();
  const tagTab = THING_CARD_TAG_FILTER_TABS.has(tabKey);

  if (tagTab && apiTags.length) {
    const apiStr = apiTags.join('\0');
    const thingStr = things.join('\0');
    if (apiStr !== thingStr) {
      failures.push({
        rule: 'tag_filter_api_dom',
        tab,
        viewport,
        detail: `thing tags from detail DOM [${things.join(', ')}] != shared API [${apiTags.join(', ')}]`,
        thingTags: things,
        apiThingTags: apiTags,
      });
    }
  }

  const filterSet = new Set(filters);
  const thingSet = new Set(things);
  for (const tag of things) {
    if (!filterSet.has(tag)) {
      failures.push({
        rule: 'tag_filter_missing',
        tab,
        viewport,
        detail: `thing tag missing from tab filters: ${tag}`,
        tag,
        filterTags: filters,
        thingTags: things,
      });
    }
  }
  for (const tag of filters) {
    if (!thingSet.has(tag)) {
      failures.push({
        rule: 'tag_filter_orphan',
        tab,
        viewport,
        detail: `filter chip has no thing carrying tag: ${tag}`,
        tag,
        filterTags: filters,
        thingTags: things,
      });
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    filterTags: filters,
    thingTags: things,
    apiThingTags: apiTags,
  };
}

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
  const tagParity = gradeThingCardTagFilterParity({
    tab,
    viewport,
    filterTags: scan.filterTags,
    thingTags: scan.thingTags,
    apiThingTags: scan.apiThingTags,
  });
  for (const f of tagParity.failures) failures.push(f);

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
  return {
    pass: failures.length === 0,
    failures,
    rowCount: rows.length,
    tagFilterParity: {
      filterTags: tagParity.filterTags,
      thingTags: tagParity.thingTags,
      apiThingTags: tagParity.apiThingTags,
    },
  };
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
  function tagFilterChips() {
    for (const btn of document.querySelectorAll('button')) {
      const st = getComputedStyle(btn);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
      const label = String(btn.textContent || '').replace(/\\s+/g, ' ').trim();
      if (label !== 'All tags') continue;
      const row = btn.parentElement;
      if (!row) continue;
      const chips = [];
      for (const chip of row.querySelectorAll('button')) {
        const cst = getComputedStyle(chip);
        if (cst.display === 'none' || cst.visibility === 'hidden') continue;
        const text = String(chip.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text && text !== 'All tags') chips.push(text);
      }
      return chips;
    }
    return [];
  }
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
    return { sortControls: sortControls(), filterTags: tagFilterChips(), rows };
  };
})()`;
