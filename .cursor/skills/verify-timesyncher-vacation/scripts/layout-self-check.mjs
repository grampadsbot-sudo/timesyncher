import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateLayout, exitCode, judgeColumn, renderVerify } from './layout-rules.mjs';
import {
  box,
  correctApp0,
  correctApp0Html,
  correctApp2,
  correctFullscreen,
  correctFullscreenHtml,
  correctTrip,
  correctWithSite,
  correctWithSiteHtml,
  emptyHeaderBar,
  emptyHeaderBarHtml,
  p0Offscreen,
  p0OffscreenHtml,
  probeChat390,
  probeShared390,
} from './layout-fixtures.mjs';
import { judgeScreenshot } from './layout-judge.mjs';
import { VIEWPORTS, chromePath, launchBrowser, measureHtml } from './layout-measure.mjs';

const tolerances = JSON.parse(await readFile(new URL('../layout-tolerances.json', import.meta.url), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function codes(measurement) {
  return evaluateLayout(measurement, tolerances).reasons;
}

function has(measurement, code) {
  return codes(measurement).includes(code);
}

const p0 = codes(p0Offscreen());
assert(p0.includes('composer-below-viewport'), `p0 fixture should fail the off-screen composer: ${p0.join(',')}`);
assert(p0.includes('header-wider-than-viewport'), `p0 fixture should fail the 479px header: ${p0.join(',')}`);
assert(evaluateLayout(p0Offscreen(), tolerances).layout === 'FAIL', 'p0 fixture layout');

const probeChat = codes(probeChat390());
assert(probeChat.includes('composer-below-viewport'), `probe chat-390 composer: ${probeChat.join(',')}`);
assert(probeChat.includes('header-wider-than-viewport'), `probe chat-390 header: ${probeChat.join(',')}`);

const probeShared = codes(probeShared390());
assert(probeShared.includes('open-nav-paints'), `probe shared-390 open navigation: ${probeShared.join(',')}`);
assert(probeShared.includes('settings-paints'), `probe shared-390 settings: ${probeShared.join(',')}`);

const correct = evaluateLayout(correctApp0(), tolerances);
assert(correct.layout === 'PASS', `correct app-0 should pass: ${correct.reasons.join(',')}`);
const zeroHeader = correctApp0();
zeroHeader.regions.header = box(0, 0, 390, 0, { paints: false });
assert(evaluateLayout(zeroHeader, tolerances).layout === 'PASS', 'a header with height 0 passes');
const emptyBar = codes(emptyHeaderBar());
assert(emptyBar.includes('header-renders'), `empty header bar must fail: ${emptyBar.join(',')}`);
assert(evaluateLayout(emptyHeaderBar(), tolerances).layout === 'FAIL', 'empty header bar is not a pass');
const withSite = evaluateLayout(correctWithSite(), tolerances);
assert(withSite.layout === 'PASS', `site with a full-screen control should pass: ${withSite.reasons.join(',')}`);
const missingControl = correctWithSite();
missingControl.regions.fullscreen = null;
const missingControlCodes = codes(missingControl);
assert(missingControlCodes.includes('fullscreen-control-unmeasured'), `missing full-screen control: ${missingControlCodes.join(',')}`);
assert(!missingControlCodes.includes('GAP'), 'a missing full-screen control is not a GAP');
const fullscreen = evaluateLayout(correctFullscreen(), tolerances);
assert(fullscreen.layout === 'PASS', `website full-screen should pass: ${fullscreen.reasons.join(',')}`);
const notFilled = correctFullscreen();
notFilled.regions.site = box(0, 0, 390, 600);
assert(has(notFilled, 'fullscreen-not-filled'), 'a website that does not fill the viewport fails');
const stuck = correctFullscreen();
stuck.regions.fullscreenExit = null;
stuck.regions.composer = box(58, 787, 230, 42);
stuck.textboxes = [stuck.regions.composer];
const stuckCodes = codes(stuck);
assert(stuckCodes.includes('fullscreen-exit-unmeasured') && stuckCodes.includes('fullscreen-chrome-paints'), `full-screen still showing the text box: ${stuckCodes.join(',')}`);
const app2 = evaluateLayout(correctApp2(), tolerances);
assert(app2.layout === 'PASS', `two vacations with only the dropdown should pass: ${app2.reasons.join(',')}`);
const trip = evaluateLayout(correctTrip(), tolerances);
assert(trip.layout === 'PASS', `correct trip should pass: ${trip.reasons.join(',')}`);

const tilted = correctTrip();
tilted.tabs[0].iconBox = { ...tilted.tabs[0].iconBox, y: tilted.tabs[0].iconBox.y + 6 };
assert(has(tilted, 'tab-icon-off-center'), 'tab icon more than 1.5px off center');

const missingSpec = correctApp0();
missingSpec.specMissing = true;
assert(has(missingSpec, 'spec-missing'), 'missing spec is a failure');

const unmeasured = correctApp0();
unmeasured.regions.composer = null;
assert(has(unmeasured, 'composer-unmeasured'), 'unmeasured composer is a failure');

const noKey = await judgeScreenshot({ pngPath: '/tmp/does-not-matter.png', specText: 'spec', env: {} });
assert(noKey.ok === false && noKey.error === 'OPENROUTER_API_KEY missing', 'missing key is a loud judge failure');
assert(judgeColumn(noKey) === 'FAIL', 'missing judge is FAIL');

const yes = await judgeScreenshot({
  pngPath: fileURLToPath(new URL('./layout-self-check.mjs', import.meta.url)),
  specText: 'spec',
  env: { OPENROUTER_API_KEY: 'self-check' },
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: '{"verdict":"yes","mismatches":[]}' } }] }),
  }),
});
assert(yes.verdict === 'yes' && judgeColumn(yes) === 'PASS', 'yes verdict passes the judge column');

