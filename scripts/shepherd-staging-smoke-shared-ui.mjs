import {
  gradeLeafletProductMap,
  gradeMapBar,
} from './shepherd-staging-smoke-lib.mjs';
import {
  configureSharedUiMapHelpers,
  gotoAndHydrateSharedIntakePage,
  gotoSharedIntakePage,
  listSharedDomTabs,
  mapSharedTripState,
  sharedBudgetTabCheck,
} from './shepherd-staging-smoke-shared-ui-map.mjs';
import {
  sharedLogoTabCheck,
  stitchLogoChipCropsPng,
} from './shepherd-staging-smoke-logo-metrics.mjs';

let BASE = 'https://vacation-staging.timesyncher.com';

export function configureSharedUiHelpers(cfg) {
  configureSharedUiMapHelpers(cfg);
  if (cfg?.BASE) BASE = cfg.BASE;
}

export function intakeShareUrlFromPrep(prep = {}) {
  const shareSlug = prep.shareSlug || '';
  if (shareSlug) return `${BASE}/shared/${shareSlug}/`;
  return prep.intakeShareUrl || '';
}

function logoPassFromTabs(logoHotels, logoCars) {
  return logoHotels.pass && logoCars.pass && logoHotels.clicked && logoCars.clicked;
}

function budFailReason({ publicUrlAfterH, sharedJson, budgetCheck }) {
  if (!publicUrlAfterH) return 'missing_public_url';
  if ((sharedJson.places || []).length < 1) return 'shared_api_no_places';
  if (!budgetCheck.tabPresent) return 'budget_tab_missing';
  if (!budgetCheck.clicked) return 'budget_tab_not_clicked';
  if (budgetCheck.hardcoded.length) return `budget_hardcoded:${budgetCheck.hardcoded.join('|')}`;
  if (budgetCheck.pageErrors?.mapError) return 'budget_page_map_error';
  return null;
}

function mapFailReason({ publicUrlAfterH, sharedJson, productMapGrade, mapCapture }) {
  if (!publicUrlAfterH) return 'missing_public_url';
  if ((sharedJson.places || []).length < 1) return 'shared_api_no_places';
  if (mapCapture.stageTimestamps?.hangingStage) return `hanging_stage:${mapCapture.stageTimestamps.hangingStage}`;
  if (!productMapGrade.pass) return 'product_map_grade_fail';
  return null;
}

export async function runSharedSiteMapCheck({ page, prep, artifactPath }) {
  const intakeMapUrl = intakeShareUrlFromPrep(prep);
  const sharedJson = prep.sharedApi?.json || {};
  const publicUrlAfterH = prep.publicUrlAfterH || '';
  if (!intakeMapUrl) {
    return {
      pass: false,
      failReason: 'no_intake_map_url',
      checkMAP: { intakeShareUrl: '', sharedApiPlaces: 0 },
      sharedHtml: '',
      appFail: null,
    };
  }
  const mapCapture = { mapUrl: intakeMapUrl, ...(await mapSharedTripState(page, intakeMapUrl)) };
  const mapShot = artifactPath('trip-map.png');
  await page.screenshot({ path: mapShot, fullPage: true });
  const sharedHtml = await page.content();
  const productMapGrade = gradeLeafletProductMap(mapCapture.productMapState, mapCapture.mapConsoleErrors);
  const mapGrade = gradeMapBar(mapCapture.mapState, mapCapture.mapConsoleErrors);
  const failReason = mapCapture.appFail?.reason
    || mapFailReason({ publicUrlAfterH, sharedJson, productMapGrade, mapCapture });
  const pass = !mapCapture.appFail
    && !mapCapture.stageTimestamps?.hangingStage
    && Boolean(publicUrlAfterH)
    && (sharedJson.places || []).length >= 1
    && productMapGrade.pass;
  return {
    pass,
    failReason,
    appFail: mapCapture.appFail,
    sharedHtml,
    checkMAP: {
      publicUrl: publicUrlAfterH,
      shareSlug: prep.shareSlug || '',
      intakeShareUrl: intakeMapUrl,
      sharedApiPlaces: (sharedJson.places || []).length,
      mapCapture,
      productMapGrade,
      mapGrade,
      mapShot,
      mapStageTimestamps: mapCapture.stageTimestamps,
      mapReadyMs: mapCapture.mapReadyMs,
    },
  };
}

