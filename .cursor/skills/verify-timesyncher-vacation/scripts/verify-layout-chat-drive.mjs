#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { VIEWPORTS, applyViewport } from './layout-measure.mjs';
import {
  clickControl,
  detectApp,
  fetchVacationAppSnapshot,
  showMessages,
  splitRestored,
  stateIdFromSnapshot,
} from './verify-layout-shared-helpers.mjs';

export async function driveChatProvisioned({
  browser,
  shotDir,
  rows,
  measurements,
  chatStates,
  applyViewport,
  loadSpec,
  measurePage: measurePageFn,
  shoot,
  grade,
  finishRow,
  writeFile,
  path,
  unreachableRow,
  sleep,
}) {
  const APP_STATES = ['app-0-vacations', 'app-1-no-site', 'app-1-with-site', 'app-2-plus'];
  const prerequisite = 'DATABASE_URL provisioning failed or was not run; harness must mint four fixture customers.';
  if (!chatStates || typeof chatStates !== 'object') {
    for (const viewport of VIEWPORTS) {
      for (const sub of APP_STATES) rows.push(unreachableRow('chat', sub, viewport.id, prerequisite));
    }
    return;
  }

  for (const sub of APP_STATES) {
    const fixture = chatStates[sub];
    if (!fixture?.chatUrl) {
      for (const viewport of VIEWPORTS) {
        rows.push(unreachableRow('chat', sub, viewport.id, `missing fixture for ${sub}`));
      }
      continue;
    }
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage();
      try {
        await applyViewport(page, viewport);
        const response = await page.goto(fixture.chatUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await applyViewport(page, viewport);
        const status = response ? response.status() : 0;
        if (status >= 400) throw new Error(`chat HTTP ${status} for ${sub}`);
        await page.waitForSelector('#messageText, #eulaScreen, #sessionForm', { timeout: 20000 });
        const detected = await detectApp(page);
        const baseUrl = new URL(fixture.chatUrl).origin;
        const snapshot = await fetchVacationAppSnapshot(fixture.session, baseUrl);
        const current = stateIdFromSnapshot(snapshot, detected);
        if (!snapshot.ok) {
          rows.push(unreachableRow('chat', sub, viewport.id, `vacation-itinerary snapshot failed for ${sub}`));
          continue;
        }
        if (current !== sub) {
          rows.push(unreachableRow('chat', sub, viewport.id, `expected ${sub} got ${current || 'unknown'}`));
          continue;
        }
        const spec = loadSpec(sub);
        const measurement = await measurePageFn(page, {
          kind: 'app',
          state: sub,
          hasSite: detected.hasSite,
          showMessages: showMessages(sub, detected.hasSite),
          specMissing: spec.specMissing,
        });
        measurement.specMissing = spec.specMissing;
        const shot = await shoot(page, shotDir, 'chat', sub, viewport.id);
        if (!existsSync(shot.viewportPath)) {
          rows.push(unreachableRow('chat', sub, viewport.id, `screenshot missing for ${sub} at ${viewport.id}`));
          continue;
        }
        const judge = await grade(shot.viewportPath, spec.specText);
        await writeFile(path.join(shotDir, `${shot.stem}.json`), JSON.stringify({ measurement, judge, specFile: spec.specFile, fixture: sub }, null, 2));
        rows.push(finishRow({
          feature: 'chat',
          sub,
          viewport: viewport.id,
          measurement,
          judge,
          screenshot: path.relative(path.dirname(shotDir), shot.viewportPath),
        }));
        measurements.push({ feature: 'chat', sub, viewport: viewport.id, measurement, judge });

        if (sub === 'app-1-with-site') {
          const fsSpec = loadSpec('website-full-screen');
          const entered = detected.hasSite
            ? await clickControl(page, ['Full screen', 'Enter full screen'], 'fullscreenButton')
            : false;
          if (entered) await sleep(400);
          const fsMeasure = await measurePageFn(page, {
            kind: 'app',
            state: 'website-full-screen',
            hasSite: true,
            showMessages: false,
            specMissing: fsSpec.specMissing,
          });
          fsMeasure.specMissing = fsSpec.specMissing;
          const fsShot = await shoot(page, shotDir, 'chat', 'website-full-screen', viewport.id);
          const fsJudge = await grade(fsShot.viewportPath, fsSpec.specText);
          const extra = [];
          if (entered) {
            const exitClicked = await clickControl(page, ['Exit full screen', 'Close full screen'], 'exitFullscreenButton');
            if (exitClicked) await sleep(400);
            if (!(exitClicked && await splitRestored(page))) extra.push('fullscreen-exit-did-not-return');
          }
          rows.push(finishRow({
            feature: 'chat',
            sub: 'website-full-screen',
            viewport: viewport.id,
            measurement: fsMeasure,
            judge: fsJudge,
            screenshot: path.relative(path.dirname(shotDir), fsShot.viewportPath),
            extra,
          }));
        }
      } catch (error) {
        rows.push({
          feature: 'chat',
          sub,
          viewport: viewport.id,
          layout: 'FAIL',
          judge: 'FAIL',
          screenshot: '',
          reasons: [String(error?.message || error), 'screenshot-missing'],
        });
      } finally {
        await page.close();
      }
    }
  }
}
