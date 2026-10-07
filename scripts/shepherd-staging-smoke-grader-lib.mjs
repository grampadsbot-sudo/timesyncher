/** Coffee + logo chip graders for staging smoke. */

import {
  gradeCarsHeadingLogoInk,
  gradeLogoChipInkPresence,
  logoChipInkPresent,
} from './lib/logo-pixel-ink-grade.mjs';

function coffeeRowLabel(row = {}) {
  return String(row.name || row.title || row.placeName || row.displayName || row.label || '').trim();
}

export async function gradeCoffeeReplyRows(rows = [], opts = {}) {
  const { gradeCoffeePlaceRowByJev } = await import('./shepherd-staging-smoke-jev-reply-judge.mjs');
  let harnessError = false;
  const graded = [];
  for (const row of rows || []) {
    const name = coffeeRowLabel(row) || null;
    const rowGrade = await gradeCoffeePlaceRowByJev(row, opts);
    if (rowGrade.harnessMissing) harnessError = true;
    graded.push({
      name,
      ok: rowGrade.harnessMissing ? null : rowGrade.pass,
      jev: rowGrade.jev,
      harnessMissing: rowGrade.harnessMissing,
      source: row.provider || row.source || null,
    });
  }
  const failures = graded.filter((r) => r.harnessMissing !== true && r.ok === false);
  return {
    rows: graded,
    failures,
    harnessError,
    pass: !harnessError && rows.length > 0 && failures.length === 0,
  };
}

/** Budget tab must not show dollar amounts absent from planned lines and saved __budgetTargets. */

export const LOGO_CENTER_TOLERANCE_PX = 1.5;

export function isRealBrandLogoSrc(src) {
  const value = String(src || '').trim();
  if (!value) return false;
  if (/timesyncher-icon/i.test(value)) return false;
  if (/^data:image\/svg/i.test(value)) return false;
  return true;
}

function placeMatchesLogoTab(place = {}, tabKeyword = '') {
  const tab = String(tabKeyword || '').toLowerCase();
  const name = String(place.name || place.title || '').trim();
  const category = String(place.category_name || place.category || '').toLowerCase();
  const hay = `${name} ${category}`;
  if (tab === 'hotels' || tab === 'hotel') {
    return /hotel|lodging|resort|stay/i.test(hay);
  }
  if (tab === 'cars' || tab === 'car') {
    return /\bcar\b|rental|hertz|alamo|avis|enterprise|budget/i.test(hay);
  }
  return false;
}

/** Shared API places for a tab must carry logoUrl in thingOverrides (or place). */
export function gradeSharedTabLogoUrlRecords(sharedJson = {}, tabKeyword = '') {
  const places = Array.isArray(sharedJson?.places) ? sharedJson.places : [];
  const overrides = sharedJson?.thingOverrides && typeof sharedJson.thingOverrides === 'object'
    ? sharedJson.thingOverrides
    : {};
  const relevant = places.filter((place) => placeMatchesLogoTab(place, tabKeyword));
  const records = relevant.map((place) => {
    const key = `place:${place.id}`;
    const override = overrides[key] && typeof overrides[key] === 'object' ? overrides[key] : {};
    const logoUrl = String(override.logoUrl || place.logoUrl || '').trim();
    return {
      id: place.id,
      name: place.name || place.title || null,
      category: place.category_name || null,
      logoUrl: logoUrl || null,
      hasLogoUrl: Boolean(logoUrl),
    };
  });
  const missing = records.filter((row) => !row.hasLogoUrl);
  return {
    tab: tabKeyword,
    placeCount: records.length,
    records,
    missingLogoUrl: missing,
    missingLogoUrlCount: missing.length,
    ok: records.length > 0 && missing.length === 0,
    failReason: records.length === 0 ? 'no_tab_places_in_shared_api' : (missing.length ? 'records_missing_logoUrl' : null),
  };
}

export function gradeCarTabRowIcons(iconScan = {}) {
  const rowCount = Number(iconScan.rowCount) || 0;
  const hasPlane = iconScan.hasPlane === true;
  const hasCar = iconScan.hasCar === true;
  const pass = !hasPlane && (rowCount === 0 || hasCar);
  return {
    pass,
    hasPlane,
    hasCar,
    rowCount,
    samples: iconScan.samples || [],
  };
}

