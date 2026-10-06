import { evaluateLayoutRules } from './shepherd-staging-smoke-layout-eval.mjs';
import { composerSendHelperSource, evaluateComposerControlsOnly } from './shepherd-staging-smoke-composer-send.mjs';
import { horizontalOverflowHelperSource } from './shepherd-staging-smoke-layout-overflow.mjs';

export async function runLayoutDomEval(page, pageKind) {
  const body = `${composerSendHelperSource()};\n${horizontalOverflowHelperSource()};\n${evaluateComposerControlsOnly.toString()};\nreturn (${evaluateLayoutRules.toString()})(pageKind);`;
  return page.evaluate(new Function('pageKind', body), pageKind);
}

export async function probeSiteFullscreenControl(page) {
  return page.evaluate(() => {
    const sitePane = document.querySelector('.site-pane');
    const iframe = sitePane?.querySelector('iframe');
    if (!sitePane || !iframe || !String(iframe.getAttribute('src') || '').trim()) {
      return { skipped: true };
    }
    const btn = sitePane.querySelector('[data-ts-site-fullscreen], [data-site-fullscreen], button[aria-label*="full" i], button[title*="full" i]')
      || document.querySelector('[data-ts-site-fullscreen], button[aria-label*="full screen" i]');
    if (!btn) {
      return { pass: false, detail: 'full-screen control missing in site area' };
    }
    const vh = window.innerHeight;
    const beforeH = sitePane.getBoundingClientRect().height;
    btn.click();
    const expandedH = sitePane.getBoundingClientRect().height;
    btn.click();
    if (expandedH < Math.max(beforeH * 1.2, vh * 0.75)) {
      return { pass: false, detail: `full-screen control did not expand site pane (before=${beforeH.toFixed(0)} after=${expandedH.toFixed(0)} vh=${vh})` };
    }
    return { pass: true };
  });
}

export function layoutFactsForPrompt(layoutResult) {
  if (!layoutResult) return 'LAYOUT DOM ground truth: not evaluated';
  if (layoutResult.pass) return 'LAYOUT DOM ground truth: PASS (no violations for this page kind at this viewport).';
  const lines = (layoutResult.failures || []).map((f) => `- [${f.rule}] ${f.selector}: ${f.detail}`);
  return `LAYOUT DOM ground truth: FAIL\n${lines.join('\n')}\nTreat any listed DOM violation as FAIL even if the screenshot looks acceptable.`;
}
