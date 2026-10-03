import {
  gradeLeafletProductMap,
  gradeMapBar,
} from './shepherd-staging-smoke-lib.mjs';
import {
  configureSharedUiMapHelpers,
  gotoSharedIntakePage,
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
    };
  }
  await gotoSharedIntakePage(page, intakeMapUrl);
  await new Promise((r) => setTimeout(r, 1500));
  const budgetCheck = await sharedBudgetTabCheck(page, sharedJson.budget || []);
  const budgetShot = artifactPath('shared-budget.png');
  if (budgetCheck.clicked) await page.screenshot({ path: budgetShot, fullPage: true });
  const failReason = budFailReason({ publicUrlAfterH, sharedJson, budgetCheck });
  const pass = !failReason;
  return {
    pass,
    checkBUD: {
      budgetCheck,
      budgetShot: budgetCheck.clicked ? budgetShot : null,
      apiBudgetLines: (sharedJson.budget || []).length,
      failReason,
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
    };
  }
  await gotoSharedIntakePage(page, intakeMapUrl);
  await new Promise((r) => setTimeout(r, 2000));
  const logoShot = artifactPath('shared-logo-chips.png');
  const logoCropsPath = '/opt/cursor/artifacts/logo-chips-crops.png';
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
    checkLOGO: {
      hotels: logoHotels,
      cars: logoCars,
      logoShot: (logoHotels.rows?.length || logoCars.rows?.length) ? logoShot : null,
      logoCropsPath: logoCropsWritten,
      sharedApiPlaces: (sharedJson.places || []).length,
      intakeShareUrl: intakeMapUrl,
      failReason: pass ? null : failReason,
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
