import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import {
  gradeLeafletProductMap,
  gradeMapBar,
  gradeLogoTabResult,
  mergeLogoCssSuspects,
  attributeLogoMisalignmentCss,
} from './shepherd-staging-smoke-lib.mjs';
import {
  configureSharedUiMapHelpers,
  mapSharedTripState,
  sharedBudgetTabCheck,
  clickSharedTabByKeyword,
} from './shepherd-staging-smoke-shared-ui-map.mjs';

let BASE = 'https://vacation-staging.timesyncher.com';

export function configureSharedUiHelpers(cfg) {
  configureSharedUiMapHelpers(cfg);
  if (cfg?.BASE) BASE = cfg.BASE;
}

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

async function measureLogoComInPage(page, chipHandle) {
  const buf = await chipHandle.screenshot({ type: 'png' });
  return measureLogoComFromPngBuffer(buf);
}

async function stitchLogoChipCropsPng(cropBuffers, outPath) {
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

async function sharedLogoChipMetrics(page, tabKeyword) {
  const clicked = await clickSharedTabByKeyword(page, tabKeyword);
  await new Promise((r) => setTimeout(r, 1200));
  const descriptors = await page.evaluate(() => {
    function rowTextFromParent(el) {
      return el.parentElement?.innerText || '';
    }
    function parsePx(value) {
      const n = parseFloat(String(value || '0'));
      return Number.isFinite(n) ? n : 0;
    }
    function visibleChipBox(logoEl) {
      let el = logoEl;
      for (let depth = 0; depth < 8 && el; depth += 1) {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) {
          el = el.parentElement;
          continue;
        }
        const borderSum = parsePx(cs.borderTopWidth) + parsePx(cs.borderBottomWidth)
          + parsePx(cs.borderLeftWidth) + parsePx(cs.borderRightWidth);
        const bg = cs.backgroundColor || '';
        const hasBg = bg && !/transparent|rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg);
        const isLogoImg = el === logoEl && logoEl.tagName === 'IMG';
        if (borderSum > 0 || hasBg || isLogoImg) {
          return { el, r, cs };
        }
        el = el.parentElement;
      }
      const r = logoEl.getBoundingClientRect();
      return { el: logoEl, r, cs: getComputedStyle(logoEl) };
    }
    function contentBoxForLogo(logoEl, chipR) {
      if (logoEl.tagName === 'IMG') {
        const cs = getComputedStyle(logoEl);
        const ir = logoEl.getBoundingClientRect();
        const pl = parsePx(cs.paddingLeft);
        const pr = parsePx(cs.paddingRight);
        const pt = parsePx(cs.paddingTop);
        const pb = parsePx(cs.paddingBottom);
        return {
          naturalWidth: logoEl.naturalWidth,
          naturalHeight: logoEl.naturalHeight,
          objectFit: cs.objectFit || 'contain',
          boxLeft: ir.left + pl,
          boxTop: ir.top + pt,
          boxWidth: Math.max(0, ir.width - pl - pr),
          boxHeight: Math.max(0, ir.height - pt - pb),
          imgPaddingPx: { left: pl, right: pr, top: pt, bottom: pb },
        };
      }
      if (logoEl instanceof SVGElement) {
        let bbox = null;
        try {
          bbox = logoEl.getBBox();
        } catch {
          bbox = null;
        }
        const sr = logoEl.getBoundingClientRect();
        if (bbox && bbox.width > 0 && bbox.height > 0) {
          const sx = sr.width / (bbox.width || 1);
          const sy = sr.height / (bbox.height || 1);
          const drawW = bbox.width * sx;
          const drawH = bbox.height * sy;
          const left = sr.left + (sr.width - drawW) / 2 + bbox.x * sx;
          const top = sr.top + (sr.height - drawH) / 2 + bbox.y * sy;
          return {
            naturalWidth: drawW,
            naturalHeight: drawH,
            objectFit: 'none',
            boxLeft: left,
            boxTop: top,
            boxWidth: drawW,
            boxHeight: drawH,
          };
        }
        return {
          naturalWidth: sr.width,
          naturalHeight: sr.height,
          objectFit: 'contain',
          boxLeft: sr.left,
          boxTop: sr.top,
          boxWidth: sr.width,
          boxHeight: sr.height,
        };
      }
      return null;
    }
    function isChromeImg(el) {
      return /timesyncher-icon/i.test(String(el?.src || el?.getAttribute?.('src') || ''));
    }
    function contentBoxForGlyph(el) {
      const ir = el.getBoundingClientRect();
      return {
        naturalWidth: ir.width,
        naturalHeight: ir.height,
        objectFit: 'contain',
        boxLeft: ir.left,
        boxTop: ir.top,
        boxWidth: ir.width,
        boxHeight: ir.height,
      };
    }
    function collectLogoChipElements() {
      const chips = [];
      const seen = new Set();
      const addChip = (chipEl, logoEl) => {
        if (!chipEl || !logoEl || seen.has(chipEl)) return;
        seen.add(chipEl);
        chips.push({ chipEl, logoEl });
      };
      for (const chipEl of document.querySelectorAll('span[aria-hidden="true"]')) {
        const r = chipEl.getBoundingClientRect();
        if (r.width < 24 || r.width > 44 || r.height < 24 || r.height > 44) continue;
        if (r.top < 90 || r.bottom > window.innerHeight + 2) continue;
        const row = chipEl.parentElement;
        const rowText = (row?.innerText || '').replace(/\s+/g, ' ').trim();
        if (!row || rowText.length < 4) continue;
        const img = chipEl.querySelector('img,svg');
        if (img && !isChromeImg(img)) {
          addChip(chipEl, img);
          continue;
        }
        const glyph = chipEl.querySelector('span span') || chipEl.querySelector('span');
        if (glyph) addChip(chipEl, glyph);
      }
      for (const logoEl of document.querySelectorAll(
        'li[data-has-logo="1"] img.tiny-logo, li[data-list-row="1"] img.tiny-logo, img.tiny-logo',
      )) {
        if (isChromeImg(logoEl)) continue;
        const r = logoEl.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || logoEl.offsetParent === null) continue;
        const { el: chipEl } = visibleChipBox(logoEl);
        addChip(chipEl, logoEl);
      }
      return chips;
    }
    const logoImgs = collectLogoChipElements();
    const rows = [];
    logoImgs.forEach(({ chipEl, logoEl }, index) => {
      const chipR = chipEl.getBoundingClientRect();
      const chipCs = getComputedStyle(chipEl);
      const contentInput = contentBoxForLogo(logoEl, chipR)
        || contentBoxForGlyph(logoEl);
      if (!contentInput) return;
      const li = logoEl.closest('li[data-list-row], li[data-has-logo], li');
      const flexRow = chipEl.closest('[style*="flex"]') || chipEl.parentElement;
      const liCs = flexRow ? getComputedStyle(flexRow) : (li ? getComputedStyle(li) : null);
      const chipCx = chipR.left + chipR.width / 2;
      const chipCy = chipR.top + chipR.height / 2;
      const fit = contentInput.objectFit || 'contain';
      const nw = contentInput.naturalWidth;
      const nh = contentInput.naturalHeight;
      const bw = contentInput.boxWidth;
      const bh = contentInput.boxHeight;
      let drawW = bw;
      let drawH = bh;
      if (nw > 0 && nh > 0) {
        if (fit === 'contain' || fit === 'scale-down') {
          const scale = Math.min(bw / nw, bh / nh);
          drawW = nw * scale;
          drawH = nh * scale;
        } else if (fit === 'cover') {
          const scale = Math.max(bw / nw, bh / nh);
          drawW = nw * scale;
          drawH = nh * scale;
        }
      }
      const contentLeft = contentInput.boxLeft + (bw - drawW) / 2;
      const contentTop = contentInput.boxTop + (bh - drawH) / 2;
      const contentCx = contentLeft + drawW / 2;
      const contentCy = contentTop + drawH / 2;
      const padLeft = contentLeft - chipR.left;
      const padRight = chipR.right - (contentLeft + drawW);
      const padTop = contentTop - chipR.top;
      const padBottom = chipR.bottom - (contentTop + drawH);
      const title = li?.querySelector('strong')?.textContent?.trim()
        || (flexRow?.innerText || rowTextFromParent(chipEl)).replace(/\s+/g, ' ').trim().slice(0, 80)
        || logoEl.getAttribute('alt')
        || '';
      chipEl.setAttribute('data-ts-logo-chip-idx', String(index));
      rows.push({
        index,
        title,
        alt: logoEl.getAttribute('alt') || '',
        chipW: chipR.width,
        chipH: chipR.height,
        imgW: contentInput.boxWidth,
        imgH: contentInput.boxHeight,
        naturalWidth: nw,
        naturalHeight: nh,
        objectFit: fit,
        contentCenterDxPx: Math.abs(contentCx - chipCx),
        contentCenterDyPx: Math.abs(contentCy - chipCy),
        paddingAsymmetryPx: {
          left: padLeft,
          right: padRight,
          top: padTop,
          bottom: padBottom,
        },
        computed: {
          liAlignItems: liCs?.alignItems || null,
          chipDisplay: chipCs.display,
          imgMargin: getComputedStyle(logoEl).margin,
          imgPadding: getComputedStyle(logoEl).padding,
          imgObjectPosition: getComputedStyle(logoEl).objectPosition,
          chipPaddingPx: parsePx(getComputedStyle(logoEl).paddingTop),
        },
      });
    });
    return rows;
  });

  const cropBuffers = [];
  const gradedRows = [];
  for (const desc of descriptors) {
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
      dx: desc.contentCenterDxPx,
      dy: desc.contentCenterDyPx,
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

  const tabResult = gradeLogoTabResult({
    tab: tabKeyword,
    clicked,
    rows: gradedRows,
    cssSuspects: mergeLogoCssSuspects(gradedRows),
  });
  return { ...tabResult, cropBuffers };
}

