#!/usr/bin/env node
/** Staging doctor pass for verify-layout (no Vercel). */
import { VIEWPORTS, applyViewport } from './layout-measure.mjs';

export async function runVerifyLayoutDoctor(browser, { staging, sharedPath, redact }) {
  const reasons = [];
  let sha = '';
  try {
    const response = await fetch(`${staging}/api/version`, { signal: AbortSignal.timeout(20000) });
    if (response.status !== 200) reasons.push(`version-http-${response.status}`);
    const body = await response.json().catch(() => ({}));
    sha = String(body.sha || '').trim();
    if (!sha) reasons.push('version-sha-missing');
  } catch (error) {
    reasons.push(`version-error:${redact(error.message || error)}`);
  }
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    try {
      await applyViewport(page, viewport);
      const response = await page.goto(`${staging}/vacation-app.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await applyViewport(page, viewport);
      const status = response ? response.status() : 0;
      if (status >= 400) reasons.push(`page-${status}:/vacation-app.html`);
      const size = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
      if (size[0] !== viewport.width || size[1] !== viewport.height) reasons.push(`chromium-${viewport.id}-${size.join('x')}`);
      const stamp = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="timesyncher-build"]');
        return (meta && meta.getAttribute('content')) || document.documentElement.getAttribute('data-build-sha') || '';
      });
      if (!stamp) reasons.push(`stamp-missing:/vacation-app.html@${viewport.id}`);
      else if (sha && stamp.toLowerCase() !== sha.toLowerCase()) reasons.push(`stamp-mismatch:/vacation-app.html@${viewport.id}`);
    } catch (error) {
      reasons.push(`chromium-${viewport.id}:${redact(error.message || error)}`);
    } finally {
      await page.close();
    }
  }
  const page = await browser.newPage();
  try {
    await applyViewport(page, VIEWPORTS[1]);
    for (const pagePath of ['/', sharedPath()]) {
      const response = await page.goto(`${staging}${pagePath}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const status = response ? response.status() : 0;
      if (status >= 400) reasons.push(`page-${status}:${pagePath}`);
      const stamp = await page.evaluate(() => {
        const meta = document.querySelector('meta[name="timesyncher-build"]');
        return (meta && meta.getAttribute('content')) || document.documentElement.getAttribute('data-build-sha') || '';
      });
      if (!stamp) reasons.push(`stamp-missing:${pagePath}`);
      else if (sha && stamp.toLowerCase() !== sha.toLowerCase()) reasons.push(`stamp-mismatch:${pagePath}`);
    }
  } catch (error) {
    reasons.push(`pages:${redact(error.message || error)}`);
  } finally {
    await page.close();
  }
  return { ok: reasons.length === 0, sha, reasons };
}
