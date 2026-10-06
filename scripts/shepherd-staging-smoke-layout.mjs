import { mkdirSync } from 'node:fs';
import {
  clickSharedTabByKeyword,
  gotoAndHydrateSharedIntakePage,
} from './shepherd-staging-smoke-shared-ui.mjs';
import {
  SHARED_API_RETRY_INTERVAL_MS,
  SHARED_API_RETRY_TIMEOUT_MS,
  sharedSlugApiPathFromPageUrl,
} from './shepherd-staging-smoke-shared-ui-map.mjs';
import {
  evaluateLayoutRules,
  LAYOUT_RULE_APPLICABILITY,
  LAYOUT_VIEWPORTS,
} from './shepherd-staging-smoke-layout-eval.mjs';
import { probeSiteFullscreenControl, runLayoutDomEval } from './shepherd-staging-smoke-layout-dom.mjs';
import {
  layoutAppFailShareUrlBeforeApi,
  scanChatDomShareUrlVisible,
} from './shepherd-staging-smoke-layout-share-guard.mjs';
import { runLayoutNycHarnessBlock } from './shepherd-staging-smoke-layout-nyc.mjs';

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
  shareAppGuard,
}) {
  setStage?.(`layout ${pageKind} ${viewport.label} viewport`);
  await page.setViewport({ width: viewport.width, height: viewport.height });
  if (pageKind === 'chat') {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForChatAppReady(page);
    if (shareAppGuard?.shareSlug && shareAppGuard.customerShareUrlSeenMs == null) {
      const domVisible = await scanChatDomShareUrlVisible(page, shareAppGuard.shareSlug);
      if (domVisible) shareAppGuard.customerShareUrlSeenMs = Date.now();
    }
  } else {
    setStage?.(`layout shared ${viewport.label} hydrate`);
    const diagPath = artifactPath(`layout-shared-hydration-diag-${viewport.label}.json`);
    const hydrated = await gotoAndHydrateSharedIntakePage(page, url, {
      debugArtifactPath: diagPath,
      sharedApiRetryTimeoutMs: SHARED_API_RETRY_TIMEOUT_MS,
      sharedApiRetryIntervalMs: SHARED_API_RETRY_INTERVAL_MS,
    });
    if (hydrated.hydrationError) {
      const shot = artifactPath(`layout-shared-${viewport.label}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      const notFound404Urls = hydrated.notFound404Urls || [];
      const sharedApiPath = sharedSlugApiPathFromPageUrl(url) || '';
      const detail404 = notFound404Urls.length
        ? `${hydrated.hydrationError}; http404=${notFound404Urls.join(' | ')}${sharedApiPath ? `; expectedApi=${sharedApiPath}` : ''}`
        : hydrated.hydrationError;
      return {
        pageKind,
        viewport: viewport.label,
        pass: false,
        failures: [{
          selector: 'shared-hydration',
          rule: 'hydration',
          detail: detail404,
          viewport: { width: viewport.width, height: viewport.height },
          rects: {},
        }],
        screenshot: shot,
        hydrationDiagPath: hydrated.hydrationDiagPath || diagPath,
        domTabList: hydrated.domTabList || [],
        notFound404Urls,
        applicability: LAYOUT_RULE_APPLICABILITY,
      };
    }
    await clickSharedTabByKeyword(page, 'day-by-day');
    await new Promise((r) => setTimeout(r, 400));
    if (shareAppGuard?.sharedApiFirst200Ms != null) {
      const appRow = layoutAppFailShareUrlBeforeApi({
        customerShareUrlSeenMs: shareAppGuard.customerShareUrlSeenMs,
        sharedApiFirst200Ms: shareAppGuard.sharedApiFirst200Ms,
        shareSlug: shareAppGuard.shareSlug,
      });
      if (appRow) {
        const shot = artifactPath(`layout-shared-${viewport.label}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        return {
          pageKind,
          viewport: viewport.label,
          pass: false,
          failures: [{
            ...appRow,
            viewport: { width: viewport.width, height: viewport.height },
          }],
          screenshot: shot,
          shareUrlAppGuard: shareAppGuard,
          applicability: LAYOUT_RULE_APPLICABILITY,
        };
      }
    }
  }
  setStage?.(`layout ${pageKind} ${viewport.label} evaluate`);
  const result = await runLayoutDomEval(page, pageKind);
  if (pageKind === 'chat') {
    const fs = await probeSiteFullscreenControl(page);
    if (fs && !fs.skipped && fs.pass === false) {
      result.pass = false;
      result.failures = result.failures || [];
      result.failures.push({
        selector: '.site-pane',
        rule: 'site_fullscreen_control',
        detail: fs.detail,
        viewport: { width: viewport.width, height: viewport.height },
        rects: {},
      });
    }
  }
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
  shareAppGuard = null,
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
        shareAppGuard: shareAppGuard || null,
      });
      probes.push(row);
      if (!row.pass) pass = false;
    }
  }
  const layoutNyc = await runLayoutNycHarnessBlock({ page, sharedUrl, artifactPath, setStage });
  if (layoutNyc && !layoutNyc.pass) pass = false;
  const shareUrlTiming = shareAppGuard ? {
    customerShareUrlSeenMs: shareAppGuard.customerShareUrlSeenMs ?? null,
    sharedApiFirst200Ms: shareAppGuard.sharedApiFirst200Ms ?? null,
    shareSlug: shareAppGuard.shareSlug,
  } : null;
  return {
    pass,
    probes,
    applicability: LAYOUT_RULE_APPLICABILITY,
    shareUrlTiming,
    layoutNyc,
  };
}

export function summarizeLayoutFailures(probes) {
  const lines = [];
  for (const row of probes) {
    if (row.skipped) {
      lines.push(`${row.pageKind}: SKIPPED (${row.reason})`);
      continue;
    }
    const label = `${row.pageKind}-${row.viewportLabel || row.viewport?.innerWidth}`;
    if (row.pass) lines.push(`${label}: PASS`);
    else {
      lines.push(`${label}: FAIL (${row.failures?.length || 0})`);
      for (const f of row.failures || []) {
        lines.push(`  [${f.rule}] ${f.selector}: ${f.detail}`);
      }
    }
  }
  return lines.join('\n');
}

export function ensureLayoutArtifactDir(dir) {
  mkdirSync(dir, { recursive: true });
}
