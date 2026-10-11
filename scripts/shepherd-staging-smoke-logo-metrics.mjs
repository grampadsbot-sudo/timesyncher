import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import {
  gradeLogoTabResult,
  gradeSharedTabLogoUrlRecords,
  attributeLogoMisalignmentCss,
  mergeLogoCssSuspects,
  isRealBrandLogoSrc,
} from './shepherd-staging-smoke-lib.mjs';
import { clickSharedTabByKeyword } from './shepherd-staging-smoke-shared-ui-map.mjs';
import {
  collectCategoryTabInkMetrics,
} from './lib/shared-trip-category-tab-icon-metrics.mjs';
import {
  findCarsTabInkMetric,
  gradeCarsHeadingLogoInk,
  logoChipInkPresent,
} from './lib/logo-pixel-ink-grade.mjs';

export const LOGO_VIEWPORT_WIDTHS = [1280, 390];
export const LOGO_TAB_SETTLE_MS = 400;
export const LOGO_IMG_LOAD_CAP_MS = 5000;
export const LOGO_ROW_SCREENSHOT_CAP = 8;

function stamp(stageTimestamps, key) {
  if (!stageTimestamps) return;
  stageTimestamps[key] = Date.now();
}

export function createLogoStageTimestamps() {
  return {
    gotoStartMs: null,
    gotoEndMs: null,
    hydrationWaitStartMs: null,
    hydrationWaitEndMs: null,
    logoTabsReadyMs: null,
    logoTabsReadyFromHydrationMs: null,
    hotelsTabClickStartMs: null,
    hotelsTabClickEndMs: null,
    hotelsMeasure1280StartMs: null,
    hotelsMeasure1280EndMs: null,
    hotelsMeasure390StartMs: null,
    hotelsMeasure390EndMs: null,
    carsTabClickStartMs: null,
    carsTabClickEndMs: null,
    carsMeasure1280StartMs: null,
    carsMeasure1280EndMs: null,
    carsMeasure390StartMs: null,
    carsMeasure390EndMs: null,
    cropStitchStartMs: null,
    cropStitchEndMs: null,
    slowStage: null,
    hangingStage: null,
  };
}

function stageDurationMs(stageTimestamps, startKey, endKey) {
  const start = stageTimestamps?.[startKey];
  const end = stageTimestamps?.[endKey];
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return end - start;
}

export function pickSlowLogoStage(stageTimestamps) {
  const pairs = [
    ['hydrationWaitStartMs', 'hydrationWaitEndMs', 'hydration_wait'],
    ['hotelsTabClickStartMs', 'hotelsTabClickEndMs', 'hotels_tab_click'],
    ['hotelsMeasure1280StartMs', 'hotelsMeasure1280EndMs', 'hotels_measure_1280'],
    ['hotelsMeasure390StartMs', 'hotelsMeasure390EndMs', 'hotels_measure_390'],
    ['carsTabClickStartMs', 'carsTabClickEndMs', 'cars_tab_click'],
    ['carsMeasure1280StartMs', 'carsMeasure1280EndMs', 'cars_measure_1280'],
    ['carsMeasure390StartMs', 'carsMeasure390EndMs', 'cars_measure_390'],
    ['cropStitchStartMs', 'cropStitchEndMs', 'crop_stitch'],
  ];
  let slow = { name: null, ms: 0 };
  for (const [startKey, endKey, name] of pairs) {
    const ms = stageDurationMs(stageTimestamps, startKey, endKey);
    if (ms != null && ms > slow.ms) {
      slow = { name, ms };
    }
  }
  return slow.name ? slow : null;
}

export function normalizePngBufferInput(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (typeof data === 'string') return Buffer.from(data, 'base64');
  throw new TypeError('png_buffer_input_unsupported');
}

export async function measureLogoComFromPngBuffer(buf) {
  const png = PNG.sync.read(normalizePngBufferInput(buf));
  const { width: w, height: h, data } = png;
  const corners = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
  ].map(([x, y]) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  });
  const bg = corners.reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0])
    .map((v) => v / corners.length);
  const threshold = 18;
  let sumX = 0;
  let sumY = 0;
  let mass = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const dr = Math.abs(data[i] - bg[0]);
      const dg = Math.abs(data[i + 1] - bg[1]);
      const db = Math.abs(data[i + 2] - bg[2]);
      if (dr + dg + db < threshold) continue;
      const weight = dr + dg + db;
      sumX += x * weight;
      sumY += y * weight;
      mass += weight;
    }
  }
  if (mass <= 0) return { error: 'empty_mass', w, h };
  const comX = sumX / mass;
  const comY = sumY / mass;
  const chipCx = w / 2;
  const chipCy = h / 2;
  return {
    w,
    h,
    comX,
    comY,
    chipCx,
    chipCy,
    dxPx: Math.abs(comX - chipCx),
    dyPx: Math.abs(comY - chipCy),
    mass,
  };
}