const no = await judgeScreenshot({
  pngPath: fileURLToPath(new URL('./layout-self-check.mjs', import.meta.url)),
  specText: 'spec',
  env: { OPENROUTER_API_KEY: 'self-check' },
  fetchImpl: async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content: '{"verdict":"no","mismatches":["logo"]}' } }] }),
  }),
});
assert(no.verdict === 'no' && judgeColumn(no) === 'FAIL', 'no verdict fails the judge column');

const timedOut = await judgeScreenshot({
  pngPath: fileURLToPath(new URL('./layout-self-check.mjs', import.meta.url)),
  specText: 'spec',
  env: { OPENROUTER_API_KEY: 'self-check' },
  fetchImpl: async () => {
    const error = new Error('aborted');
    error.name = 'TimeoutError';
    throw error;
  },
});
assert(timedOut.error === 'judge timeout' && judgeColumn(timedOut) === 'FAIL', 'judge timeout is FAIL');

const missingShot = await judgeScreenshot({ pngPath: '', specText: 'spec', env: { OPENROUTER_API_KEY: 'self-check' } });
assert(missingShot.error === 'screenshot-missing', 'missing screenshot is FAIL');

const rows = [
  { feature: 'chat', sub: 'app-0-vacations', viewport: '390', layout: 'PASS', judge: 'PASS', screenshot: 'chat-app-0-vacations-390.png', reasons: [] },
  { feature: 'chat', sub: 'app-1-with-site', viewport: '390', layout: 'FAIL', judge: 'FAIL', screenshot: 'chat-app-1-with-site-390.png', reasons: p0 },
];
const table = renderVerify(rows);
assert(table.includes('| feature | sub-feature | viewport | layout | judge | screenshot |'), 'VERIFY header');
assert(table.includes('| chat | app-0-vacations | 390 | PASS | PASS | chat-app-0-vacations-390.png |'), 'VERIFY pass row');
assert(exitCode(rows) === 1, 'any FAIL exits non-zero');
assert(exitCode([rows[0]]) === 0, 'all PASS exits zero');

