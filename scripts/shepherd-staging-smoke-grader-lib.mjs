/** Coffee + logo chip graders for staging smoke. */

function coffeePlaceEvidenceFromPersistedRow(row = {}) {
  const name = String(row.name || row.title || '').trim();
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const category = String(
    row.category
    || row.categoryName
    || row.category_name
    || meta.categoryName
    || meta.category
    || row.sourceRecord?.categoryName
    || '',
  ).toLowerCase();
  const tags = row.tags || row.osmTags || meta.tags || meta.osmTags || row.source?.tags || row.raw?.tags || {};
  const amenity = String(tags.amenity || meta.amenity || '').toLowerCase();
  const cuisine = String(tags.cuisine || meta.cuisine || '').toLowerCase();
  const braveCategory = String(row.sourceRecord?.categoryName || meta.sourceRecord?.categoryName || '').toLowerCase();
  const evidence = [];
  if (name && /\bcafe\b|coffee|espresso|roaster|latte/i.test(name)) evidence.push('name');
  if (category && /\bcafe\b|coffee|coffeeshop|coffee_shop/.test(category)) evidence.push('category');
  if (amenity === 'cafe') evidence.push('osm:amenity=cafe');
  if (cuisine.includes('coffee') || cuisine === 'coffee_shop') evidence.push('osm:cuisine=coffee');
  if (braveCategory && /\bcafe\b|coffee/.test(braveCategory)) evidence.push('brave:category');
  const hasPersistedFields = Boolean(name || category || amenity || cuisine || braveCategory
    || (tags && typeof tags === 'object' && Object.keys(tags).length > 0));
  return {
    ok: evidence.length > 0,
    evidence,
    harnessMissing: !hasPersistedFields,
    fields: { name, category, amenity, cuisine, braveCategory },
  };
}

export function gradeCoffeeReplyRows(rows = []) {
  let harnessError = false;
  const graded = (rows || []).map((row) => {
    const { ok, evidence, harnessMissing, fields } = coffeePlaceEvidenceFromPersistedRow(row);
    if (harnessMissing) harnessError = true;
    return {
      name: row.name || row.title || null,
      ok: harnessMissing ? null : ok,
      evidence,
      harnessMissing,
      fields,
      source: row.provider || row.source || null,
    };
  });
  const failures = graded.filter((r) => r.harnessMissing !== true && r.ok === false);
  return {
    rows: graded,
    failures,
    harnessError,
    pass: !harnessError && rows.length > 0 && failures.length === 0,
  };
}

/** Budget tab must not show dollar amounts absent from API budget lines. */

export const LOGO_CENTER_TOLERANCE_PX = 2;

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

/** Grade one logo chip row (geometry + center-of-mass); FAIL if either check fails. */
export function gradeLogoChipRow(row = {}) {
  const geometry = gradeLogoChipGeometry(row);
  const comGrade = gradeLogoChipCom(row);
  const pass = geometry.geometryCentered && comGrade.comCentered;
  return {
    ...row,
    ...geometry,
    ...comGrade,
    pass,
  };
}

export function gradeLogoTabResult({ tab, clicked, rows = [], cssSuspects = [] }) {
  const graded = (rows || []).map((r) => gradeLogoChipRow(r));
  const pass = Boolean(clicked) && graded.length > 0 && graded.every((r) => r.pass);
  return { tab, clicked, rows: graded, pass, cssSuspects };
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

const LODGING_QUESTION_WORDS = /\b(stay(?:ing)?|lodging|hotels?|condo|rental|accommodations?)\b/i;

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

export function replyHasLodgingQuestion(replyText) {
  const hay = String(replyText || '');
  const chunks = hay.split(/(?<=[.!?])\s+/).filter((part) => part.includes('?'));
  if (!chunks.length && hay.includes('?')) chunks.push(hay);
  return chunks.some((sentence) => LODGING_QUESTION_WORDS.test(sentence));
}

export function gradeAskLodging({ replyText, payload, turnJson, hotelCount }) {
  const signals = persistedLodgingAskSignals(payload, turnJson);
  const replyEvidence = String(replyText || '');
  const replyLodgingQuestion = replyHasLodgingQuestion(replyEvidence);
  const hotelN = Number(hotelCount);
  const pass = hotelN === 0 && signals.persistedLodgingAsk && replyLodgingQuestion;
  return {
    pass,
    evidence: {
      replyText: replyEvidence.slice(0, 2000),
      hotelCount: hotelN,
      replyLodgingQuestion,
      ...signals,
    },
  };
}

export function gradeAskD2NoQuestionReply(replyText) {
  const replyEvidence = String(replyText || '');
  const hasQuestionMark = replyEvidence.includes('?');
  const whichLocation = /\bwhich\b[^?\n]{0,120}\blocation\b/i.test(replyEvidence);
  const pass = !hasQuestionMark && !whichLocation;
  return {
    pass,
    evidence: {
      replyText: replyEvidence.slice(0, 2000),
      hasQuestionMark,
      whichLocation,
    },
  };
}