export async function stitchLogoChipCropsPng(cropBuffers, outPath) {
  if (!cropBuffers.length) return null;
  const decoded = cropBuffers.map((buf) => PNG.sync.read(normalizePngBufferInput(buf)));
  const pad = 4;
  const cellW = Math.max(...decoded.map((p) => p.width));
  const cellH = Math.max(...decoded.map((p) => p.height));
  const cols = cropBuffers.length;
  const outW = cols * cellW + (cols + 1) * pad;
  const outH = cellH + 2 * pad;
  const out = new PNG({ width: outW, height: outH });
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const i = (out.width * y + x) << 2;
      out.data[i] = 240;
      out.data[i + 1] = 240;
      out.data[i + 2] = 240;
      out.data[i + 3] = 255;
    }
  }
  decoded.forEach((png, idx) => {
    const ox = pad + idx * (cellW + pad);
    const oy = pad + Math.floor((cellH - png.height) / 2);
    PNG.bitblt(png, out, 0, 0, png.width, png.height, ox, oy);
  });
  writeFileSync(outPath, PNG.sync.write(out));
  return outPath;
}

async function waitLogoImagesBounded(page, capMs) {
  await page.evaluate(async (maxMs) => {
    function realSrc(src) {
      const value = String(src || '').trim();
      if (!value) return false;
      if (/timesyncher-icon/i.test(value)) return false;
      return true;
    }
    const deadline = Date.now() + maxMs;
    for (const img of document.querySelectorAll('img.tiny-logo')) {
      if (!realSrc(img.getAttribute('src'))) continue;
      const host = img.closest('li[data-list-row], li[data-has-logo], [data-ts-logo-chip]') || img.parentElement;
      if (host) host.setAttribute('data-ts-logo-chip', '1');
    }
    const imgs = Array.from(document.querySelectorAll('[data-ts-logo-chip] img.tiny-logo')).filter((img) => realSrc(img.getAttribute('src')));
    await Promise.all(imgs.map((img) => new Promise((resolve) => {
      if (img.complete) {
        resolve();
        return;
      }
      const finish = () => resolve();
      img.addEventListener('load', finish, { once: true });
      img.addEventListener('error', finish, { once: true });
      setTimeout(finish, Math.max(0, deadline - Date.now()));
    })));
  }, capMs);
}

async function collectLogoDescriptors(page) {
  return page.evaluate(() => {
    function realSrc(src) {
      const value = String(src || '').trim();
      if (!value) return false;
      if (/timesyncher-icon/i.test(value)) return false;
      return true;
    }
    const chipEls = Array.from(
      document.querySelectorAll('li[data-list-row="1"] [data-ts-logo-chip], li[data-has-logo] [data-ts-logo-chip], [data-shared-live-tab] [data-ts-logo-chip]'),
    ).filter((chipEl) => {
      const chipR = chipEl.getBoundingClientRect();
      return chipR.width >= 12 && chipR.height >= 12 && chipEl.offsetParent !== null;
    });
    return chipEls.slice(0, 12).map((chipEl, index) => {
      const logoEl = chipEl.querySelector('img.tiny-logo, img[src][alt=""]');
      const src = logoEl?.getAttribute('src') || '';
      const chipR = chipEl.getBoundingClientRect();
      const li = chipEl.closest('li[data-list-row], li[data-has-logo], li');
      chipEl.setAttribute('data-ts-logo-chip-idx', String(index));
      return {
        index,
        isListRowChip: true,
        isBrandImg: Boolean(logoEl && realSrc(src)),
        src,
        title: li?.querySelector('strong')?.textContent?.trim() || logoEl?.getAttribute('alt') || '',
        alt: logoEl?.getAttribute('alt') || '',
        chipW: chipR.width,
        chipH: chipR.height,
        imgW: logoEl?.getBoundingClientRect().width || 0,
        imgH: logoEl?.getBoundingClientRect().height || 0,
        naturalWidth: logoEl?.naturalWidth || 0,
        naturalHeight: logoEl?.naturalHeight || 0,
        computed: logoEl ? {
          imgMargin: getComputedStyle(logoEl).margin,
          imgObjectPosition: getComputedStyle(logoEl).objectPosition,
          chipDisplay: getComputedStyle(chipEl).display,
        } : {
          chipDisplay: getComputedStyle(chipEl).display,
        },
      };
    });
  });
}

