import {
  budgetHardcodedHits,
  evaluateLeafletProductMapInPage,
  evaluateTripMapInPage,
} from './shepherd-staging-smoke-lib.mjs';

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

export async function mapSharedTripState(page, url) {
  const mapConsoleErrors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/map_center_unresolved|map_mount_failed|map_/.test(t)) mapConsoleErrors.push(t);
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 4000));
  await clickSharedTabByKeyword(page, 'plan');
  await page.waitForSelector('.leaflet-container', { timeout: 90000 }).catch((err) => {
    mapConsoleErrors.push(`leaflet_wait:${String(err?.message || err)}`);
  });
  await new Promise((r) => setTimeout(r, 2500));
  const productMapState = await page.evaluate(evaluateLeafletProductMapInPage);
  const mapState = await page.evaluate(evaluateTripMapInPage);
  return { mapState, productMapState, mapConsoleErrors };
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
