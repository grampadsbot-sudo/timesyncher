import {
  budgetHardcodedHits,
  evaluateLeafletProductMapInPage,
  evaluateTripMapInPage,
} from './shepherd-staging-smoke-lib.mjs';
import { writeFileSync } from 'node:fs';

export const SHARED_GOTO_TIMEOUT_MS = 60000;
export const SHARED_MAP_READY_WAIT_MS = 45000;
export const APP_MAP_READY_FAIL_MS = 10000;
export const SHARED_API_RETRY_TIMEOUT_MS = 45000;
export const SHARED_API_RETRY_INTERVAL_MS = 750;

export function sharedSlugApiPathFromPageUrl(url = '') {
  const match = String(url).match(/\/shared\/([^/?#]+)/i);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]).replace(/\/+$/, '');
  return `/api/shared/${encodeURIComponent(slug)}/`;
}

export async function waitForSharedSlugApiReady(page, pageUrl, opts = {}) {
  const apiPath = sharedSlugApiPathFromPageUrl(pageUrl);
  if (!apiPath) return { ok: true, status: 200, skipped: true };
  const timeoutMs = Number(opts.timeoutMs) || SHARED_API_RETRY_TIMEOUT_MS;
  const intervalMs = Number(opts.intervalMs) || SHARED_API_RETRY_INTERVAL_MS;
  const fetchStatus = opts.fetchStatus;
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    const status = fetchStatus
      ? await fetchStatus(apiPath)
      : await page.evaluate(async (path) => {
        const res = await fetch(path, { credentials: 'same-origin' });
        return res.status;
      }, apiPath);
    lastStatus = status;
    if (status === 200) return { ok: true, status };
    const hydrated = await page.evaluate(sharedIntakeTabShellReadyInBrowser).catch(() => false);
    if (hydrated) return { ok: true, status, hydratedDespiteApi: true };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { ok: false, status: lastStatus, timedOut: true };
}

function attachSharedHydrationDiagnostics(page) {
  const diag = { consoleErrors: [], failedRequests: [], notFound404Urls: [], timingTrace: [] };
  const t0 = Date.now();
  const mark = (event, detail = null) => {
    diag.timingTrace.push({ event, atMs: Date.now() - t0, detail });
  };
  const onConsole = (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') diag.consoleErrors.push({ type, text: msg.text() });
  };
  const onRequestFailed = (req) => {
    diag.failedRequests.push({
      url: req.url(),
      method: req.method(),
      failure: req.failure()?.errorText || 'request_failed',
    });
  };
  const onResponse = (res) => {
    if (res.status() === 404) diag.notFound404Urls.push(res.url());
  };
  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);
  return {
    diag,
    mark,
    detach() {
      page.off('console', onConsole);
      page.off('requestfailed', onRequestFailed);
      page.off('response', onResponse);
    },
  };
}

/** In-page readiness for shared intake tab shell (same selectors as listSharedDomTabs / LOGO check). */
function sharedIntakeTabShellReadyInBrowser() {
  const bodyText = document.body?.innerText || '';
  if (!/Day-by-Day/i.test(bodyText)) return false;
  const norm = (raw) => String(raw || '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const nodes = Array.from(document.querySelectorAll(
    'button, [role="tab"], a, [data-tab], [data-ts-tab]',
  ));
  const labels = nodes.map((node) => {
    const title = node.getAttribute('title') || '';
    const dataTab = node.getAttribute('data-tab') || node.getAttribute('data-ts-tab') || '';
    return norm([node.textContent, title, dataTab].join(' '));
  }).filter(Boolean);
  const dayByDay = labels.some((label) => label.includes('day-by-day') || label.includes('day by day'));
  const hotelOrBudget = labels.some((label) => label.includes('hotel') || label.includes('budget'));
  return dayByDay && hotelOrBudget;
}

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

export async function listSharedDomTabs(page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll(
      'button, [role="tab"], a, [data-tab], [data-ts-tab]',
    ));
    return nodes.map((node) => ({
      tag: node.tagName,
      role: node.getAttribute('role') || '',
      text: String(node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      dataTab: node.getAttribute('data-tab') || node.getAttribute('data-ts-tab') || '',
    })).filter((row) => row.text || row.dataTab);
  });
}

async function waitForSharedMapReadyHook(page, stageTimestamps) {
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
    throw err;
  }
}

async function waitForSharedIntakeTabShellReady(page, stageTimestamps) {
  await new Promise((r) => setTimeout(r, 800));
  stageTimestamps.mapReadyWaitStartMs = Date.now();
  stageTimestamps.leafletWaitStartMs = stageTimestamps.mapReadyWaitStartMs;
  const timeout = SHARED_MAP_READY_WAIT_MS;
  try {
    await page.waitForFunction(sharedIntakeTabShellReadyInBrowser, { timeout });
    stageTimestamps.mapReadyWaitEndMs = Date.now();
    stageTimestamps.leafletWaitEndMs = stageTimestamps.mapReadyWaitEndMs;
  } catch (err) {
    stageTimestamps.mapReadyWaitEndMs = Date.now();
    stageTimestamps.leafletWaitEndMs = stageTimestamps.mapReadyWaitEndMs;
    const readyNow = await page.evaluate(sharedIntakeTabShellReadyInBrowser);
    if (readyNow) return;
    stageTimestamps.hangingStage = 'shared_tab_shell';
    throw err;
  }
}