/** Pixel box of drawn image content inside a CSS object-fit box (viewport coords). */
export function objectFitContentBox({
  boxLeft,
  boxTop,
  boxWidth,
  boxHeight,
  naturalWidth,
  naturalHeight,
  objectFit = 'contain',
}) {
  const nw = Number(naturalWidth);
  const nh = Number(naturalHeight);
  const bw = Number(boxWidth);
  const bh = Number(boxHeight);
  if (!Number.isFinite(bw) || !Number.isFinite(bh) || bw <= 0 || bh <= 0) {
    return null;
  }
  if (!Number.isFinite(nw) || !Number.isFinite(nh) || nw <= 0 || nh <= 0) {
    return {
      left: boxLeft,
      top: boxTop,
      width: bw,
      height: bh,
      centerX: boxLeft + bw / 2,
      centerY: boxTop + bh / 2,
    };
  }
  const fit = String(objectFit || 'fill').toLowerCase();
  let drawW = bw;
  let drawH = bh;
  if (fit === 'contain' || fit === 'scale-down') {
    const scale = Math.min(bw / nw, bh / nh);
    drawW = nw * scale;
    drawH = nh * scale;
  } else if (fit === 'cover') {
    const scale = Math.max(bw / nw, bh / nh);
    drawW = nw * scale;
    drawH = nh * scale;
  } else if (fit === 'none') {
    drawW = nw;
    drawH = nh;
  }
  const left = boxLeft + (bw - drawW) / 2;
  const top = boxTop + (bh - drawH) / 2;
  return {
    left,
    top,
    width: drawW,
    height: drawH,
    centerX: left + drawW / 2,
    centerY: top + drawH / 2,
  };
}

function gradeLogoChipGeometry(row = {}) {
  const tol = LOGO_CENTER_TOLERANCE_PX;
  const dx = Number(row.contentCenterDxPx ?? row.dx);
  const dy = Number(row.contentCenterDyPx ?? row.dy);
  const pad = row.paddingAsymmetryPx || {};
  const padDeltaX = Math.abs(Number(pad.left ?? 0) - Number(pad.right ?? 0));
  const padDeltaY = Math.abs(Number(pad.top ?? 0) - Number(pad.bottom ?? 0));
  const geometryCentered = Number.isFinite(dx) && Number.isFinite(dy)
    && dx <= tol && dy <= tol
    && padDeltaX <= tol && padDeltaY <= tol;
  return {
    geometryCentered,
    dx,
    dy,
    paddingAsymmetryPx: pad,
    padDeltaX,
    padDeltaY,
  };
}

function gradeLogoChipCom(row = {}) {
  const tol = LOGO_CENTER_TOLERANCE_PX;
  const com = row.com || {};
  if (com.error) {
    return { comCentered: false, comError: com.error, comDx: null, comDy: null };
  }
  const comDx = Number(com.dxPx);
  const comDy = Number(com.dyPx);
  const comCentered = Number.isFinite(comDx) && Number.isFinite(comDy)
    && comDx <= tol && comDy <= tol;
  return { comCentered, comError: null, comDx, comDy };
}

/** Grade one brand logo chip row (center-of-mass of img inside chip). */
export function gradeLogoChipRow(row = {}) {
  const geometry = gradeLogoChipGeometry(row);
  const comGrade = gradeLogoChipCom(row);
  const inkGrade = gradeLogoChipInkPresence(row.com || {});
  const brandImg = row.isBrandImg === true && isRealBrandLogoSrc(row.src);
  const pass = inkGrade.inkPresent === true
    && (!brandImg || comGrade.comCentered === true);
  return {
    ...row,
    ...geometry,
    ...comGrade,
    ...inkGrade,
    pass,
  };
}

function listRowLogoChipRows(rows = []) {
  return (rows || []).filter((row) => row && row.isListRowChip === true);
}

function countBrandLogoRowsWithInk(rows = []) {
  return (rows || []).filter((r) => r.isBrandImg === true && isRealBrandLogoSrc(r.src) && logoChipInkPresent(r.com)).length;
}

function gradeCarsHeadingInkForViewports(viewports = {}) {
  const byWidth = {};
  let pass = true;
  let failReason = null;
  for (const [width, viewport] of Object.entries(viewports || {})) {
    const grade = viewport?.carsHeadingInk || { pass: false, reason: 'missing_cars_heading_ink' };
    byWidth[width] = grade;
    if (!grade.pass) {
      pass = false;
      failReason = failReason || grade.reason || 'cars_heading_logo_off_center';
    }
  }
  return { pass, failReason: pass ? null : failReason, byWidth };
}

export function gradeLogoTabResult({
  tab,
  clicked,
  rows = [],
  cssSuspects = [],
  logoUrlEvidence = null,
  viewports = null,
  carsHeadingInk = null,
}) {
  const chipRows = listRowLogoChipRows(rows);
  const graded = chipRows.map((r) => gradeLogoChipRow(r));
  const brandInkCount = countBrandLogoRowsWithInk(graded);
  const emptyChips = graded.filter((r) => !logoChipInkPresent(r.com));
  const isCars = String(tab || '').toLowerCase() === 'cars';
  const carsHeadingGrade = isCars
    ? (carsHeadingInk || gradeCarsHeadingInkForViewports(viewports))
    : null;
  let failReason = null;
  if (!clicked) failReason = 'tab_not_clicked';
  else if (chipRows.length === 0) failReason = 'zero_list_row_logo_chips';
  else if (emptyChips.length > 0) failReason = 'empty_logo_chip';
  else if (logoUrlEvidence && logoUrlEvidence.ok === false) failReason = logoUrlEvidence.failReason || 'records_missing_logoUrl';
  else if (viewports && Object.values(viewports).some((v) => v && v.pass === false)) failReason = 'viewport_logo_fail';
  else if (carsHeadingGrade && carsHeadingGrade.pass === false) {
    failReason = carsHeadingGrade.failReason || 'cars_heading_logo_off_center';
  }
  else if (!graded.every((r) => r.pass)) failReason = 'logo_com_off_center';

  const pass = !failReason;
  return {
    tab,
    clicked,
    rows: graded,
    brandImgCount: brandInkCount,
    listRowChipCount: chipRows.length,
    logoUrlEvidence,
    viewports,
    carsHeadingInk: carsHeadingGrade,
    failReason,
    pass,
    cssSuspects,
  };
}

