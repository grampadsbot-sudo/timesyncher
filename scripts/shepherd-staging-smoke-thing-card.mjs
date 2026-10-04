import { clickSharedTabByKeyword, gotoAndHydrateSharedIntakePage, intakeShareUrlFromPrep } from './shepherd-staging-smoke-shared-ui.mjs';
import { gradeSharedTabLogoUrlRecords } from './shepherd-staging-smoke-grader-lib.mjs';
import {
  SHARED_API_RETRY_INTERVAL_MS,
  SHARED_API_RETRY_TIMEOUT_MS,
} from './shepherd-staging-smoke-shared-ui-map.mjs';
import { LOGO_TAB_SETTLE_MS } from './shepherd-staging-smoke-logo-metrics.mjs';
import { measureLogoComFromPngBuffer } from './shepherd-staging-smoke-logo-metrics.mjs';
import {
  EVALUATE_THING_CARD_TAB_DOM_SOURCE,
  gradeThingCardHarnessResult,
  gradeThingCardTabScan,
  populatedThingCardTabs,
  rowInkGradeFromCom,
  THING_CARD_FAIL_ON_SORT_CONTROLS,
} from './shepherd-staging-smoke-thing-card-eval.mjs';

const THING_CARD_VIEWPORTS = [
  { width: 390, height: 844, label: '390' },
  { width: 1280, height: 800, label: '1280' },
];

async function evaluateTabDom(page) {
  return page.evaluate(`${EVALUATE_THING_CARD_TAB_DOM_SOURCE}; return evaluateThingCardTabDom();`);
}

async function measureRowInk(page, rowIndex) {
  const handle = await page.$(`[data-ts-thing-card-row-idx="${rowIndex}"] [data-ts-logo-chip], [data-ts-thing-card-row-idx="${rowIndex}"] img.tiny-logo`);
  if (!handle) return rowInkGradeFromCom({ error: 'chip_missing' });
  try {
    const cropBuf = await handle.screenshot({ type: 'png' });
    const com = await measureLogoComFromPngBuffer(cropBuf);
    return rowInkGradeFromCom(com);
  } finally {
    await handle.dispose().catch(() => 0);
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
      const inkByRowIndex = {};
      for (const row of dom.rows || []) {
        if (row.requiresLogo) {
          inkByRowIndex[row.index] = await measureRowInk(page, row.index);
        }
      }
      const expectedRows = (gradeSharedTabLogoUrlRecords(sharedJson, tab).placeCount) || 0;
      const graded = gradeThingCardTabScan({
        tab,
        viewport: viewport.label,
        sortControls: dom.sortControls,
        rows: dom.rows,
        expectedRows,
      }, inkByRowIndex);
      const cropPath = artifactPath(`thing-card-${tab}-${viewport.label}.png`);
      const panel = await page.$('[data-shared-live-tab], .logo-list, [data-trip-directory]');
      if (panel) {
        await panel.screenshot({ path: cropPath, type: 'png' });
        await panel.dispose().catch(() => 0);
      } else {
        await page.screenshot({ path: cropPath, fullPage: false });
      }
      probes.push({
        tab,
        viewport: viewport.label,
        clicked,
        cropPath,
        rowCount: graded.rowCount,
        sortControls: dom.sortControls,
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
