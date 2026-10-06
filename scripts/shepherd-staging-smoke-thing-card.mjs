import { clickSharedTabByKeyword, gotoAndHydrateSharedIntakePage, intakeShareUrlFromPrep } from './shepherd-staging-smoke-shared-ui.mjs';
import { gradeSharedTabLogoUrlRecords } from './shepherd-staging-smoke-grader-lib.mjs';
import {
  SHARED_API_RETRY_INTERVAL_MS,
  SHARED_API_RETRY_TIMEOUT_MS,
} from './shepherd-staging-smoke-shared-ui-map.mjs';
import { LOGO_TAB_SETTLE_MS } from './shepherd-staging-smoke-logo-metrics.mjs';
import { measureLogoComFromPngBuffer } from './shepherd-staging-smoke-logo-metrics.mjs';
import {
  apiThingTagsForTab,
  EVALUATE_THING_CARD_TAB_DOM_SOURCE,
  gradeThingCardHarnessResult,
  gradeThingCardSortButtons,
  gradeThingCardTabScan,
  normalizeThingCardTagLabel,
  populatedThingCardTabs,
  rowInkGradeFromCom,
  THING_CARD_FAIL_ON_SORT_CONTROLS,
  THING_CARD_TAG_FILTER_TABS,
} from './shepherd-staging-smoke-thing-card-eval.mjs';

const THING_CARD_DOM_EVAL_PREFIX = `const __thingCardDomApi = ${EVALUATE_THING_CARD_TAB_DOM_SOURCE};`;

const THING_CARD_VIEWPORTS = [
  { width: 390, height: 844, label: '390' },
  { width: 1280, height: 800, label: '1280' },
];

async function disposeHandle(handle) {
  if (handle) await handle.dispose();
}

async function evaluateTabDom(page) {
  return page.evaluate(`${THING_CARD_DOM_EVAL_PREFIX} return __thingCardDomApi.evaluateThingCardTabDom();`);
}

async function runSortButtonsProbe(page, { tab, viewport, dom, artifactPath }) {
  const readOrder = () => page.evaluate(`${THING_CARD_DOM_EVAL_PREFIX} return __thingCardDomApi.readThingCardRowOrder();`);
  const clickButton = (which) => page.evaluate(`${THING_CARD_DOM_EVAL_PREFIX} return __thingCardDomApi.clickThingCardSortButton(${JSON.stringify(which)});`);
  const clickLabel = (which) => page.evaluate(`${THING_CARD_DOM_EVAL_PREFIX} return __thingCardDomApi.clickThingCardColumnSortLabel(${JSON.stringify(which)});`);
  const readSortLabels = () => page.evaluate(`${THING_CARD_DOM_EVAL_PREFIX} return __thingCardDomApi.readSortButtonLabels();`);

  const beforeCrop = artifactPath(`thing-card-${tab}-${viewport}-sort-before.png`);
  const panelBefore = await page.$('[data-shared-live-tab], .logo-list, [data-trip-directory]');
  if (panelBefore) {
    await panelBefore.screenshot({ path: beforeCrop, type: 'png' });
    await disposeHandle(panelBefore);
  }

  const orders = {
    titlesBefore: dom.rows?.map((r) => r.title).filter(Boolean) || [],
    rowTextsBefore: dom.rows?.map((r) => r.rowText || `${r.title} ${r.summaryText}`) || [],
    sortControlMatches: dom.sortControlMatches,
  };

  const hasPills = (dom.sortControlMatches || []).length >= 1;

  if ((dom.rows || []).length >= 2 && hasPills) {
    await clickButton('name');
    await new Promise((r) => setTimeout(r, LOGO_TAB_SETTLE_MS));
    orders.nameAfterFirst = (await readOrder()).titles;
    orders.nameActiveAfterFirst = (await readSortLabels()).name;
    await clickButton('name');
    await new Promise((r) => setTimeout(r, LOGO_TAB_SETTLE_MS));
    orders.nameAfterSecond = (await readOrder()).titles;

    await clickButton('price');
    orders.priceClicked = true;
    await new Promise((r) => setTimeout(r, LOGO_TAB_SETTLE_MS));
    const afterPrice = await readOrder();
    orders.priceAfter = afterPrice.rowTexts;
    orders.priceActiveAfterClick = (await readSortLabels()).price;
    orders.priceDirection = 'asc';
  }

  if ((dom.rows || []).length >= 2 && (dom.columnSortLabels?.name || dom.columnSortLabels?.price)) {
    const beforeCol = await readOrder();
    const colClick = dom.columnSortLabels?.name
      ? await clickLabel('name')
      : await clickLabel('price');
    if (colClick?.clicked) {
      await new Promise((r) => setTimeout(r, LOGO_TAB_SETTLE_MS));
      const afterCol = await readOrder();
      orders.columnLabelSorted = beforeCol.titles.join('\0') !== afterCol.titles.join('\0');
    }
  }

  const afterCrop = artifactPath(`thing-card-${tab}-${viewport}-sort-after.png`);
  const panelAfter = await page.$('[data-shared-live-tab], .logo-list, [data-trip-directory]');
  if (panelAfter) {
    await panelAfter.screenshot({ path: afterCrop, type: 'png' });
    await disposeHandle(panelAfter);
  }

  const sortButtons = gradeThingCardSortButtons({
    tab,
    viewport,
    sortControlMatches: dom.sortControlMatches,
    columnSortLabels: dom.columnSortLabels,
    rows: dom.rows,
    orders,
  });

  return {
    sortButtons,
    sortButtonsGate: {
      ...sortButtons.gate,
      status: sortButtons.status,
      rowSortExercised: sortButtons.rowSortExercised,
      priceSortExercised: sortButtons.priceSortExercised,
      priceStatus: sortButtons.priceStatus,
      beforeCrop,
      afterCrop,
      orders,
    },
  };
}