export async function runSharedSiteLogoBarChecks({
  page,
  mapUrl,
  sharedApi,
  artifactPath = (name) => `/opt/cursor/artifacts/${name}`,
}) {
  if (mapUrl) {
    await page.goto(mapUrl, { waitUntil: 'networkidle2', timeout: 120000 });
    await new Promise((r) => setTimeout(r, 2500));
  }
  const logoShot = artifactPath('shared-logo-chips.png');
  const logoCropsPath = '/opt/cursor/artifacts/logo-chips-crops.png';
  const logoHotels = mapUrl
    ? await sharedLogoChipMetrics(page, 'hotels')
    : { pass: false, rows: [], clicked: false, cssSuspects: [], cropBuffers: [] };
  const logoCars = mapUrl
    ? await sharedLogoChipMetrics(page, 'cars')
    : { pass: false, rows: [], clicked: false, cssSuspects: [], cropBuffers: [] };
  if (logoHotels.clicked || logoCars.clicked) await page.screenshot({ path: logoShot, fullPage: true });
  const allCropBuffers = [...(logoHotels.cropBuffers || []), ...(logoCars.cropBuffers || [])];
  const logoCropsWritten = allCropBuffers.length
    ? await stitchLogoChipCropsPng(allCropBuffers, logoCropsPath)
    : null;
  const logoCssSuspects = mergeLogoCssSuspects([...logoHotels.rows, ...logoCars.rows]);
  const logoPass = logoHotels.pass && logoCars.pass && logoHotels.clicked && logoCars.clicked;
  return {
    checkLOGO: {
      hotels: logoHotels,
      cars: logoCars,
      logoShot: (logoHotels.rows.length || logoCars.rows.length) ? logoShot : null,
      logoCropsPath: logoCropsWritten,
      cssSuspects: logoCssSuspects,
      sharedApiPlaces: (sharedApi?.json?.places || []).length,
    },
    pass: logoPass,
  };
}

