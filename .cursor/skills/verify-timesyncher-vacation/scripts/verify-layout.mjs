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
import { applyViewport, launchBrowser, measurePage } from './layout-measure.mjs';
import { evaluateLayout, exitCode, judgeColumn, renderVerify } from './layout-rules.mjs';
import { provisionVerifyLayoutChatStates } from './verify-layout-chat-provision.mjs';
import { driveChatProvisioned } from './verify-layout-chat-drive.mjs';
import { runVerifyLayoutDoctor } from './verify-layout-doctor.mjs';
import { driveVerifyLayoutSignup, driveVerifyLayoutTrip } from './verify-layout-trip-signup-drive.mjs';
import { configureShepherdSmokeHelpers } from '../../../../scripts/shepherd-staging-smoke-helpers.mjs';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const skillDir = fileURLToPath(new URL('..', import.meta.url));
const staging = String(process.env.TIMESYNCHER_TRAVEL_BASE_URL || 'https://vacation-staging.timesyncher.com').replace(/\/?$/, '');
const tolerances = JSON.parse(readFileSync(new URL('../layout-tolerances.json', import.meta.url), 'utf8'));
const config = JSON.parse(readFileSync(new URL('../verify-config.json', import.meta.url), 'utf8'));

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
  } catch (shotErr) {
    await page.screenshot({ path: pagePath });
    void shotErr;
  }
  return { viewportPath, stem };
}

async function grade(pngPath, specText) {
  if (!specText) return { ok: false, error: 'no spec', verdict: null, mismatches: [] };
  return judgeScreenshot({ pngPath, specText });
}

function driveCtx(browser, shotDir, rows, measurements) {
  return {
    browser,
    shotDir,
    rows,
    measurements,
    staging,
    sharedPath,
    redact,
    sleep,
    loadSpec,
    shoot,
    grade,
    finishRow,
    writeFile,
    path,
    unreachableRow,
    TABS,
  };
}

function configureVerifyLayoutHarness() {
  const SHA7 = 'verify-layout';
  configureShepherdSmokeHelpers({
    BASE: staging,
    RUN_TS: Date.now(),
    DECOY_TITLE: `VERIFY_LAYOUT_${SHA7}`,
    HYATT_CANON: 'Hyatt Regency Maui Resort & Spa',
    REAL_HYATT: { lat: 20.91297, lng: -156.69217, street: '200 Nohea Kai' },
    SHA7,
    commerceHits: () => [],
  });
}

async function main() {
  configureVerifyLayoutHarness();
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
    const doctor = await runVerifyLayoutDoctor(browser, { staging, sharedPath, redact });
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
    const ctx = driveCtx(browser, shotDir, rows, measurements);
    let chatStates = null;
    if (!doctorOnly && (!only || only === 'chat')) {
      try {
        chatStates = await provisionVerifyLayoutChatStates({ env: process.env });
      } catch (error) {
        rows.push({
          feature: 'chat',
          sub: 'provision',
          viewport: 'both',
          layout: 'FAIL',
          judge: 'FAIL',
          screenshot: '',
          reasons: [redact(error.message || error), 'screenshot-missing'],
        });
      }
    }
    if (!doctorOnly && (!only || only === 'chat')) {
      await driveChatProvisioned({
        browser,
        shotDir,
        rows,
        measurements,
        chatStates,
        applyViewport,
        loadSpec,
        measurePage,
        shoot,
        grade,
        finishRow,
        writeFile,
        path,
        unreachableRow,
        sleep,
      });
    }
    if (!doctorOnly && (!only || only === 'shared-trip')) await driveVerifyLayoutTrip(ctx);
    if (!doctorOnly && (!only || only === 'signup-checkout')) await driveVerifyLayoutSignup(ctx);
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
