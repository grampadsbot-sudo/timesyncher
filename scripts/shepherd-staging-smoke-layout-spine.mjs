/** Register LAYOUT spine check (keeps main.mjs under line cap). */
import { runLayoutHarnessCheck } from './shepherd-staging-smoke-layout.mjs';
import { intakeShareSlug } from '../src/vacation/intake-shared-trip.mjs';
import { withBrowserPageSlot } from './shepherd-staging-smoke-browser-pool.mjs';
import {
  earliestCustomerShareUrlSeenMs,
} from './shepherd-staging-smoke-layout-share-guard.mjs';

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
    db,
  } = spineCtx;

  await runCheck('LAYOUT', async ({ setStage, registerBrowser: reg }) => {
    setStage('layout chat + shared viewports (after share publish)');
    const prep = state.mapLogoPrep || {};
    if (!prep.shareSlug || prep.sharedApi?.status !== 200) {
      out.checkLAYOUT = {
        pass: false,
        probes: [{ pageKind: 'shared', skipped: true, reason: 'share_not_published_before_layout' }],
      };
      return {
        pass: false,
        harnessError: true,
        harnessMessage: 'LAYOUT shared probe requires published share (run after prepareMapLogoIntakeShare)',
        http: prep.sharedApi?.status || 0,
      };
    }
    const shareSlug = prep.shareSlug || (state.tripId ? intakeShareSlug(state.tripId) : '');
    const sharedUrl = prep.intakeShareUrl || (shareSlug ? `${BASE}/shared/${shareSlug}/` : '');
    const chatUrl = `${BASE}/vacation-app.html?session=${encodeURIComponent(state.session)}`;
    const transcriptMs = await earliestCustomerShareUrlSeenMs(db, state.customerId, shareSlug);
    const customerShareUrlSeenMs = transcriptMs;
    const chromeLayout = sharedBrowser || await puppeteer.launch(CHROME);
    if (!sharedBrowser) reg(chromeLayout);
    return withBrowserPageSlot(chromeLayout, async (page) => {
      const layout = await runLayoutHarnessCheck({
        page,
        chatUrl,
        sharedUrl,
        artifactPath,
        setStage,
        shareAppGuard: {
          shareSlug,
          sharedApiFirst200Ms: prep.sharedApiFirst200Ms ?? null,
          customerShareUrlSeenMs,
        },
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