export async function runSharedSiteBudgetCheck({ page, prep, artifactPath }) {
  const intakeMapUrl = intakeShareUrlFromPrep(prep);
  const sharedJson = prep.sharedApi?.json || {};
  const publicUrlAfterH = prep.publicUrlAfterH || '';
  if (!intakeMapUrl) {
    return {
      pass: false,
      checkBUD: { failReason: 'no_intake_map_url' },
      appFail: null,
    };
  }
  const hydration = await gotoAndHydrateSharedIntakePage(page, intakeMapUrl);
  const domTabList = hydration.domTabList || [];
  if (hydration.stageTimestamps?.hangingStage) {
    const budgetShot = artifactPath('shared-budget-hydration-fail.png');
    await page.screenshot({ path: budgetShot, fullPage: true });
    return {
      pass: false,
      appFail: null,
      checkBUD: {
        budgetCheck: { tabPresent: false, clicked: false, hardcoded: [], pageErrors: {}, bodySnippet: '' },
        budgetShot,
        apiBudgetLines: (sharedJson.budget || []).length,
        failReason: `hanging_stage:${hydration.stageTimestamps.hangingStage}`,
        domTabList,
        hydrationTimestamps: hydration.stageTimestamps,
      },
    };
  }
  const budgetCheck = await sharedBudgetTabCheck(page, sharedJson.budget || []);
  const budgetShot = artifactPath('shared-budget.png');
  await page.screenshot({ path: budgetShot, fullPage: true });
  let appFail = null;
  if (!budgetCheck.tabPresent) {
    appFail = {
      reason: 'app_budget_tab_missing',
      domTabList: await listSharedDomTabs(page),
    };
  }
  const failReason = appFail?.reason
    || budFailReason({ publicUrlAfterH, sharedJson, budgetCheck });
  const pass = !appFail && !failReason;
  return {
    pass,
    appFail,
    checkBUD: {
      budgetCheck,
      budgetShot,
      apiBudgetLines: (sharedJson.budget || []).length,
      failReason: pass ? null : (failReason || appFail?.reason),
      domTabList,
      hydrationTimestamps: hydration.stageTimestamps,
    },
  };
}

