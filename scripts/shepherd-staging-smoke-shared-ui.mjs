import {
  gradeLeafletProductMap,
  gradeMapBar,
} from './shepherd-staging-smoke-lib.mjs';
import {
  configureSharedUiMapHelpers,
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

function logoPassFromTabs(logoHotels, logoCars) {
  return logoHotels.pass && logoCars.pass && logoHotels.clicked && logoCars.clicked;
}

export async function runSharedSiteLogoBarChecks({
  page,
  mapUrl,
  sharedApi,
  artifactPath = (name) => `/opt/cursor/artifacts/${name}`,
  skipInitialGoto = false,
}) {
  if (mapUrl && !skipInitialGoto) {
    await page.goto(mapUrl, { waitUntil: 'networkidle2', timeout: 120000 });
    await new Promise((r) => setTimeout(r, 2500));
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

export async function runSharedSiteMapBudLogoChecks({
  page,
  mapUrl,
  publicUrlAfterH,
  shareSlug,
  sharedApi,
  artifactPath,
}) {
  let mapCapture = { mapUrl, mapState: null, productMapState: null, mapConsoleErrors: [] };
  const intakeMapUrl = shareSlug ? `${BASE}/shared/${shareSlug}/` : mapUrl;
  if (intakeMapUrl) mapCapture = { mapUrl: intakeMapUrl, ...(await mapSharedTripState(page, intakeMapUrl)) };
  const mapShot = artifactPath('trip-map.png');
  await page.screenshot({ path: mapShot, fullPage: true });
  const budgetShot = artifactPath('shared-budget.png');
  const sharedJson = sharedApi?.json || {};
  const budgetCheck = intakeMapUrl
    ? await sharedBudgetTabCheck(page, sharedJson.budget || [])
    : { tabPresent: false, clicked: false, hardcoded: [], pageErrors: {} };
  if (budgetCheck.clicked) await page.screenshot({ path: budgetShot, fullPage: true });

  const logoBar = intakeMapUrl
    ? await runSharedSiteLogoBarChecks({
      page,
      mapUrl: intakeMapUrl,
      sharedApi,
      artifactPath,
      skipInitialGoto: true,
    })
    : { checkLOGO: {}, pass: false };

  const sharedHtml = await page.content();
  const productMapGrade = gradeLeafletProductMap(mapCapture.productMapState, mapCapture.mapConsoleErrors);
  const mapGrade = gradeMapBar(mapCapture.mapState, mapCapture.mapConsoleErrors);
  const placesOk = (sharedJson.places || []).length >= 1;
  const budPass = Boolean(publicUrlAfterH) && placesOk && budgetCheck.tabPresent && budgetCheck.clicked
    && budgetCheck.hardcoded.length === 0 && !budgetCheck.pageErrors?.mapError;
  const logoPass = logoBar.pass;
  const mapPass = Boolean(publicUrlAfterH) && placesOk && productMapGrade.pass;
  return {
    mapShot,
    budgetShot: budgetCheck.clicked ? budgetShot : null,
    logoShot: logoBar.checkLOGO?.logoShot || null,
    sharedHtml,
    checkMAP: {
      publicUrl: publicUrlAfterH,
      shareSlug,
      intakeShareUrl: intakeMapUrl,
      sharedApiPlaces: (sharedJson.places || []).length,
      mapCapture,
      productMapGrade,
      mapGrade,
      mapShot,
    },
    checkBUD: {
      budgetCheck,
      budgetShot: budgetCheck.clicked ? budgetShot : null,
      apiBudgetLines: (sharedJson.budget || []).length,
    },
    checkLOGO: logoBar.checkLOGO,
    checks: { MAP: mapPass ? 'PASS' : 'FAIL', BUD: budPass ? 'PASS' : 'FAIL', LOGO: logoPass ? 'PASS' : 'FAIL' },
  };
}