export async function runSharedSiteMapBudLogoChecks({
  page,
  mapUrl,
  publicUrlAfterH,
  shareSlug,
  sharedApi,
  artifactPath,
}) {
  let mapCapture = { mapUrl, mapState: null, productMapState: null, mapConsoleErrors: [] };
  if (mapUrl) mapCapture = { mapUrl, ...(await mapSharedTripState(page, mapUrl)) };
  const mapShot = artifactPath('trip-map.png');
  await page.screenshot({ path: mapShot, fullPage: true });
  const budgetShot = artifactPath('shared-budget.png');
  const budgetCheck = mapUrl
    ? await sharedBudgetTabCheck(page, sharedApi?.json?.budget || [])
    : { tabPresent: false, clicked: false, hardcoded: [], pageErrors: {} };
  if (budgetCheck.clicked) await page.screenshot({ path: budgetShot, fullPage: true });
  const logoShot = artifactPath('shared-logo-chips.png');
  const logoCropsPath = '/opt/cursor/artifacts/logo-chips-crops.png';
  const logoHotels = mapUrl
    ? await sharedLogoChipMetrics(page, 'hotels')
    : { pass: false, rows: [], clicked: false, cssSuspects: [], cropBuffers: [] };
  const logoCars = mapUrl
    ? await sharedLogoChipMetrics(page, 'cars')
    : { pass: false, rows: [], clicked: false, cssSuspects: [], cropBuffers: [] };
  if (logoHotels.clicked || logoCars.clicked) await page.screenshot({ path: logoShot, fullPage: true });
  const allCropBuffers = [...(logoHotels.cropBuffers || []), ...(logoCars.cropBuffers || [])];
  const logoCropsWritten = allCropBuffers.length
    ? await stitchLogoChipCropsPng(allCropBuffers, logoCropsPath)
    : null;
  const sharedHtml = await page.content();
  const productMapGrade = gradeLeafletProductMap(mapCapture.productMapState, mapCapture.mapConsoleErrors);
  const mapGrade = gradeMapBar(mapCapture.mapState, mapCapture.mapConsoleErrors);
  const placesOk = (sharedApi?.json?.places || []).length >= 1;
  const budPass = Boolean(publicUrlAfterH) && placesOk && budgetCheck.tabPresent && budgetCheck.clicked
    && budgetCheck.hardcoded.length === 0 && !budgetCheck.pageErrors?.mapError;
  const logoCssSuspects = mergeLogoCssSuspects([...logoHotels.rows, ...logoCars.rows]);
  const logoPass = logoHotels.pass && logoCars.pass && logoHotels.clicked && logoCars.clicked;
  const mapPass = Boolean(publicUrlAfterH) && placesOk && productMapGrade.pass;
  return {
    mapShot,
    budgetShot: budgetCheck.clicked ? budgetShot : null,
    logoShot: (logoHotels.rows.length || logoCars.rows.length) ? logoShot : null,
    sharedHtml,
    checkMAP: {
      publicUrl: publicUrlAfterH,
      shareSlug,
      sharedApiPlaces: (sharedApi?.json?.places || []).length,
      mapCapture,
      productMapGrade,
      mapGrade,
      mapShot,
    },
    checkBUD: {
      budgetCheck,
      budgetShot: budgetCheck.clicked ? budgetShot : null,
      apiBudgetLines: (sharedApi?.json?.budget || []).length,
    },
    checkLOGO: {
      hotels: logoHotels,
      cars: logoCars,
      logoShot: (logoHotels.rows.length || logoCars.rows.length) ? logoShot : null,
      logoCropsPath: logoCropsWritten,
      cssSuspects: logoCssSuspects,
    },
    checks: { MAP: mapPass ? 'PASS' : 'FAIL', BUD: budPass ? 'PASS' : 'FAIL', LOGO: logoPass ? 'PASS' : 'FAIL' },
  };
}

