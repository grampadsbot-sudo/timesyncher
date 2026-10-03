import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import {
  gradeLogoTabResult,
  gradeSharedTabLogoUrlRecords,
  gradeCarTabRowIcons,
  attributeLogoMisalignmentCss,
  mergeLogoCssSuspects,
  isRealBrandLogoSrc,
} from './shepherd-staging-smoke-lib.mjs';
import { clickSharedTabByKeyword } from './shepherd-staging-smoke-shared-ui-map.mjs';

const LOGO_VIEWPORT_WIDTHS = [1280, 390];

async function measureLogoComFromPngBuffer(buf) {
  const png = PNG.sync.read(buf);
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
  const decoded = cropBuffers.map((buf) => PNG.sync.read(buf));
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

async function collectCarTabIconScan(page) {
  return page.evaluate(() => {
    const planeRe = /\u2708|\u2708\uFE0F|✈️/;
    const carRe = /\u{1F697}|\u{1F698}|🚗/u;
    const rows = Array.from(document.querySelectorAll('li[data-list-row="1"], li[data-has-logo="1"]'));
    const samples = [];
    let hasPlane = false;
    let hasCar = false;
    for (const li of rows) {
      const text = li.innerText || '';
      if (!/hertz|rental|\bcar\b|alamo|avis|enterprise|budget|national/i.test(text)) continue;
      const emojiText = Array.from(li.querySelectorAll('.thing-emoji, span[aria-hidden="true"], span'))
        .map((el) => el.textContent || '')
        .join('');
      const hay = `${text} ${emojiText}`;
      const rowHasPlane = planeRe.test(hay);
      const rowHasCar = carRe.test(hay);
      if (rowHasPlane) hasPlane = true;
      if (rowHasCar) hasCar = true;
      samples.push({ text: text.replace(/\s+/g, ' ').trim().slice(0, 120), rowHasPlane, rowHasCar });
    }
    return { rowCount: samples.length, hasPlane, hasCar, samples };
  });
}

async function sharedLogoChipMetricsAtViewport(page, tabKeyword, viewportWidth) {
  await page.setViewport({ width: viewportWidth, height: 900 });
  const clicked = await clickSharedTabByKeyword(page, tabKeyword);
  await new Promise((r) => setTimeout(r, 1200));
  await page.evaluate(async () => {
    function realSrc(src) {
      const value = String(src || '').trim();
      if (!value) return false;
      if (/timesyncher-icon/i.test(value)) return false;
      return true;
    }
    for (const img of document.querySelectorAll('img.tiny-logo')) {
      if (!realSrc(img.getAttribute('src'))) continue;
      const host = img.closest('li[data-list-row], li[data-has-logo], [data-ts-logo-chip]') || img.parentElement;
      if (host) host.setAttribute('data-ts-logo-chip', '1');
    }
    const imgs = Array.from(document.querySelectorAll('[data-ts-logo-chip] img.tiny-logo')).filter((img) => realSrc(img.getAttribute('src')));
    await Promise.all(imgs.map((img) => (img.complete && img.naturalWidth > 0
      ? Promise.resolve()
      : new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      }))));
  });

  const descriptors = await page.evaluate(() => {
    function realSrc(src) {
      const value = String(src || '').trim();
      if (!value) return false;
      if (/timesyncher-icon/i.test(value)) return false;
      return true;
    }
    const imgs = Array.from(document.querySelectorAll('[data-ts-logo-chip] img.tiny-logo')).filter((img) => {
      if (!realSrc(img.getAttribute('src'))) return false;
      const r = img.getBoundingClientRect();
      return r.width >= 4 && r.height >= 4 && img.offsetParent !== null;
    });
    return imgs.map((logoEl, index) => {
      const chipEl = logoEl.closest('[data-ts-logo-chip]') || logoEl.parentElement;
      const chipR = chipEl.getBoundingClientRect();
      const li = logoEl.closest('li[data-list-row], li[data-has-logo], li');
      chipEl.setAttribute('data-ts-logo-chip-idx', String(index));
      logoEl.setAttribute('data-ts-logo-img-idx', String(index));
      return {
        index,
        isBrandImg: true,
        src: logoEl.getAttribute('src') || '',
        title: li?.querySelector('strong')?.textContent?.trim() || logoEl.getAttribute('alt') || '',
        alt: logoEl.getAttribute('alt') || '',
        chipW: chipR.width,
        chipH: chipR.height,
        imgW: logoEl.getBoundingClientRect().width,
        imgH: logoEl.getBoundingClientRect().height,
        naturalWidth: logoEl.naturalWidth,
        naturalHeight: logoEl.naturalHeight,
        computed: {
          imgMargin: getComputedStyle(logoEl).margin,
          imgObjectPosition: getComputedStyle(logoEl).objectPosition,
          chipDisplay: getComputedStyle(chipEl).display,
        },
      };
    });
  });

  const cropBuffers = [];
  const gradedRows = [];
  for (const desc of descriptors) {
    const imgHandle = await page.$(`img.tiny-logo[data-ts-logo-img-idx="${desc.index}"]`);
    let com = { error: 'img_handle_missing' };
    let cropBuf = null;
    if (imgHandle) {
      cropBuf = await imgHandle.screenshot({ type: 'png' });
      com = await measureLogoComFromPngBuffer(cropBuf);
      if (cropBuf) cropBuffers.push(cropBuf);
      await imgHandle.dispose();
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

  const brandCount = gradedRows.filter((r) => isRealBrandLogoSrc(r.src)).length;
  const viewportPass = brandCount > 0 && gradedRows.every((r) => {
    const com = r.com || {};
    return !com.error && Number(com.dxPx) <= 1.5 && Number(com.dyPx) <= 1.5;
  });
  return {
    viewportWidth,
    clicked,
    rows: gradedRows,
    brandImgCount: brandCount,
    cropBuffers,
    pass: Boolean(clicked) && viewportPass,
    failReason: !clicked ? 'tab_not_clicked' : (brandCount === 0 ? 'zero_brand_imgs_with_real_src' : null),
  };
}

export async function sharedLogoTabCheck(page, tabKeyword, sharedApiJson) {
  const logoUrlEvidence = gradeSharedTabLogoUrlRecords(sharedApiJson, tabKeyword);
  const viewports = {};
  let rows = [];
  let cropBuffers = [];
  let clicked = false;
  for (const width of LOGO_VIEWPORT_WIDTHS) {
    const slice = await sharedLogoChipMetricsAtViewport(page, tabKeyword, width);
    viewports[width] = slice;
    if (width === LOGO_VIEWPORT_WIDTHS[0]) {
      rows = slice.rows;
      cropBuffers = slice.cropBuffers || [];
      clicked = slice.clicked;
    }
  }
  let carIconGrade = null;
  if (String(tabKeyword).toLowerCase() === 'cars') {
    await page.setViewport({ width: LOGO_VIEWPORT_WIDTHS[0], height: 900 });
    await clickSharedTabByKeyword(page, 'cars');
    await new Promise((r) => setTimeout(r, 800));
    carIconGrade = gradeCarTabRowIcons(await collectCarTabIconScan(page));
  }
  const tabResult = gradeLogoTabResult({
    tab: tabKeyword,
    clicked,
    rows,
    cssSuspects: mergeLogoCssSuspects(rows),
    logoUrlEvidence,
    viewports,
    carIconGrade,
  });
  return { ...tabResult, cropBuffers };
}