async function waitForSharedTabShellHydration(page, stageTimestamps) {
  await waitForSharedIntakeTabShellReady(page, stageTimestamps);
}

async function gotoAndHydrateSharedIntakePageOnce(page, url, opts = {}) {
  const { debugArtifactPath = null } = opts;
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
  const diagSession = attachSharedHydrationDiagnostics(page);
  diagSession.mark('goto_start');
  await gotoSharedIntakePage(page, url);
  stageTimestamps.gotoEndMs = Date.now();
  diagSession.mark('goto_end');
  const apiWait = await waitForSharedSlugApiReady(page, url, opts);
  stageTimestamps.sharedApiStatus = apiWait.status;
  stageTimestamps.sharedApiHydratedDespite404 = apiWait.hydratedDespiteApi === true;
  if (!apiWait.ok && !apiWait.hydratedDespiteApi) {
    diagSession.mark('shared_api_wait_timeout', String(apiWait.status || 'unknown'));
    const domTabList = await listSharedDomTabs(page);
    const notFound404Urls = [...(diagSession.diag.notFound404Urls || [])];
    const hydrationError = `shared_api_404_retry_timeout (lastStatus=${apiWait.status || 0})`;
    const payload = {
      url,
      hydrationError,
      stageTimestamps,
      domTabList,
      notFound404Urls,
      diagnostics: diagSession.diag,
      sharedApiWait: apiWait,
    };
    if (debugArtifactPath) writeFileSync(debugArtifactPath, `${JSON.stringify(payload, null, 2)}\n`);
    diagSession.detach();
    return {
      stageTimestamps,
      domTabList,
      notFound404Urls,
      hydrationError,
      hydrationDiagPath: debugArtifactPath,
      sharedApiWait: apiWait,
    };
  }
  try {
    diagSession.mark('hydration_wait_start');
    await waitForSharedTabShellHydration(page, stageTimestamps);
    diagSession.mark('hydration_wait_end');
  } catch (err) {
    diagSession.mark('hydration_timeout', String(err?.message || err));
    const domTabList = await listSharedDomTabs(page);
    const notFound404Urls = [...(diagSession.diag.notFound404Urls || [])];
    const payload = {
      url,
      hydrationError: String(err?.message || err),
      stageTimestamps,
      domTabList,
      notFound404Urls,
      diagnostics: diagSession.diag,
      sharedApiWait: apiWait,
    };
    if (debugArtifactPath) writeFileSync(debugArtifactPath, `${JSON.stringify(payload, null, 2)}\n`);
    diagSession.detach();
    return {
      stageTimestamps,
      domTabList,
      notFound404Urls,
      hydrationError: String(err?.message || err),
      hydrationDiagPath: debugArtifactPath,
      sharedApiWait: apiWait,
    };
  }
  diagSession.detach();
  await new Promise((r) => setTimeout(r, 800));
  const domTabList = await listSharedDomTabs(page);
  return {
    stageTimestamps,
    domTabList,
    hydrationError: null,
    notFound404Urls: [],
    sharedApiWait: apiWait,
  };
}

export async function gotoAndHydrateSharedIntakePage(page, url, opts = {}) {
  const retryTimeoutMs = Number(opts.sharedApiRetryTimeoutMs) || SHARED_API_RETRY_TIMEOUT_MS;
  const intervalMs = Number(opts.sharedApiRetryIntervalMs) || SHARED_API_RETRY_INTERVAL_MS;
  const deadline = Date.now() + retryTimeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const remaining = Math.max(1000, deadline - Date.now());
    last = await gotoAndHydrateSharedIntakePageOnce(page, url, {
      ...opts,
      timeoutMs: remaining,
      intervalMs,
    });
    if (!last.hydrationError) return last;
    const apiPath = sharedSlugApiPathFromPageUrl(url);
    const api404 = apiPath && (last.notFound404Urls || []).some((u) => u.includes(apiPath));
    const apiTimedOut = last.hydrationError?.includes('shared_api_404_retry_timeout');
    if (!api404 && !apiTimedOut) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last || { hydrationError: 'shared_api_404_retry_timeout', domTabList: [], notFound404Urls: [] };
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
    try {
      await waitForSharedMapReadyHook(page, stageTimestamps);
    } catch (err) {
      stageTimestamps.hangingStage = stageTimestamps.hangingStage || 'map_ready_wait';
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

export async function sharedBudgetTabCheck(page, budgetLines = [], shared = null) {
  const clicked = await clickSharedTabByKeyword(page, 'budget');
  await new Promise((r) => setTimeout(r, 1500));
  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  const hardcoded = budgetHardcodedHits(bodyText, budgetLines, shared);
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