const THING_DETAIL_TAG_FIELD = {
  restaurants: 'Restaurant tags / chips',
  stores: 'Store tags / chips',
};

async function closeThingDetailIfOpen(page) {
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      const label = String(btn.textContent || '').trim();
      if (label === '×' || label === '✕') {
        btn.click();
        return true;
      }
    }
    return false;
  });
}

/** Harvest selected tag chips from open thing detail (restaurants / stores). */
async function readSelectedTagsFromThingDetail(page, fieldLabel) {
  return page.evaluate((labelText) => {
    const tags = [];
    for (const label of document.querySelectorAll('label')) {
      if (!String(label.textContent || '').includes(labelText)) continue;
      const root = label.parentElement || label;
      for (const chip of root.querySelectorAll('button')) {
        const st = getComputedStyle(chip);
        if (st.display === 'none' || st.visibility === 'hidden') continue;
        const bg = st.backgroundColor || '';
        const selected = bg === 'rgb(17, 24, 39)' || /111827/.test(chip.getAttribute('style') || '');
        if (!selected) continue;
        const text = String(chip.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) tags.push(text);
      }
    }
    return tags;
  }, fieldLabel);
}

async function collectThingTagsFromDetailPages(page, tab, { maxOpens = 20 } = {}) {
  const fieldLabel = THING_DETAIL_TAG_FIELD[tab];
  if (!fieldLabel || !THING_CARD_TAG_FILTER_TABS.has(tab)) {
    return [];
  }
  const tags = new Set();
  const handles = await page.$$('[aria-label="Open thing details"]');
  const limit = Math.min(handles.length, maxOpens);
  for (let i = 0; i < limit; i += 1) {
    const handle = handles[i];
    try {
      await handle.click();
      await new Promise((r) => setTimeout(r, 120));
      const rowTags = await readSelectedTagsFromThingDetail(page, fieldLabel);
      for (const tag of rowTags) {
        const label = normalizeThingCardTagLabel(tag);
        if (label) tags.add(label);
      }
    } finally {
      await closeThingDetailIfOpen(page);
      await new Promise((r) => setTimeout(r, 80));
      await handle.dispose();
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}

async function screenshotTagFilterRow(page, cropPath) {
  const handle = await page.evaluateHandle(() => {
    for (const btn of document.querySelectorAll('button')) {
      const label = String(btn.textContent || '').replace(/\s+/g, ' ').trim();
      if (label === 'All tags') return btn.parentElement;
    }
    return null;
  });
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    return false;
  }
  try {
    await el.screenshot({ path: cropPath, type: 'png' });
    return true;
  } finally {
    await disposeHandle(el);
    await disposeHandle(handle);
  }
}

async function measureRowInk(page, rowIndex) {
  const handle = await page.$(`[data-ts-thing-card-row-idx="${rowIndex}"] [data-ts-logo-chip], [data-ts-thing-card-row-idx="${rowIndex}"] img.tiny-logo`);
  if (!handle) return rowInkGradeFromCom({ error: 'chip_missing' });
  try {
    const cropBuf = await handle.screenshot({ type: 'png' });
    const com = await measureLogoComFromPngBuffer(cropBuf);
    return rowInkGradeFromCom(com);
  } finally {
    await disposeHandle(handle);
  }
}

export async function runSharedSiteThingCardCheck({ page, prep, artifactPath, setStage }) {
  const url = intakeShareUrlFromPrep(prep);
  const sharedJson = prep.sharedApi?.json || {};
  if (!url) {
    return {
      pass: false,
      checkTHINGCARD: { failReason: 'no_intake_map_url', probes: [] },
    };
  }
  const tabs = populatedThingCardTabs(sharedJson);
  const probes = [];
  setStage?.('thing-card hydrate shared');
  const hydrated = await gotoAndHydrateSharedIntakePage(page, url, {
    sharedApiRetryTimeoutMs: SHARED_API_RETRY_TIMEOUT_MS,
    sharedApiRetryIntervalMs: SHARED_API_RETRY_INTERVAL_MS,
  });
  if (hydrated.hydrationError) {
    return {
      pass: false,
      checkTHINGCARD: {
        failReason: hydrated.hydrationError,
        tabs,
        probes: [{ skipped: true, reason: hydrated.hydrationError }],
      },
    };
  }
  for (const viewport of THING_CARD_VIEWPORTS) {
    setStage?.(`thing-card viewport ${viewport.label}`);
    await page.setViewport({ width: viewport.width, height: viewport.height });
    await new Promise((r) => setTimeout(r, LOGO_TAB_SETTLE_MS));
    for (const tab of tabs) {
      setStage?.(`thing-card ${tab} @ ${viewport.label}`);
      const clicked = await clickSharedTabByKeyword(page, tab);
      if (!clicked) {
        probes.push({
          tab,
          viewport: viewport.label,
          skipped: true,
          reason: 'tab_not_clicked',
          failures: [{ rule: 'tab_click', tab, viewport: viewport.label, detail: 'could not activate tab' }],
        });
        continue;
      }
      await new Promise((r) => setTimeout(r, LOGO_TAB_SETTLE_MS));
      const dom = await evaluateTabDom(page);
      const apiThingTags = apiThingTagsForTab(sharedJson, tab);
      const thingTags = await collectThingTagsFromDetailPages(page, tab);
      const inkByRowIndex = {};
      for (const row of dom.rows || []) {
        if (row.requiresLogo) {
          inkByRowIndex[row.index] = await measureRowInk(page, row.index);
        }
      }
      const expectedRows = (gradeSharedTabLogoUrlRecords(sharedJson, tab).placeCount) || 0;
      const sortProbe = await runSortButtonsProbe(page, {
        tab,
        viewport: viewport.label,
        dom,
        artifactPath,
      });
      const graded = gradeThingCardTabScan({
        tab,
        viewport: viewport.label,
        sortControls: dom.sortControls,
        sortControlMatches: dom.sortControlMatches,
        columnSortLabels: dom.columnSortLabels,
        sortButtons: sortProbe.sortButtons,
        filterTags: dom.filterTags,
        thingTags,
        apiThingTags,
        rows: dom.rows,
        expectedRows,
      }, inkByRowIndex);
      const cropPath = artifactPath(`thing-card-${tab}-${viewport.label}.png`);
      const tagCropPath = artifactPath(`thing-card-${tab}-${viewport.label}-tag-filters.png`);
      await screenshotTagFilterRow(page, tagCropPath);
      const panel = await page.$('[data-shared-live-tab], .logo-list, [data-trip-directory]');
      if (panel) {
        await panel.screenshot({ path: cropPath, type: 'png' });
        await disposeHandle(panel);
      } else {
        await page.screenshot({ path: cropPath, fullPage: false });
      }
      probes.push({
        tab,
        viewport: viewport.label,
        clicked,
        cropPath,
        tagCropPath,
        rowCount: graded.rowCount,
        sortControls: dom.sortControls,
        sortControlMatches: dom.sortControlMatches,
        columnSortLabels: dom.columnSortLabels,
        sortButtonsGate: sortProbe.sortButtonsGate,
        tagFilterParity: graded.tagFilterParity,
        failures: graded.failures,
        pass: graded.pass,
      });
    }
  }
  const summary = gradeThingCardHarnessResult({ tabs, probes });
  const sortControlsPresent = probes.some((p) => (p.sortControls || []).length > 0);
  return {
    pass: summary.pass,
    checkTHINGCARD: {
      tabs,
      probes,
      failOnSortControls: THING_CARD_FAIL_ON_SORT_CONTROLS,
      sortControlsPresent,
      failures: summary.failures,
      failReason: summary.pass ? null : (summary.failures[0]?.detail || 'thing_card_fail'),
    },
  };
}
