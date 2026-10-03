#!/usr/bin/env node
/** Shared-trip and signup drives for verify-layout. */
import { VIEWPORTS, applyViewport, measurePage } from './layout-measure.mjs';
import { clickTab } from './verify-layout-shared-helpers.mjs';

export async function driveVerifyLayoutTrip(ctx) {
  const {
    browser, shotDir, rows, measurements, staging, sharedPath, redact, sleep,
    loadSpec, shoot, grade, finishRow, writeFile, path, TABS,
  } = ctx;
  const url = `${staging}${sharedPath()}`;
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    try {
      await applyViewport(page, viewport);
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await applyViewport(page, viewport);
      const status = response ? response.status() : 0;
      if (status >= 400) throw new Error(`shared page HTTP ${status}`);
      let tabRowReady = true;
      try {
        await page.waitForFunction(() => {
          const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();
          return [...document.querySelectorAll('button, [role="tab"]')].some((el) => {
            const text = norm(el.innerText);
            const aria = norm(el.getAttribute('aria-label'));
            return aria === 'Day-by-Day' || text === 'Day-by-Day' || (text.endsWith('Day-by-Day') && text.length <= 'Day-by-Day'.length + 3);
          });
        }, { timeout: 25000 });
        await sleep(1200);
      } catch (waitErr) {
        tabRowReady = false;
        void waitErr;
      }
      const shellSpec = loadSpec('trip');
      const shell = await measurePage(page, { kind: 'trip', state: 'trip', specMissing: shellSpec.specMissing });
      shell.specMissing = shellSpec.specMissing;
      if (!tabRowReady) shell.tabRowWait = 'timeout';
      const shellShot = await shoot(page, shotDir, 'shared-trip', 'shell', viewport.id);
      const shellJudge = await grade(shellShot.viewportPath, shellSpec.specText);
      await writeFile(path.join(shotDir, `${shellShot.stem}.json`), JSON.stringify({ measurement: shell, judge: shellJudge }, null, 2));
      rows.push(finishRow({
        feature: 'shared-trip',
        sub: 'shell',
        viewport: viewport.id,
        measurement: shell,
        judge: shellJudge,
        screenshot: path.relative(path.dirname(shotDir), shellShot.viewportPath),
      }));
      measurements.push({ feature: 'shared-trip', sub: 'shell', viewport: viewport.id, measurement: shell, judge: shellJudge });
      for (const [sub, label] of TABS) {
        const clicked = await clickTab(page, label, sleep);
        const spec = loadSpec(sub);
        const measurement = await measurePage(page, {
          kind: 'trip',
          state: sub,
          tabLabel: label,
          specMissing: spec.specMissing,
        });
        measurement.specMissing = spec.specMissing;
        if (!clicked) measurement.tabs = [{ name: label, box: null, iconBox: null }];
        const shot = await shoot(page, shotDir, 'shared-trip', sub, viewport.id);
        const judge = await grade(shot.viewportPath, spec.specText);
        await writeFile(path.join(shotDir, `${shot.stem}.json`), JSON.stringify({ measurement, judge, clicked }, null, 2));
        rows.push(finishRow({
          feature: 'shared-trip',
          sub,
          viewport: viewport.id,
          measurement,
          judge,
          screenshot: path.relative(path.dirname(shotDir), shot.viewportPath),
        }));
        measurements.push({ feature: 'shared-trip', sub, viewport: viewport.id, clicked, measurement, judge });
      }
    } catch (error) {
      rows.push({
        feature: 'shared-trip',
        sub: 'drive',
        viewport: viewport.id,
        layout: 'FAIL',
        judge: 'FAIL',
        screenshot: '',
        reasons: [redact(error.message || error), 'screenshot-missing'],
      });
    } finally {
      await page.close();
    }
  }
}

export async function driveVerifyLayoutSignup(ctx) {
  const {
    browser, shotDir, rows, measurements, staging, redact, sleep,
    loadSpec, shoot, grade, finishRow, writeFile, path, unreachableRow,
  } = ctx;
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    try {
      await applyViewport(page, viewport);
      const response = await page.goto(`${staging}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await applyViewport(page, viewport);
      const status = response ? response.status() : 0;
      if (status >= 400) throw new Error(`signup page HTTP ${status}`);
      const spec = loadSpec('signup');
      const measurement = await measurePage(page, { kind: 'signup', state: 'signup', specMissing: spec.specMissing });
      measurement.specMissing = spec.specMissing;
      const shot = await shoot(page, shotDir, 'signup-checkout', 'form', viewport.id);
      const judge = await grade(shot.viewportPath, spec.specText);
      await writeFile(path.join(shotDir, `${shot.stem}.json`), JSON.stringify({ measurement, judge }, null, 2));
      rows.push(finishRow({
        feature: 'signup-checkout',
        sub: 'form',
        viewport: viewport.id,
        measurement,
        judge,
        screenshot: path.relative(path.dirname(shotDir), shot.viewportPath),
      }));
      measurements.push({ feature: 'signup-checkout', sub: 'form', viewport: viewport.id, measurement, judge });
      rows.push(unreachableRow(
        'signup-checkout',
        'coupon',
        viewport.id,
        'No disposable staging coupon is documented. Redeeming a coupon is irreversible, so this drive does not submit checkout.',
      ));
    } catch (error) {
      rows.push({
        feature: 'signup-checkout',
        sub: 'drive',
        viewport: viewport.id,
        layout: 'FAIL',
        judge: 'FAIL',
        screenshot: '',
        reasons: [redact(error.message || error), 'screenshot-missing'],
      });
    } finally {
      await page.close();
    }
  }
}
