/** Register LAYOUT spine check (keeps main.mjs under line cap). */
import { runLayoutHarnessCheck } from './shepherd-staging-smoke-layout.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import { withBrowserPageSlot } from './shepherd-staging-smoke-browser-pool.mjs';

export async function registerLayoutSpineChecks(spineCtx) {
  const {
    runCheck,
    out,
    state,
    BASE,
    CHROME,
    sharedBrowser,
    registerBrowser,
    artifactPath,
    puppeteer,
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
}
