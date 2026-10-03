#!/usr/bin/env node
/** Drive four provisioned chat states × viewports (screenshot required per row). */

export async function driveChatProvisioned({
  browser,
  shotDir,
  rows,
  measurements,
  chatStates,
  VIEWPORTS,
  APP_STATES,
  applyViewport,
  detectApp,
  stateId,
  showMessages,
  loadSpec,
  measurePage,
  shoot,
  grade,
  finishRow,
  writeFile,
  path,
  unreachableRow,
  sleep,
  clickControl,
  splitRestored,
}) {
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
        const current = stateId(detected);
        if (current !== sub) {
          rows.push(unreachableRow('chat', sub, viewport.id, `expected ${sub} got ${current || 'unknown'}`));
          continue;
        }
        const spec = loadSpec(sub);
        const measurement = await measurePage(page, {
          kind: 'app',
          state: sub,
          hasSite: detected.hasSite,
          showMessages: showMessages(sub, detected.hasSite),
          specMissing: spec.specMissing,
        });
        measurement.specMissing = spec.specMissing;
        const shot = await shoot(page, shotDir, 'chat', sub, viewport.id);
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
          const fsMeasure = await measurePage(page, {
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