const scratch = await mkdtemp(path.join(tmpdir(), 'verify-layout-'));
const evidence = path.join(scratch, 'evidence.txt');
await writeFile(evidence, 'keep');
await writeFile(path.join(scratch, 'VERIFY.md'), table);
const kept = await readFile(evidence, 'utf8');
assert(kept === 'keep', 'cleanup must leave evidence in place');
await rm(scratch, { recursive: true, force: true });

let browserNote = 'chromium compare skipped';
if (chromePath()) {
  let browser;
  try {
    browser = await launchBrowser();
  } catch (error) {
    browserNote = `chromium compare skipped: ${error.message}`;
    browser = null;
  }
  if (browser) {
    try {
      const bad = await measureHtml(browser, p0OffscreenHtml(), VIEWPORTS[0], {
        kind: 'app',
        state: 'app-1-with-site',
        hasSite: true,
        showMessages: false,
        specMissing: false,
      });
      const badCodes = evaluateLayout(bad, tolerances).reasons;
      assert(badCodes.includes('composer-below-viewport'), `rendered p0 composer: ${badCodes.join(',')}`);
      assert(badCodes.includes('header-wider-than-viewport') || badCodes.includes('scroll-wider-than-viewport'), `rendered p0 header: ${badCodes.join(',')}`);
      assert(badCodes.includes('logo-outside-header'), `rendered p0 footer logo: ${badCodes.join(',')}`);
      assert(badCodes.includes('hidden-paints'), `rendered p0 hidden nav: ${badCodes.join(',')}`);
      assert(badCodes.includes('empty-white-box'), `rendered p0 white box: ${badCodes.join(',')}`);
      const good = await measureHtml(browser, correctApp0Html(), VIEWPORTS[0], {
        kind: 'app',
        state: 'app-0-vacations',
        hasSite: false,
        showMessages: true,
        specMissing: false,
      });
      const goodResult = evaluateLayout(good, tolerances);
      assert(goodResult.layout === 'PASS', `rendered correct page: ${goodResult.reasons.join(',')}`);
      const bar = await measureHtml(browser, emptyHeaderBarHtml(), VIEWPORTS[0], {
        kind: 'app',
        state: 'app-1-no-site',
        hasSite: false,
        showMessages: true,
        specMissing: false,
      });
      const barCodes = evaluateLayout(bar, tolerances).reasons;
      assert(barCodes.includes('header-renders'), `rendered empty header: ${barCodes.join(',')}`);
      const site = await measureHtml(browser, correctWithSiteHtml(), VIEWPORTS[0], {
        kind: 'app',
        state: 'app-1-with-site',
        hasSite: true,
        showMessages: false,
        specMissing: false,
      });
      const siteResult = evaluateLayout(site, tolerances);
      assert(siteResult.layout === 'PASS', `rendered site with full-screen control: ${siteResult.reasons.join(',')}`);
      const bareSite = await measureHtml(browser, correctWithSiteHtml().replace(/<button id="fullscreenButton"[\s\S]*?<\/button>/, ''), VIEWPORTS[0], {
        kind: 'app',
        state: 'app-1-with-site',
        hasSite: true,
        showMessages: false,
        specMissing: false,
      });
      const bareCodes = evaluateLayout(bareSite, tolerances).reasons;
      assert(bareCodes.includes('fullscreen-control-unmeasured'), `rendered site without full-screen control: ${bareCodes.join(',')}`);
      const full = await measureHtml(browser, correctFullscreenHtml(), VIEWPORTS[0], {
        kind: 'app',
        state: 'website-full-screen',
        hasSite: true,
        showMessages: false,
        specMissing: false,
      });
      const fullResult = evaluateLayout(full, tolerances);
      assert(fullResult.layout === 'PASS', `rendered website full-screen: ${fullResult.reasons.join(',')}`);
      browserNote = 'chromium compare ok';
    } finally {
      await browser.close();
      const after = await readFile(new URL('../layout-tolerances.json', import.meta.url), 'utf8');
      assert(after.includes('composerBottomSlackPx'), 'closing chromium must not delete skill files');
    }
  }
}

console.log(`verify layout self-check ok (${browserNote})`);