/** Map computed layout hints to likely source files (harness attribution, not runtime). */
export function attributeLogoMisalignmentCss(computed = {}) {
  const suspects = [];
  const liAlign = String(computed.liAlignItems || '');
  const chipDisplay = String(computed.chipDisplay || '');
  const imgMargin = String(computed.imgMargin || '');
  const imgPadding = String(computed.imgPadding || '');
  const imgObjectPosition = String(computed.imgObjectPosition || '');

  if (liAlign === 'flex-start') {
    suspects.push({
      file: 'src/vacation/trek-style2-bundle.mjs',
      line: 51,
      rule: 'W_LIST_PATCH inline style align-items:flex-start on li[data-list-row]',
    });
  }
  if (/padding:\s*3|padding:3/.test(imgPadding) || computed.chipPaddingPx === 3) {
    suspects.push({
      file: 'src/vacation/trek-live-product-patches.mjs',
      line: 47,
      rule: 'THING_LOGO_CHIP_PATCH img padding:3 (asymmetric inset vs centered glyph)',
    });
  }
  if (/\bauto\b/.test(imgMargin)) {
    suspects.push({
      file: 'shared-app.html',
      line: 78,
      rule: 'img.tiny-logo { margin: 0 auto !important; }',
    });
  }
  if (imgObjectPosition && !/center|50%\s*50%/.test(imgObjectPosition)) {
    suspects.push({
      file: 'shared-app.html',
      line: 76,
      rule: `img.tiny-logo object-position: ${imgObjectPosition}`,
    });
  }
  if (chipDisplay && chipDisplay !== 'flex' && chipDisplay !== 'inline-flex') {
    suspects.push({
      file: 'shared-app.html',
      line: 70,
      rule: `img.tiny-logo display:${chipDisplay} (expected flex centering on chip)`,
    });
  }
  return suspects;
}

export function mergeLogoCssSuspects(rows = []) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    for (const s of row.cssSuspects || []) {
      const key = `${s.file}:${s.line}:${s.rule}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

/** Persisted per-fact lodging ask flags on a customer/app turn payload or turn JSON. */
export function persistedLodgingAskSignals(payload = {}, turnJson = {}) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const j = turnJson && typeof turnJson === 'object' ? turnJson : {};
  const tripContext = p.tripContext || p.liveTranscript?.tripContext || j.tripContext || {};
  const customerInputState = p.customerInputState || j.customerInputState || tripContext.customerInputState || {};
  const needsRaw = customerInputState.needsCustomerInput
    ?? tripContext.needsCustomerInput
    ?? p.needsCustomerInput
    ?? j.needsCustomerInput;
  const needsCustomerInput = Array.isArray(needsRaw) ? needsRaw.map((item) => String(item)) : [];
  const lodgingAsk = tripContext.lodgingAsk === true
    || customerInputState.lodgingAsk === true
    || p.lodgingAsk === true
    || j.lodgingAsk === true;
  const needsLodging = needsCustomerInput.includes('lodging');
  return {
    lodgingAsk,
    needsCustomerInput,
    needsLodging,
    persistedLodgingAsk: lodgingAsk || needsLodging,
    tripContext,
    customerInputState,
  };
}

export async function gradeAskLodging({
  replyText,
  payload,
  turnJson,
  hotelCount,
  customerTurn = 'Maui March 10-17 2027 with my wife',
  judgeFn,
  env,
  fetchImpl,
}) {
  const { gradeAskLodgingReplyQuestion, jevBlockFromResult } = await import('./shepherd-staging-smoke-jev-reply-judge.mjs');
  const signals = persistedLodgingAskSignals(payload, turnJson);
  const replyEvidence = String(replyText || '');
  const replyGrade = await gradeAskLodgingReplyQuestion(replyEvidence, {
    customerTurn,
    judgeFn,
    env,
    fetchImpl,
  });
  const hotelN = Number(hotelCount);
  const jev = jevBlockFromResult(replyGrade.jev, {
    questionKey: 'asks_where_staying',
    customerTurn,
    replyExcerpt: replyEvidence,
  });
  const pass = hotelN === 0 && signals.persistedLodgingAsk && replyGrade.pass;
  return {
    pass,
    jev,
    evidence: {
      replyText: replyEvidence.slice(0, 2000),
      hotelCount: hotelN,
      replyLodgingQuestion: jev.verdict === 'yes',
      ...signals,
    },
  };
}
