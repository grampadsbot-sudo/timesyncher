import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('/workspace/node_modules/puppeteer-core');
import { withConnectionClosedRetry } from './shepherd-staging-smoke-browser-pool.mjs';
import { inviteUiHits } from './shepherd-staging-smoke-helpers.mjs';
import {
  intakeShareUrlFromPrep,
  runSharedSiteBudgetCheck,
  runSharedSiteLogoCheck,
  runSharedSiteMapCheck,
} from './shepherd-staging-smoke-shared-ui.mjs';
import { createLogoStageTimestamps } from './shepherd-staging-smoke-logo-metrics.mjs';

const MAP_CHECK_TIMEOUT_MS = 120000;

async function runDedicatedSharedCheck(ctx, checkName, timeoutMs, runOnPage) {
  const { runCheck, out, CHROME, artifactPath, registerBrowser } = ctx;
  await runCheck(checkName, async ({ setStage }) => {
    setStage(`${checkName} dedicated browser`);
    const prep = ctx.state.mapLogoPrep || {};
    const chrome = await puppeteer.launch(CHROME);
    registerBrowser(chrome);
    try {
      const pageResult = await withConnectionClosedRetry(async () => {
        const page = await chrome.newPage();
        try {
          return await runOnPage({ page, prep, artifactPath, setStage });
        } finally {
          await page.close().catch((err) => {
            out.browserCloseErrors = out.browserCloseErrors || [];
            out.browserCloseErrors.push(String(err?.message || err));
          });
        }
      }, { retries: 1 });
      return pageResult;
    } finally {
      await chrome.close().catch((err) => {
        out.browserCloseErrors = out.browserCloseErrors || [];
        out.browserCloseErrors.push(String(err?.message || err));
      });
    }
  }, { timeoutMs });
}

/** MAP/BUD/LOGO each use a dedicated browser (one retry on connection closed). */
export async function runShepherdSmokeMapBudLogoChecks(ctx) {
  const { out } = ctx;

  await runDedicatedSharedCheck(ctx, 'MAP', MAP_CHECK_TIMEOUT_MS, async ({ page, prep, artifactPath }) => {
    const mapResult = await runSharedSiteMapCheck({ page, prep, artifactPath });
    out.checkMAP = {
      ...mapResult.checkMAP,
      sharedUiHits: inviteUiHits(mapResult.sharedHtml || ''),
      intakeShareUrl: intakeShareUrlFromPrep(prep),
      failReason: mapResult.failReason || null,
    };
    if (mapResult.appFail) {
      out.checkMAP.appFail = mapResult.appFail;
      return { pass: false, http: 200 };
    }
    return { pass: mapResult.pass, http: 200 };
  });

  await runDedicatedSharedCheck(ctx, 'BUD', 90000, async ({ page, prep, artifactPath }) => {
    const bud = await runSharedSiteBudgetCheck({ page, prep, artifactPath });
    out.checkBUD = bud.checkBUD;
    if (bud.appFail) {
      out.checkBUD.appFail = bud.appFail;
      return { pass: false, http: 200 };
    }
    return { pass: bud.pass, http: 200 };
  });

const LOGO_CHECK_TIMEOUT_MS = 90000;

  await runDedicatedSharedCheck(ctx, 'LOGO', LOGO_CHECK_TIMEOUT_MS, async ({ page, prep, artifactPath }) => {
    out.checkLOGO = { partial: true, stageTimestamps: createLogoStageTimestamps() };
    const logo = await runSharedSiteLogoCheck({
      page,
      prep,
      artifactPath,
      onPersist: (patch) => {
        Object.assign(out.checkLOGO, patch);
      },
    });
    out.checkLOGO = logo.checkLOGO;
    if (logo.appFail) {
      out.checkLOGO.appFail = logo.appFail;
      return { pass: false, http: 200 };
    }
    return { pass: logo.pass, http: 200 };
  });
}
