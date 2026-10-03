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
  clickSharedTabByKeyword,
  sharedIntakeTabShellReadyInBrowser,
  waitForSharedIntakeTabShellReady,
  APP_MAP_READY_FAIL_MS,
} from './shepherd-staging-smoke-shared-ui-map.mjs';

export {
  clickSharedTabByKeyword,
  gotoAndHydrateSharedIntakePage,
  gotoSharedIntakePage,
  listSharedDomTabs,
  sharedIntakeTabShellReadyInBrowser,
  waitForSharedIntakeTabShellReady,
};
import {
  createLogoStageTimestamps,
  pickSlowLogoStage,
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
  const carsPlaces = Number(logoCars.logoUrlEvidence?.placeCount) || 0;
  const carsHay = JSON.stringify(logoCars.logoUrlEvidence?.records || []);
  const hertzRow = /hertz/i.test(carsHay);
  return logoHotels.pass && logoCars.pass && logoHotels.clicked && logoCars.clicked
    && carsPlaces >= 1 && hertzRow;
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

export async function runSharedSiteLogoCheck({ page, prep, artifactPath, onPersist } = {}) {
  const intakeMapUrl = intakeShareUrlFromPrep(prep);
  const sharedJson = prep.sharedApi?.json || {};
  const stageTimestamps = createLogoStageTimestamps();
  const persist = (patch) => {
    onPersist?.({ stageTimestamps, ...patch });
  };
  persist({ partial: true, failReason: null });

  if (!intakeMapUrl) {
    return {
      pass: false,
      checkLOGO: { failReason: 'no_intake_map_url', stageTimestamps },
      appFail: null,
    };
  }
  const logoShot = artifactPath('shared-logo-chips.png');
  const logoCropsPath = '/opt/cursor/artifacts/logo-chips-crops.png';

  stageTimestamps.gotoStartMs = Date.now();
  const hydration = await gotoAndHydrateSharedIntakePage(page, intakeMapUrl);
  stageTimestamps.gotoEndMs = hydration.stageTimestamps?.gotoEndMs || Date.now();
  stageTimestamps.hydrationWaitStartMs = hydration.stageTimestamps?.mapReadyWaitStartMs ?? null;
  stageTimestamps.hydrationWaitEndMs = hydration.stageTimestamps?.mapReadyWaitEndMs ?? null;
  if (hydration.stageTimestamps?.hangingStage) {
    stageTimestamps.hangingStage = hydration.stageTimestamps.hangingStage;
  }
  persist({ hydrationTimestamps: hydration.stageTimestamps, domTabList: hydration.domTabList });

  const domTabList = hydration.domTabList || [];
  if (hydration.stageTimestamps?.hangingStage) {
    await page.screenshot({ path: logoShot, fullPage: true });
    persist({ failReason: `hanging_stage:${hydration.stageTimestamps.hangingStage}`, logoShot });
    return {
      pass: false,
      appFail: null,
      checkLOGO: {
        failReason: `hanging_stage:${hydration.stageTimestamps.hangingStage}`,
        domTabList,
        hydrationTimestamps: hydration.stageTimestamps,
        stageTimestamps,
        logoShot,
        slowStage: pickSlowLogoStage(stageTimestamps),
      },
    };
  }

  const tabsReadyAt = Date.now();
  stageTimestamps.logoTabsReadyMs = tabsReadyAt;
  const hydrationEnd = stageTimestamps.hydrationWaitEndMs || stageTimestamps.gotoEndMs;
  stageTimestamps.logoTabsReadyFromHydrationMs = Number.isFinite(hydrationEnd)
    ? tabsReadyAt - hydrationEnd
    : null;
  const hotelsTabPresent = domTabList.some((t) => /hotel/i.test(`${t.text} ${t.dataTab}`));
  const carsTabPresent = domTabList.some((t) => /car/i.test(`${t.text} ${t.dataTab}`));
  if (!hotelsTabPresent || !carsTabPresent) {
    await page.screenshot({ path: logoShot, fullPage: true });
    persist({ failReason: 'app_logo_tabs_missing', logoShot, domTabList });
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
        stageTimestamps,
        logoShot,
        sharedApiPlaces: (sharedJson.places || []).length,
        intakeShareUrl: intakeMapUrl,
        slowStage: pickSlowLogoStage(stageTimestamps),
      },
    };
  }
  if (
    Number.isFinite(stageTimestamps.logoTabsReadyFromHydrationMs)
    && stageTimestamps.logoTabsReadyFromHydrationMs > APP_MAP_READY_FAIL_MS
  ) {
    await page.screenshot({ path: logoShot, fullPage: true });
    const appFail = {
      reason: 'app_logo_tabs_over_10s',
      logoTabsReadyFromHydrationMs: stageTimestamps.logoTabsReadyFromHydrationMs,
    };
    persist({ appFail, failReason: appFail.reason, logoShot });
    return {
      pass: false,
      appFail,
      checkLOGO: {
        failReason: appFail.reason,
        domTabList,
        stageTimestamps,
        logoShot,
        sharedApiPlaces: (sharedJson.places || []).length,
        intakeShareUrl: intakeMapUrl,
        slowStage: pickSlowLogoStage(stageTimestamps),
      },
    };
  }

  const logoHotels = await sharedLogoTabCheck(page, 'hotels', sharedJson, {
    stageTimestamps,
    onPersist: (p) => persist(p),
  });
  persist({ hotels: logoHotels });

  const logoCars = await sharedLogoTabCheck(page, 'cars', sharedJson, {
    stageTimestamps,
    onPersist: (p) => persist(p),
  });
  persist({ cars: logoCars });

  if (logoHotels.clicked || logoCars.clicked) await page.screenshot({ path: logoShot, fullPage: true });
  const allCropBuffers = [...(logoHotels.cropBuffers || []), ...(logoCars.cropBuffers || [])];
  stageTimestamps.cropStitchStartMs = Date.now();
  const logoCropsWritten = allCropBuffers.length
    ? await stitchLogoChipCropsPng(allCropBuffers, logoCropsPath)
    : null;
  stageTimestamps.cropStitchEndMs = Date.now();
  const slowStage = pickSlowLogoStage(stageTimestamps);
  if (slowStage) stageTimestamps.slowStage = slowStage.name;

  const pass = logoPassFromTabs(logoHotels, logoCars);
  let failReason = null;
  if (!logoHotels.clicked) failReason = logoHotels.failReason || 'logo_hotels_tab_not_clicked';
  else if (!logoCars.clicked) failReason = logoCars.failReason || 'logo_cars_tab_not_clicked';
  else if (!logoHotels.pass) failReason = 'logo_hotels_grade_fail';
  else if (!logoCars.pass) failReason = 'logo_cars_grade_fail';

  const checkLOGO = {
    hotels: logoHotels,
    cars: logoCars,
    logoShot: (logoHotels.rows?.length || logoCars.rows?.length) ? logoShot : null,
    logoCropsPath: logoCropsWritten,
    sharedApiPlaces: (sharedJson.places || []).length,
    intakeShareUrl: intakeMapUrl,
    failReason: pass ? null : failReason,
    domTabList,
    hydrationTimestamps: hydration.stageTimestamps,
    stageTimestamps,
    slowStage,
    partial: false,
  };
  persist(checkLOGO);
  return {
    pass,
    appFail: null,
    checkLOGO,
  };
}
