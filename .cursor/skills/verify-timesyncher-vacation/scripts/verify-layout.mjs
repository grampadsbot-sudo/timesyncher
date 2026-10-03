#!/usr/bin/env node
/**
 * Drive the staging vacation app the way a customer does.
 * Geometry is measured. Intent is judged from the screen spec. Fail closed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeScreenshot } from './layout-judge.mjs';
import { VIEWPORTS, applyViewport, launchBrowser, measurePage } from './layout-measure.mjs';
import { evaluateLayout, exitCode, judgeColumn, renderVerify } from './layout-rules.mjs';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const skillDir = fileURLToPath(new URL('..', import.meta.url));
const staging = 'https://vacation-staging.timesyncher.com';
const tolerances = JSON.parse(readFileSync(new URL('../layout-tolerances.json', import.meta.url), 'utf8'));
const config = JSON.parse(readFileSync(new URL('../verify-config.json', import.meta.url), 'utf8'));

const APP_STATES = ['app-0-vacations', 'app-1-no-site', 'app-1-with-site', 'app-2-plus'];
const TABS = [
  ['day-by-day', 'Day-by-Day'],
  ['flights', 'Flights'],
  ['hotels', 'Hotels'],
  ['cars', 'Cars'],
  ['restaurants', 'Restaurants'],
  ['stores', 'Stores'],
  ['the-rest', 'The Rest'],
  ['budget', 'Budget'],
];

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? '' : (process.argv[index + 1] || '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redact(value) {
  const session = process.env.TIMESYNCHER_VERIFY_SESSION || '';
  const text = String(value || '');
  return session ? text.split(session).join('[session]') : text;
}

function sharedPath() {
  const configured = String(config.layoutSharedPath || '').trim();
  if (configured.startsWith('/')) return configured;
  return `/shared/${config.testTripSlug}/`;
}

function appUrl() {
  const session = process.env.TIMESYNCHER_VERIFY_SESSION || '';
  if (!session) return '';
  if (session.startsWith('http://') || session.startsWith('https://')) return session;
  return `${staging}/vacation-app.html?session=${encodeURIComponent(session)}`;
}

function loadSpec(screenId) {
  const dir = path.join(root, 'features/screens');
  const specific = path.join(dir, `${screenId}.md`);
  const sharedName = screenId.startsWith('app-') || screenId === 'website-full-screen' ? 'app.md' : 'trip.md';
  const signup = screenId === 'signup' || screenId === 'form';
  const shared = path.join(dir, signup ? 'signup.md' : sharedName);
  const file = existsSync(specific) ? specific : shared;
  if (!existsSync(file)) {
    return { specMissing: true, specText: '', specFile: path.relative(root, specific) };
  }
  return { specMissing: false, specText: readFileSync(file, 'utf8'), specFile: path.relative(root, file) };
}

function unreachableRow(feature, sub, viewport, prerequisite) {
  return {
    feature,
    sub,
    viewport,
    layout: 'FAIL',
    judge: 'FAIL',
    screenshot: '',
    reasons: [`verified-unreachable: ${prerequisite}`, 'screenshot-missing', 'judge-missing'],
  };
}

function finishRow({ feature, sub, viewport, measurement, judge, screenshot, extra = [] }) {
  const layout = evaluateLayout(measurement, tolerances);
  const judged = judge || { ok: false, error: 'judge-missing', mismatches: [] };
  const reasons = [...layout.reasons, ...extra];
  if (judged.ok !== true) reasons.push(judged.error || 'judge-missing');
  else if (judged.verdict !== 'yes') reasons.push(...(judged.mismatches || []).map((item) => `judge:${item}`));
  const failed = layout.layout !== 'PASS' || extra.length > 0;
  return {
    feature,
    sub,
    viewport,
    layout: failed ? 'FAIL' : 'PASS',
    judge: judgeColumn(judged),
    screenshot,
    reasons,
  };
}

async function shoot(page, shotDir, feature, sub, viewportId) {
  const stem = `${feature}-${sub}-${viewportId}`;
  const viewportPath = path.join(shotDir, `${stem}.png`);
  const pagePath = path.join(shotDir, `${stem}-page.png`);
  await page.screenshot({ path: viewportPath });
  try {
    await page.screenshot({ path: pagePath, fullPage: true });
  } catch {
    await page.screenshot({ path: pagePath });
  }
  return { viewportPath, stem };
}

async function grade(pngPath, specText) {
  if (!specText) return { ok: false, error: 'no spec', verdict: null, mismatches: [] };
  return judgeScreenshot({ pngPath, specText });
}

async function detectApp(page) {
  return page.evaluate(() => {
    const paints = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width >= 0.5 && rect.height >= 0.5;
    };
    return {
      eula: paints(document.querySelector('#eulaScreen')),
      gate: paints(document.querySelector('#sessionForm')),
      composer: Boolean(document.querySelector('#messageText')) && paints(document.querySelector('#messageText')),
      options: document.querySelectorAll('#tripMenu [role="option"], .trip-option').length,
      hasSite: paints(document.querySelector('.site-pane iframe')),
    };
  });
}

function stateId(detected) {
  if (!detected.composer) return '';
  if (detected.options >= 2) return 'app-2-plus';
  if (detected.options === 1 && detected.hasSite) return 'app-1-with-site';
  if (detected.options === 1) return 'app-1-no-site';
  return 'app-0-vacations';
}

function showMessages(sub, hasSite) {
  return sub === 'app-0-vacations' || sub === 'app-1-no-site' || (sub === 'app-2-plus' && !hasSite);
}

async function runDoctor(browser) {
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

async function driveChat(browser, shotDir, rows, measurements) {
  const url = appUrl();
  const prerequisite = 'an accepted staging session in TIMESYNCHER_VERIFY_SESSION. No disposable signup coupon is documented, so this drive does not create an account.';
  if (!url) {
    for (const viewport of VIEWPORTS) {
      for (const sub of [...APP_STATES, 'website-full-screen', 'send-one-message']) rows.push(unreachableRow('chat', sub, viewport.id, prerequisite));
    }
    return;
  }
  let sent = false;
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    try {
      await applyViewport(page, viewport);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await applyViewport(page, viewport);
      await page.waitForSelector('#messageText, #eulaScreen, #sessionForm', { timeout: 20000 });
      const detected = await detectApp(page);
      const current = stateId(detected);
      const why = detected.eula
        ? 'the session is still on the terms screen. This drive does not click Agree.'
        : detected.gate
          ? 'the session link opened the session gate instead of the workspace.'
          : `this session is ${current || 'not a workspace'}. Each other state needs its own fixture account.`;
      for (const sub of APP_STATES) {
        if (sub !== current) {
          rows.push(unreachableRow('chat', sub, viewport.id, why));
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
        await writeFile(path.join(shotDir, `${shot.stem}.json`), JSON.stringify({ measurement, judge, specFile: spec.specFile }, null, 2));
        const row = finishRow({
          feature: 'chat',
          sub,
          viewport: viewport.id,
          measurement,
          judge,
          screenshot: path.relative(path.dirname(shotDir), shot.viewportPath),
        });
        rows.push(row);
        measurements.push({ feature: 'chat', sub, viewport: viewport.id, measurement, judge });
      }
      if (current) {
        const spec = loadSpec('website-full-screen');
        const entered = detected.hasSite
          ? await clickControl(page, ['Full screen', 'Enter full screen'], 'fullscreenButton')
          : false;
        if (entered) await sleep(400);
        const measurement = await measurePage(page, {
          kind: 'app',
          state: 'website-full-screen',
          hasSite: true,
          showMessages: false,
          specMissing: spec.specMissing,
        });
        measurement.specMissing = spec.specMissing;
        const shot = await shoot(page, shotDir, 'chat', 'website-full-screen', viewport.id);
        const judge = await grade(shot.viewportPath, spec.specText);
        const extra = [];
        if (entered) {
          const exitClicked = await clickControl(page, ['Exit full screen', 'Close full screen'], 'exitFullscreenButton');
          if (exitClicked) await sleep(400);
          const restored = exitClicked && await splitRestored(page);
          if (!restored) extra.push('fullscreen-exit-did-not-return');
        }
        await writeFile(path.join(shotDir, `${shot.stem}.json`), JSON.stringify({ measurement, judge, entered, specFile: spec.specFile }, null, 2));
        rows.push(finishRow({
          feature: 'chat',
          sub: 'website-full-screen',
          viewport: viewport.id,
          measurement,
          judge,
          screenshot: path.relative(path.dirname(shotDir), shot.viewportPath),
          extra,
        }));
        measurements.push({ feature: 'chat', sub: 'website-full-screen', viewport: viewport.id, entered, measurement, judge });
      } else {
        rows.push(unreachableRow('chat', 'website-full-screen', viewport.id, why));
      }
      let reply = sent;
      if (current && !sent) {
        const before = await page.$$eval('article.bubble:not(.user)', (nodes) => nodes.length);
        await page.focus('#messageText');
        await page.type('#messageText', 'Which day is check-in?');
        await page.$eval('#composer', (form) => form.requestSubmit());
        try {
          await page.waitForFunction((count) => document.querySelectorAll('article.bubble:not(.user)').length > count, { timeout: 90000 }, before);
          reply = true;
          sent = true;
        } catch {
          reply = false;
        }
      } else if (current && sent) {
        reply = await page.$$eval('article.bubble:not(.user)', (nodes) => nodes.length > 0);
      }
      if (!current) {
        rows.push(unreachableRow('chat', 'send-one-message', viewport.id, why));
      } else {
        const spec = loadSpec(current);
        const measurement = await measurePage(page, {
          kind: 'app',
          state: current,
          hasSite: detected.hasSite,
          showMessages: showMessages(current, detected.hasSite),
          specMissing: spec.specMissing,
        });
        measurement.specMissing = spec.specMissing;
        const shot = await shoot(page, shotDir, 'chat', 'send-one-message', viewport.id);
        const judge = await grade(shot.viewportPath, spec.specText);
        await writeFile(path.join(shotDir, `${shot.stem}.json`), JSON.stringify({ measurement, judge, reply }, null, 2));
        rows.push(finishRow({
          feature: 'chat',
          sub: 'send-one-message',
          viewport: viewport.id,
          measurement,
          judge,
          screenshot: path.relative(path.dirname(shotDir), shot.viewportPath),
          extra: reply ? [] : ['reply-unmeasured'],
        }));
        measurements.push({ feature: 'chat', sub: 'send-one-message', viewport: viewport.id, reply, measurement, judge });
      }
    } catch (error) {
      rows.push({
        feature: 'chat',
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

async function clickControl(page, names, id) {
  return page.evaluate((names, id) => {
    const byId = id ? document.getElementById(id) : null;
    const button = byId || [...document.querySelectorAll('button, [role="button"]')].find((el) => {
      const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || '').replace(/\s+/g, ' ').trim();
      return names.includes(name);
    });
    if (!button) return false;
    button.click();
    return true;
  }, names, id);
}

async function splitRestored(page) {
  return page.evaluate(() => {
    const paints = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width >= 0.5 && rect.height >= 0.5;
    };
    return paints(document.querySelector('#messageText')) && paints(document.querySelector('#splitter'));
  });
}

async function clickTab(page, label) {
  const clicked = await page.evaluate((name) => {
    const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const button = [...document.querySelectorAll('button, [role="tab"]')].find((el) => {
      const aria = norm(el.getAttribute('aria-label'));
      const text = norm(el.innerText);
      return aria === name || text === name || (text.endsWith(name) && text.length <= name.length + 3);
    });
    if (!button) return false;
    button.click();
    return true;
  }, label);
  if (clicked) await sleep(700);
  return clicked;
}

async function driveTrip(browser, shotDir, rows, measurements) {
  const url = `${staging}${sharedPath()}`;
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage();
    try {
      await applyViewport(page, viewport);
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await applyViewport(page, viewport);
      const status = response ? response.status() : 0;
      if (status >= 400) throw new Error(`shared page HTTP ${status}`);
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
      } catch {
        // The tab row did not appear. The shell measurement records that.
      }
      const shellSpec = loadSpec('trip');
      const shell = await measurePage(page, { kind: 'trip', state: 'trip', specMissing: shellSpec.specMissing });
      shell.specMissing = shellSpec.specMissing;
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
        const clicked = await clickTab(page, label);
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

async function driveSignup(browser, shotDir, rows, measurements) {
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

async function main() {
  if (process.argv.includes('--self-check')) {
    const ran = spawnSync(process.execPath, [fileURLToPath(new URL('./layout-self-check.mjs', import.meta.url))], {
      cwd: root,
      stdio: 'inherit',
    });
    process.exit(ran.status === null ? 1 : ran.status);
  }
  const doctorOnly = process.argv.includes('--doctor');
  const outDir = path.resolve(argValue('--out') || path.join(skillDir, 'output'));
  const shotDir = path.join(outDir, 'verify');
  await mkdir(shotDir, { recursive: true });
  const rows = [];
  const measurements = [];
  let browser;
  try {
    browser = await launchBrowser();
    const doctor = await runDoctor(browser);
    rows.push({
      feature: 'doctor',
      sub: 'readiness',
      viewport: 'both',
      layout: doctor.ok ? 'PASS' : 'FAIL',
      judge: doctor.ok ? 'PASS' : 'FAIL',
      screenshot: '',
      reasons: doctor.ok ? [`sha ${doctor.sha}`] : doctor.reasons,
    });
    const only = argValue('--only');
    if (!doctorOnly && (!only || only === 'chat')) await driveChat(browser, shotDir, rows, measurements);
    if (!doctorOnly && (!only || only === 'shared-trip')) await driveTrip(browser, shotDir, rows, measurements);
    if (!doctorOnly && (!only || only === 'signup-checkout')) await driveSignup(browser, shotDir, rows, measurements);
  } catch (error) {
    rows.push({
      feature: 'drive',
      sub: 'run',
      viewport: 'both',
      layout: 'FAIL',
      judge: 'FAIL',
      screenshot: '',
      reasons: [redact(error.message || error)],
    });
  } finally {
    if (browser) await browser.close();
  }
  await writeFile(path.join(outDir, 'VERIFY.md'), renderVerify(rows));
  await writeFile(path.join(outDir, 'measurements.json'), JSON.stringify(measurements, null, 2));
  console.log(renderVerify(rows));
  console.log(`wrote ${path.join(outDir, 'VERIFY.md')}`);
  process.exit(exitCode(rows));
}

await main();
