#!/usr/bin/env node
/** PR232: Day 1 & 2 vs NYC final reference; masked pixel + structural gate. */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  absolutizeMediaUrls,
  clipFullDaySection,
  compositeSideBySide,
  diffRatioMasked,
  getExcludeRects,
  loadPuppeteer,
  nycTripPayload,
  openDay,
  readLayoutSignals,
  sleep,
  startServer,
} from './lib/pr232-day-capture-lib.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = '/opt/cursor/artifacts/pr232-day-r1';
const zipPath = '/opt/cursor/artifacts/pr232-day-r1.zip';
const intakeSlug = 'nyc-june-fixture-pr232';
const referenceBundlePath = process.env.NYC_REFERENCE_BUNDLE || '/tmp/index-BMaU4y5m.js';
const dayNumbers = [1, 2];
const widths = [390, 1280];
const MASKED_DIFF_MAX = 0.035;
const captureRound = Number(process.env.PR232_CAPTURE_ROUND || '1');

const [html, css, candidateJs, referenceJs] = await Promise.all([
  readFile(path.join(root, 'shared-app.html'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-CbEHlMj6.css'), 'utf8'),
  readFile(path.join(root, 'public/assets/index-BKun7ofk.js'), 'utf8'),
  readFile(referenceBundlePath, 'utf8'),
]);

await mkdir(outDir, { recursive: true });
for (const id of [571, 572, 573]) {
  const fp = path.join(root, 'public/fixture-media', `place-${id}.jpg`);
  try {
    await readFile(fp);
  } catch {
    execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0x4477aa:s=92x72', '-frames:v', '1', fp], { stdio: 'ignore' });
  }
}

const puppeteer = loadPuppeteer(root);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

const report = {
  outDir,
  zipPath,
  headSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
  referenceBundle: referenceBundlePath,
  captureRound,
  maskedDiffMax: MASKED_DIFF_MAX,
  captures: [],
};

for (const dayNumber of dayNumbers) {
  for (const width of widths) {
    const shots = {};
    const layout = {};
    let excludeRects = [];
    for (const phase of [
      { tag: 'nyc-reference', js: referenceJs, withMedia: false },
      { tag: 'pr232-candidate', js: candidateJs, withMedia: true },
    ]) {
      const basePayload = nycTripPayload({ withMedia: phase.withMedia, intakeSlug });
      const app = await startServer({
        root,
        html,
        css,
        js: phase.js,
        intakeSlug,
        buildPayload: (origin) => (phase.withMedia ? absolutizeMediaUrls(basePayload, origin) : basePayload),
      });
      try {
        const page = await browser.newPage();
        await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          const url = request.url();
          if (url.includes('/api/auth/app-config') || url.includes('/auth/app-config')) return request.abort('blockedbyclient');
          if (url.startsWith(app.origin) || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('https://fonts.') || url.startsWith('https://unpkg.com')) {
            return request.continue();
          }
          request.abort('blockedbyclient');
        });
        await openDay(page, app.origin, dayNumber, intakeSlug);
        let clip = await clipFullDaySection(page, dayNumber);
        if (!clip?.width || clip.width < 40) throw new Error(`clip missing day${dayNumber} w${width} ${phase.tag}`);
        const vpHeight = Math.ceil(clip.y + clip.height + 32);
        if (vpHeight > 900) {
          await page.setViewport({ width, height: Math.min(vpHeight, 4000), deviceScaleFactor: 1 });
          await sleep(400);
          clip = await clipFullDaySection(page, dayNumber);
        }
        excludeRects = excludeRects.concat(await getExcludeRects(page, clip));
        layout[phase.tag] = await readLayoutSignals(page);
        const buf = await page.screenshot({ type: 'png', clip });
        const file = path.join(outDir, `day-${dayNumber}-w${width}-${phase.tag}.png`);
        await writeFile(file, buf);
        shots[phase.tag] = { file, buf };
        await page.close();
      } finally {
        await app.close();
      }
    }
    const sideBySide = await compositeSideBySide(shots['nyc-reference'].buf, shots['pr232-candidate'].buf);
    const sidePath = path.join(outDir, `day-${dayNumber}-w${width}-side-by-side.png`);
    await writeFile(sidePath, sideBySide);
    const diff = diffRatioMasked(shots['nyc-reference'].buf, shots['pr232-candidate'].buf, excludeRects);
    const refSig = layout['nyc-reference'];
    const candSig = layout['pr232-candidate'];
    const structural = {
      dayContainer: refSig.hasDayContainer && candSig.hasDayContainer && candSig.candidateDayMarker,
      headerButtonsMatch: refSig.headerButtons === candSig.headerButtons,
      headerButtons: { reference: refSig.headerButtons, candidate: candSig.headerButtons },
      rowStructure: refSig.rowCount === candSig.rowCount && refSig.rowGridOk && candSig.rowGridOk,
      rowCount: { reference: refSig.rowCount, candidate: candSig.rowCount },
      noEmptySecondMediaSquare: candSig.emptyMediaSquares === 0,
      referenceNoTimelineMedia: refSig.timelineMediaMounts === 0,
      candidateImagesLoaded: candSig.timelineImages.every((img) => img.naturalWidth > 0),
      tripHeaderLogoLoaded: candSig.tripHeaderLogoLoaded,
    };
    structural.pass = structural.dayContainer
      && structural.headerButtonsMatch
      && structural.rowStructure
      && structural.noEmptySecondMediaSquare
      && structural.referenceNoTimelineMedia
      && structural.candidateImagesLoaded
      && structural.tripHeaderLogoLoaded;
    const gatePass = structural.pass && diff.masked.ratio <= MASKED_DIFF_MAX;
    report.captures.push({
      day: dayNumber,
      width,
      sideBySide: sidePath,
      reference: shots['nyc-reference'].file,
      candidate: shots['pr232-candidate'].file,
      pixelDiffRatioRaw: Number(diff.raw.ratio.toFixed(4)),
      pixelDiffRatioMasked: Number(diff.masked.ratio.toFixed(4)),
      pixelDiffMaskedPixels: diff.masked.diff,
      pixelDiffMaskedTotal: diff.masked.total,
      excludeRectCount: excludeRects.length,
      structural,
      gatePass,
    });
  }
}

report.gatePass = report.captures.every((c) => c.gatePass);
await browser.close();
await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
execFileSync('zip', ['-j', zipPath, ...report.captures.flatMap((c) => [c.reference, c.candidate, c.sideBySide])]);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.gatePass ? 0 : 1;
