import {
  budgetHardcodedHits,
  evaluateLeafletProductMapInPage,
  evaluateTripMapInPage,
} from './shepherd-staging-smoke-lib.mjs';

export const SHARED_GOTO_TIMEOUT_MS = 60000;
export const SHARED_MAP_READY_WAIT_MS = 45000;
export const APP_MAP_READY_FAIL_MS = 10000;

export function configureSharedUiMapHelpers(_cfg) {
  /* BASE reserved for future shared URLs in map tab helpers */
}

export async function clickSharedTabByKeyword(page, keyword) {
  return page.evaluate((kw) => {
    function normalize(text) {
      return String(text || '')
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }
    const want = normalize(kw);
    const nodes = Array.from(document.querySelectorAll(
      'button, [role="tab"], a, [data-tab], [data-ts-tab]',
    ));
    for (const node of nodes) {
      const title = node.getAttribute('title') || '';
      const dataTab = node.getAttribute('data-tab') || node.getAttribute('data-ts-tab') || '';
      const combined = [node.textContent, title, dataTab].join(' ');
      if (normalize(combined).includes(want)) {
        node.click();
        return true;
      }
    }
    return false;
  }, keyword);
}

async function sharedTabPresent(page, keyword) {
  return page.evaluate((kw) => {
    function normalize(text) {
      return String(text || '')
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }
    const want = normalize(kw);
    const nodes = Array.from(document.querySelectorAll(
      'button, [role="tab"], a, [data-tab], [data-ts-tab]',
    ));
    return nodes.some((node) => {
      const title = node.getAttribute('title') || '';
      const dataTab = node.getAttribute('data-tab') || node.getAttribute('data-ts-tab') || '';
      const combined = [node.textContent, title, dataTab].join(' ');
      return normalize(combined).includes(want);
    });
  }, keyword);
}

export async function gotoSharedIntakePage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: SHARED_GOTO_TIMEOUT_MS });
}

export async function mapSharedTripState(page, url) {
  const mapConsoleErrors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/map_center_unresolved|map_mount_failed|map_/.test(t)) mapConsoleErrors.push(t);
  });

  const stageTimestamps = {
    networkidle2Skipped: true,
    gotoStartMs: Date.now(),
    gotoEndMs: null,
    networkidle2StartMs: null,
    networkidle2EndMs: null,
    mapReadyWaitStartMs: null,
    mapReadyWaitEndMs: null,
    leafletWaitStartMs: null,
    leafletWaitEndMs: null,
    hangingStage: null,
  };

  let gotoError = null;
  try {
    await gotoSharedIntakePage(page, url);
    stageTimestamps.gotoEndMs = Date.now();
  } catch (err) {
    stageTimestamps.gotoEndMs = Date.now();
    stageTimestamps.hangingStage = 'goto';
    gotoError = err;
    mapConsoleErrors.push(`goto:${String(err?.message || err)}`);
  }

  if (!gotoError) {
    await new Promise((r) => setTimeout(r, 1500));
    await clickSharedTabByKeyword(page, 'plan');
    stageTimestamps.mapReadyWaitStartMs = Date.now();
    stageTimestamps.leafletWaitStartMs = stageTimestamps.mapReadyWaitStartMs;
    try {
      await page.waitForFunction(() => {
        const el = document.querySelector(
          '.leaflet-container[data-ts-map-center], .mapboxgl-map[data-ts-map-center]',
        );
        if (el?.getAttribute('data-ts-map-center') && window.__tsTripMap) return true;
        const center = window.__tsTripMap?.center || window.__tsTripMap?.mapCenter;
        return Boolean(center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng)));
      }, { timeout: SHARED_MAP_READY_WAIT_MS });
      stageTimestamps.mapReadyWaitEndMs = Date.now();
      stageTimestamps.leafletWaitEndMs = stageTimestamps.mapReadyWaitEndMs;
    } catch (err) {
      stageTimestamps.mapReadyWaitEndMs = Date.now();
      stageTimestamps.leafletWaitEndMs = stageTimestamps.mapReadyWaitEndMs;
      stageTimestamps.hangingStage = 'map_ready_wait';
      mapConsoleErrors.push(`map_ready_wait:${String(err?.message || err)}`);
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  const mapReadyMs = stageTimestamps.gotoStartMs && stageTimestamps.mapReadyWaitEndMs
    ? stageTimestamps.mapReadyWaitEndMs - stageTimestamps.gotoStartMs
    : null;
  let appFail = null;
  if (Number.isFinite(mapReadyMs) && mapReadyMs > APP_MAP_READY_FAIL_MS && !stageTimestamps.hangingStage) {
    appFail = { reason: 'app_map_ready_over_10s', mapReadyMs };
  }

  const productMapState = await page.evaluate(evaluateLeafletProductMapInPage);
  const mapState = await page.evaluate(evaluateTripMapInPage);
  return {
    mapState,
    productMapState,
    mapConsoleErrors,
    stageTimestamps,
    mapReadyMs,
    appFail,
  };
}

export async function sharedBudgetTabCheck(page, budgetLines = []) {
  const clicked = await clickSharedTabByKeyword(page, 'budget');
  await new Promise((r) => setTimeout(r, 1500));
  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  const hardcoded = budgetHardcodedHits(bodyText, budgetLines);
  const tabPresent = await sharedTabPresent(page, 'budget');
  const pageErrors = await page.evaluate(() => ({
    mapError: !!document.querySelector('[data-ts-trip-map-error]'),
    unresolved: !!document.querySelector('[data-map-center-unresolved]'),
  }));
  return {
    tabPresent,
    clicked,
    hardcoded,
    pageErrors,
    bodySnippet: bodyText.slice(0, 400),
  };
}
