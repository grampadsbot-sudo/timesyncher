/** Register LAYOUT + VISUAL spine checks (keeps main.mjs under line cap). */
import { registerLayoutSpineChecks } from './shepherd-staging-smoke-layout-spine.mjs';
import { runVisualHarnessCheck } from './shepherd-staging-smoke-visual.mjs';
import { withBrowserPageSlot } from './shepherd-staging-smoke-browser-pool.mjs';

async function registerVisualSpineChecks(spineCtx) {
  const {
    runCheck,
    out,
    BASE,
    CHROME,
    sharedBrowser,
    registerBrowser,
    EXPECT_SHA,
    puppeteer,
    db,
    SHA7,
  } = spineCtx;

  await runCheck('VISUAL', async ({ setStage, registerBrowser: reg }) => {
    setStage('visual judge four customer states');
    const chromeVisual = sharedBrowser || await puppeteer.launch(CHROME);
    if (!sharedBrowser) reg(chromeVisual);
    return withBrowserPageSlot(chromeVisual, async (page) => {
      const visual = await runVisualHarnessCheck({
        page,
        db,
        BASE,
        SHA7,
        expectSha: EXPECT_SHA,
        setStage,
      });
      out.checkVISUAL = {
        pass: visual.pass,
        artifactDir: visual.artifactDir,
        specSource: visual.specSource,
        stageTimestamps: visual.stageTimestamps,
        summary: visual.verdictDoc.shots.map((s) => ({ id: s.id, pass: s.pass, failures: s.failures })),
      };
      return { pass: visual.pass, http: 200 };
    }).finally(async () => {
      if (!sharedBrowser) await chromeVisual.close().catch((err) => {
        out.browserCloseErrors = out.browserCloseErrors || [];
        out.browserCloseErrors.push(String(err?.message || err));
      });
    });
  }, { timeoutMs: 900000 });
}

export async function registerLayoutVisualSpineChecks(spineCtx) {
  await registerLayoutSpineChecks(spineCtx);
  await registerVisualSpineChecks(spineCtx);
}