async function measureRowsAtViewport(page, viewportWidth, stageTimestamps, measureKey, tabClicked, opts = {}) {
  const { carsHeadingCheck = false } = opts;
  const startKey = `${measureKey}StartMs`;
  const endKey = `${measureKey}EndMs`;
  stamp(stageTimestamps, startKey);
  await page.setViewport({ width: viewportWidth, height: 900 });
  await new Promise((r) => setTimeout(r, LOGO_TAB_SETTLE_MS));
  await waitLogoImagesBounded(page, LOGO_IMG_LOAD_CAP_MS);
  const descriptors = await collectLogoDescriptors(page);
  const cropBuffers = [];
  const gradedRows = [];
  const screenshotLimit = Math.min(descriptors.length, LOGO_ROW_SCREENSHOT_CAP);
  for (let i = 0; i < screenshotLimit; i += 1) {
    const desc = descriptors[i];
    const chipHandle = await page.$(`[data-ts-logo-chip-idx="${desc.index}"]`);
    let com = { error: 'chip_handle_missing' };
    let cropBuf = null;
    if (chipHandle) {
      cropBuf = await chipHandle.screenshot({ type: 'png' });
      com = await measureLogoComFromPngBuffer(cropBuf);
      if (cropBuf) cropBuffers.push(cropBuf);
      await chipHandle.dispose();
    }
    const cssSuspects = attributeLogoMisalignmentCss(desc.computed || {});
    gradedRows.push({
      ...desc,
      com: com.error ? com : {
        dxPx: com.dxPx,
        dyPx: com.dyPx,
        comX: com.comX,
        comY: com.comY,
        chipCx: com.chipCx,
        chipCy: com.chipCy,
        mass: com.mass,
      },
      cssSuspects,
    });
  }
  for (const desc of descriptors.slice(screenshotLimit)) {
    gradedRows.push({
      ...desc,
      com: { error: 'screenshot_cap_skipped' },
      cssSuspects: attributeLogoMisalignmentCss(desc.computed || {}),
    });
  }
  const chipRows = gradedRows.filter((r) => r.isListRowChip === true);
  const brandCount = chipRows.filter((r) => isRealBrandLogoSrc(r.src) && logoChipInkPresent(r.com)).length;
  const viewportPass = chipRows.length > 0 && chipRows.every((r) => {
    const com = r.com || {};
    if (com.error === 'screenshot_cap_skipped') return true;
    if (!logoChipInkPresent(com)) return false;
    if (!isRealBrandLogoSrc(r.src)) return true;
    return Number(com.dxPx) <= 1.5 && Number(com.dyPx) <= 1.5;
  });
  let carsHeadingInk = null;
  if (carsHeadingCheck) {
    const tabMetrics = await collectCategoryTabInkMetrics(page);
    carsHeadingInk = gradeCarsHeadingLogoInk(findCarsTabInkMetric(tabMetrics));
  }
  const headingPass = !carsHeadingCheck || carsHeadingInk?.pass === true;
  stamp(stageTimestamps, endKey);
  return {
    viewportWidth,
    clicked: tabClicked,
    rows: gradedRows,
    brandImgCount: brandCount,
    cropBuffers,
    carsHeadingInk,
    pass: Boolean(tabClicked) && viewportPass && headingPass,
    failReason: !tabClicked ? 'tab_not_clicked' : (chipRows.length === 0 ? 'zero_list_row_logo_chips' : (!viewportPass ? 'empty_logo_chip' : (!headingPass ? (carsHeadingInk?.reason || 'cars_heading_logo_off_center') : null))),
  };
}

export async function sharedLogoTabCheck(page, tabKeyword, sharedApiJson, opts = {}) {
  const { stageTimestamps, onPersist } = opts;
  const logoUrlEvidence = gradeSharedTabLogoUrlRecords(sharedApiJson, tabKeyword);
  const isHotels = String(tabKeyword).toLowerCase() === 'hotels';
  const clickStartKey = isHotels ? 'hotelsTabClickStartMs' : 'carsTabClickStartMs';
  const clickEndKey = isHotels ? 'hotelsTabClickEndMs' : 'carsTabClickEndMs';
  stamp(stageTimestamps, clickStartKey);
  await page.setViewport({ width: LOGO_VIEWPORT_WIDTHS[0], height: 900 });
  const clicked = await clickSharedTabByKeyword(page, tabKeyword);
  stamp(stageTimestamps, clickEndKey);
  await new Promise((r) => setTimeout(r, LOGO_TAB_SETTLE_MS));

  const viewports = {};
  viewports[1280] = await measureRowsAtViewport(
    page,
    1280,
    stageTimestamps,
    isHotels ? 'hotelsMeasure1280' : 'carsMeasure1280',
    clicked,
    { carsHeadingCheck: !isHotels },
  );
  onPersist?.({ stageTimestamps, hotels: isHotels ? { viewports: { ...viewports } } : undefined, cars: !isHotels ? { viewports: { ...viewports } } : undefined });
  viewports[390] = await measureRowsAtViewport(
    page,
    390,
    stageTimestamps,
    isHotels ? 'hotelsMeasure390' : 'carsMeasure390',
    clicked,
    { carsHeadingCheck: !isHotels },
  );
  onPersist?.({ stageTimestamps, hotels: isHotels ? { viewports: { ...viewports } } : undefined, cars: !isHotels ? { viewports: { ...viewports } } : undefined });

  const rows = viewports[1280]?.rows || [];
  const cropBuffers = [...(viewports[1280]?.cropBuffers || []), ...(viewports[390]?.cropBuffers || [])];
  const tabResult = gradeLogoTabResult({
    tab: tabKeyword,
    clicked,
    rows,
    cssSuspects: mergeLogoCssSuspects(rows),
    logoUrlEvidence,
    viewports,
  });
  return { ...tabResult, cropBuffers, viewports };
}
