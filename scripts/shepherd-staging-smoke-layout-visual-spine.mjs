/** Register LAYOUT + VISUAL spine checks (keeps main.mjs under line cap). */
import { runLayoutHarnessCheck } from './shepherd-staging-smoke-layout.mjs';
import { runVisualHarnessCheck } from './shepherd-staging-smoke-visual.mjs';
import { intakeShareSlug } from '/workspace/src/vacation/intake-shared-trip.mjs';
import { withBrowserPageSlot } from './shepherd-staging-smoke-browser-pool.mjs';

export async function registerLayoutVisualSpineChecks(spineCtx) {
  const {
    runCheck,
    out,
    state,
    BASE,
    CHROME,
    sharedBrowser,
    registerBrowser,
    EXPECT_SHA,
    artifactPath,
    puppeteer,
    db,
    SHA7,
  } = spineCtx;

  await runCheck('LAYOUT', async ({ setStage, registerBrowser: reg }) => {
    setStage('layout chat + shared viewports');
    const shareSlug = state.tripId ? intakeShareSlug(state.tripId) : '';
    const sharedUrl = shareSlug ? `${BASE}/shared/${shareSlug}/` : '';
    const chatUrl = `${BASE}/vacation-app.html?session=${encodeURIComponent(state.session)}`;
    const chromeLayout = sharedBrowser || await puppeteer.launch(CHROME);
    if (!sharedBrowser) reg(chromeLayout);
    return withBrowserPageSlot(chromeLayout, async (page) => {
      const layout = await runLayoutHarnessCheck({
        page,
        chatUrl,
        sharedUrl,
        artifactPath,
        setStage,
      });
      out.checkLAYOUT = layout;
      return { pass: layout.pass, http: 200 };
    }).finally(async () => {
      if (!sharedBrowser) await chromeLayout.close().catch((err) => {
        out.browserCloseErrors = out.browserCloseErrors || [];
        out.browserCloseErrors.push(String(err?.message || err));
      });
    });
  }, { timeoutMs: 180000 });

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