export async function runSharedSiteLogoCheck({ page, prep, artifactPath }) {
  const intakeMapUrl = intakeShareUrlFromPrep(prep);
  const sharedJson = prep.sharedApi?.json || {};
  if (!intakeMapUrl) {
    return {
      pass: false,
      checkLOGO: { failReason: 'no_intake_map_url' },
      appFail: null,
    };
  }
  const hydration = await gotoAndHydrateSharedIntakePage(page, intakeMapUrl);
  const domTabList = hydration.domTabList || [];
  const logoShot = artifactPath('shared-logo-chips.png');
  const logoCropsPath = '/opt/cursor/artifacts/logo-chips-crops.png';
  if (hydration.stageTimestamps?.hangingStage) {
    await page.screenshot({ path: logoShot, fullPage: true });
    return {
      pass: false,
      appFail: null,
      checkLOGO: {
        failReason: `hanging_stage:${hydration.stageTimestamps.hangingStage}`,
        domTabList,
        hydrationTimestamps: hydration.stageTimestamps,
        logoShot,
      },
    };
  }
  const hotelsTabPresent = domTabList.some((t) => /hotel/i.test(`${t.text} ${t.dataTab}`));
  const carsTabPresent = domTabList.some((t) => /car/i.test(`${t.text} ${t.dataTab}`));
  if (!hotelsTabPresent || !carsTabPresent) {
    await page.screenshot({ path: logoShot, fullPage: true });
    return {
      pass: false,
      appFail: {
        reason: 'app_logo_tabs_missing',
        domTabList: await listSharedDomTabs(page),
        missing: { hotels: !hotelsTabPresent, cars: !carsTabPresent },
      },
      checkLOGO: {
        failReason: 'app_logo_tabs_missing',
        domTabList,
        hydrationTimestamps: hydration.stageTimestamps,
        logoShot,
        sharedApiPlaces: (sharedJson.places || []).length,
        intakeShareUrl: intakeMapUrl,
      },
    };
  }
  const logoHotels = await sharedLogoTabCheck(page, 'hotels', sharedJson);
  const logoCars = await sharedLogoTabCheck(page, 'cars', sharedJson);
  if (logoHotels.clicked || logoCars.clicked) await page.screenshot({ path: logoShot, fullPage: true });
  const allCropBuffers = [...(logoHotels.cropBuffers || []), ...(logoCars.cropBuffers || [])];
  const logoCropsWritten = allCropBuffers.length
    ? await stitchLogoChipCropsPng(allCropBuffers, logoCropsPath)
    : null;
  const pass = logoPassFromTabs(logoHotels, logoCars);
  let failReason = null;
  if (!logoHotels.clicked) failReason = logoHotels.failReason || 'logo_hotels_tab_not_clicked';
  else if (!logoCars.clicked) failReason = logoCars.failReason || 'logo_cars_tab_not_clicked';
  else if (!logoHotels.pass) failReason = 'logo_hotels_grade_fail';
  else if (!logoCars.pass) failReason = 'logo_cars_grade_fail';
  return {
    pass,
    appFail: null,
    checkLOGO: {
      hotels: logoHotels,
      cars: logoCars,
      logoShot: (logoHotels.rows?.length || logoCars.rows?.length) ? logoShot : null,
      logoCropsPath: logoCropsWritten,
      sharedApiPlaces: (sharedJson.places || []).length,
      intakeShareUrl: intakeMapUrl,
      failReason: pass ? null : failReason,
      domTabList,
      hydrationTimestamps: hydration.stageTimestamps,
    },
  };
}

export async function runSharedSiteLogoBarChecks({
  page,
  mapUrl,
  sharedApi,
  artifactPath = (name) => `/opt/cursor/artifacts/${name}`,
  skipInitialGoto = false,
}) {
  if (mapUrl && !skipInitialGoto) {
    await gotoSharedIntakePage(page, mapUrl);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const sharedJson = sharedApi?.json || {};
  const logoShot = artifactPath('shared-logo-chips.png');
  const logoCropsPath = '/opt/cursor/artifacts/logo-chips-crops.png';
  const logoHotels = mapUrl
    ? await sharedLogoTabCheck(page, 'hotels', sharedJson)
    : { pass: false, rows: [], clicked: false, cssSuspects: [], cropBuffers: [], failReason: 'no_map_url' };
  const logoCars = mapUrl
    ? await sharedLogoTabCheck(page, 'cars', sharedJson)
    : { pass: false, rows: [], clicked: false, cssSuspects: [], cropBuffers: [], failReason: 'no_map_url' };
  if (logoHotels.clicked || logoCars.clicked) await page.screenshot({ path: logoShot, fullPage: true });
  const allCropBuffers = [...(logoHotels.cropBuffers || []), ...(logoCars.cropBuffers || [])];
  const logoCropsWritten = allCropBuffers.length
    ? await stitchLogoChipCropsPng(allCropBuffers, logoCropsPath)
    : null;
  const logoPass = logoPassFromTabs(logoHotels, logoCars);
  return {
    checkLOGO: {
      hotels: logoHotels,
      cars: logoCars,
      logoShot: (logoHotels.rows?.length || logoCars.rows?.length) ? logoShot : null,
      logoCropsPath: logoCropsWritten,
      sharedApiPlaces: (sharedJson.places || []).length,
      intakeShareUrl: mapUrl,
    },
    pass: logoPass,
  };
}
