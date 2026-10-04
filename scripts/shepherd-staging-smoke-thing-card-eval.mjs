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
  if (raw == null || String(raw).trim() === '') return true;
  const v = String(raw).trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return v === '1' || v === 'true' || v === 'yes';
}

/** Default on; set env `THING_CARD_FAIL_ON_SORT_CONTROLS` to `0`/`false`/`no` to allow standalone Name/Price sort pills. */
export const THING_CARD_FAIL_ON_SORT_CONTROLS = thingCardFailOnSortControlsFromEnv();

export function thingCardSortControlLabel(text) {
  const label = String(text || '').replace(/\s+/g, ' ').trim();
  if (!label) return null;
  if (SORT_CONTROL_RE.test(label)) return label;
  if (/^price\b/i.test(label) && /[↑↓]/.test(label)) return label;
  return null;
}

/** Standalone pill sort controls (not list column header labels). */
export function forbiddenSortControlsFromMatches(sortControlMatches = []) {
  return (sortControlMatches || []).map((m) => m?.label).filter(Boolean);
}

function rowTitlesFromScanRows(rows = []) {
  return (rows || []).map((r) => String(r?.title || '').trim()).filter(Boolean);
}

function parseThingCardRowPrice(rowText = '') {
  const m = String(rowText || '').match(/\$\s*([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

function rowPriceTextsFromScanRows(rows = []) {
  return (rows || []).map((r) => `${r?.title || ''} ${r?.summaryText || ''}`);
}

export function isAscendingNameOrder(titles = []) {
  const list = titles.map((t) => String(t || '').trim()).filter(Boolean);
  if (list.length < 2) return false;
  for (let i = 1; i < list.length; i += 1) {
    if (list[i - 1].localeCompare(list[i], undefined, { sensitivity: 'base' }) > 0) return false;
  }
  return true;
}

export function isDescendingNameOrder(titles = []) {
  const list = titles.map((t) => String(t || '').trim()).filter(Boolean);
  if (list.length < 2) return false;
  for (let i = 1; i < list.length; i += 1) {
    if (list[i - 1].localeCompare(list[i], undefined, { sensitivity: 'base' }) < 0) return false;
  }
  return true;
}

export function priceOrderOk(prices = [], direction = 'asc') {
  const vals = prices.map((p) => (p == null ? null : Number(p)));
  const pricedIdx = vals.map((p, i) => (p != null && !Number.isNaN(p) ? i : -1)).filter((i) => i >= 0);
  const unpricedIdx = vals.map((p, i) => (p == null || Number.isNaN(p) ? i : -1)).filter((i) => i >= 0);
  if (pricedIdx.length >= 2) {
    for (let k = 1; k < pricedIdx.length; k += 1) {
      const a = vals[pricedIdx[k - 1]];
      const b = vals[pricedIdx[k]];
      if (direction === 'asc' && a > b) return false;
      if (direction === 'desc' && a < b) return false;
    }
  }
  if (unpricedIdx.length && pricedIdx.length) {
    const atStart = unpricedIdx.every((i) => i < pricedIdx[0]);
    const atEnd = unpricedIdx.every((i) => i > pricedIdx[pricedIdx.length - 1]);
    if (!atStart && !atEnd) return false;
  }
  return pricedIdx.length >= 1 || unpricedIdx.length >= 2;
}

/**
 * Fail-closed SORT-BY-LABEL grading from harness interaction snapshots.
 */
export function gradeThingCardSortByLabel({
  tab = 'unknown',
  viewport = null,
  columnSortLabels = {},
  rows = [],
  orders = {},
} = {}) {
  const failures = [];
  const rowCount = (rows || []).length;
  const titles = rowTitlesFromScanRows(rows);
  const rowTexts = rowPriceTextsFromScanRows(rows);
  const gate = {
    rule: 'SORT-BY-LABEL',
    tab,
    viewport,
    rowCount,
    columnSortLabels,
    orders,
    sortControlMatches: orders.sortControlMatches,
  };

  if (rowCount < 2) {
    return {
      pass: false,
      status: 'not_enough_rows',
      failures: [{
        rule: 'SORT-BY-LABEL',
        tab,
        viewport,
        detail: 'not_enough_rows',
        rowCount,
      }],
      gate,
    };
  }

  if (!columnSortLabels?.name) {
    failures.push({
      rule: 'SORT-BY-LABEL',
      tab,
      viewport,
      detail: 'missing Name column label',
    });
  }
  if (!columnSortLabels?.price) {
    failures.push({
      rule: 'SORT-BY-LABEL',
      tab,
      viewport,
      detail: 'missing Price column label',
    });
  }

  const nameAfterFirst = orders.nameAfterFirst || [];
  const nameAfterSecond = orders.nameAfterSecond || [];
  const priceAfter = orders.priceAfter || [];

  if (columnSortLabels?.name) {
    if (!isAscendingNameOrder(nameAfterFirst)) {
      failures.push({
        rule: 'SORT-BY-LABEL',
        tab,
        viewport,
        detail: `Name click did not sort ascending: [${nameAfterFirst.join(', ')}]`,
        observed: nameAfterFirst,
      });
    }
    if (nameAfterSecond.length >= 2
      && nameAfterFirst.join('\0') === nameAfterSecond.join('\0')) {
      failures.push({
        rule: 'SORT-BY-LABEL',
        tab,
        viewport,
        detail: 'second Name click did not reverse or change order',
        observed: nameAfterSecond,
      });
    }
    if (nameAfterSecond.length >= 2 && isAscendingNameOrder(nameAfterSecond)) {
      failures.push({
        rule: 'SORT-BY-LABEL',
        tab,
        viewport,
        detail: `second Name click still ascending: [${nameAfterSecond.join(', ')}]`,
        observed: nameAfterSecond,
      });
    }
  }

  if (columnSortLabels?.price && priceAfter.length >= 2) {
    const prices = priceAfter.map((text) => parseThingCardRowPrice(text));
    const dir = orders.priceDirection || 'asc';
    if (!priceOrderOk(prices, dir)) {
      failures.push({
        rule: 'SORT-BY-LABEL',
        tab,
        viewport,
        detail: `Price click order invalid (${dir}): prices=${JSON.stringify(prices)}`,
        observed: priceAfter,
      });
    }
  }

  return {
    pass: failures.length === 0,
    status: failures.length ? 'failed' : 'ok',
    failures,
    gate: {
      ...gate,
      titlesBefore: titles,
      rowTextsBefore: rowTexts,
    },
  };
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
    const forbidden = scan.sortControls?.length
      ? scan.sortControls
      : forbiddenSortControlsFromMatches(scan.sortControlMatches);
    for (const sortLabel of forbidden) {
      failures.push({
        rule: 'sort_control',
        tab,
        viewport,
        detail: `forbidden sort control: ${sortLabel}`,
        sortControlMatches: scan.sortControlMatches,
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

  if (scan.sortByLabel?.failures?.length) {
    for (const f of scan.sortByLabel.failures) failures.push(f);
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

export { EVALUATE_THING_CARD_TAB_DOM_SOURCE } from './shepherd-staging-smoke-thing-card-dom.mjs';
