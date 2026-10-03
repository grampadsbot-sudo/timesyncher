import { gotoAndHydrateSharedIntakePage } from './shepherd-staging-smoke-shared-ui-map.mjs';
import {
  evaluateLayoutRules,
  LAYOUT_RULE_APPLICABILITY,
  LAYOUT_VIEWPORTS,
  evaluateLayoutRules,
} from './shepherd-staging-smoke-layout-eval.mjs';

async function waitForChatAppReady(page) {
  await page.waitForFunction(() => {
    const ta = document.querySelector('#messageText, textarea[name="message"]');
    const msg = document.querySelector('#messages');
    return Boolean(ta && msg && msg.children.length >= 1);
  }, { timeout: 90000 });
}

async function runLayoutProbeOnPage(page, {
  pageKind,
  url,
  viewport,
  artifactPath,
  setStage,
}) {
  setStage?.(`layout ${pageKind} ${viewport.label} viewport`);
  await page.setViewport({ width: viewport.width, height: viewport.height });
  if (pageKind === 'chat') {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForChatAppReady(page);
  } else {
    setStage?.(`layout shared ${viewport.label} hydrate`);
    const hydrated = await gotoAndHydrateSharedIntakePage(page, url);
    if (hydrated.hydrationError) {
      const shot = artifactPath(`layout-shared-${viewport.label}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      return {
        pageKind,
        viewport: viewport.label,
        pass: false,
        failures: [{
          selector: 'shared-hydration',
          rule: 'hydration',
          detail: hydrated.hydrationError,
          viewport: { width: viewport.width, height: viewport.height },
          rects: {},
        }],
        screenshot: shot,
        applicability: LAYOUT_RULE_APPLICABILITY,
      };
    }
  }
  setStage?.(`layout ${pageKind} ${viewport.label} evaluate`);
  const evalSrc = evaluateLayoutRules.toString();
  const result = await page.evaluate(new Function('pageKind', `return (${evalSrc})(pageKind)`), pageKind);
  const shot = artifactPath(`layout-${pageKind}-${viewport.label}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  return {
    ...result,
    viewportLabel: viewport.label,
    screenshot: shot,
    applicability: LAYOUT_RULE_APPLICABILITY,
  };
}

export async function runLayoutHarnessCheck({
  page,
  chatUrl,
  sharedUrl,
  artifactPath,
  setStage,
}) {
  const probes = [];
  let pass = true;
  for (const pageKind of ['chat', 'shared']) {
    const url = pageKind === 'chat' ? chatUrl : sharedUrl;
    if (!url) {
      probes.push({ pageKind, skipped: true, reason: 'missing_url' });
      pass = false;
      continue;
    }
    for (const viewport of LAYOUT_VIEWPORTS) {
      const row = await runLayoutProbeOnPage(page, {
        pageKind,
        url,
        viewport,
        artifactPath,
        setStage,
      });
      probes.push(row);
      if (!row.pass) pass = false;
    }
  }
  return { pass, probes, applicability: LAYOUT_RULE_APPLICABILITY };
}

