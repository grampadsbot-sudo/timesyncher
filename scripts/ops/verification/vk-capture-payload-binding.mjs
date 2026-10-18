import { readFileSync } from 'node:fs';

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function dataText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function blank(value) {
  return value === null || value === undefined || value === '' || value === [] || value === {};
}

function rowId(v) {
  if (!v || typeof v !== 'object') return '';
  for (const k of ['id', 'placeId', 'rowId']) {
    if (v[k] != null) return String(v[k]);
  }
  return '';
}

function captureRows(fixtureObj) {
  if (!fixtureObj || typeof fixtureObj !== 'object') return {};
  if (Array.isArray(fixtureObj.places)) {
    const out = {};
    for (const p of fixtureObj.places) {
      if (p && typeof p === 'object' && p.id != null) out[String(p.id)] = p;
    }
    return out;
  }
  for (const k of ['searchPlaces', 'things', 'rows']) {
    const v = fixtureObj[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const out = {};
      for (const [rid, p] of Object.entries(v)) {
        if (p && typeof p === 'object') out[String(rid)] = p;
      }
      return out;
    }
    if (Array.isArray(v)) {
      const out = {};
      for (const p of v) {
        const id = rowId(p);
        if (id) out[id] = p;
      }
      return out;
    }
  }
  return {};
}

function effectiveCaptureRow(fixtureObj, rid, row) {
  const merged = row && typeof row === 'object' ? { ...row } : {};
  const patches = [];
  if (fixtureObj && typeof fixtureObj === 'object') {
    const top = fixtureObj.thingOverrides;
    if (top && typeof top === 'object') {
      const hit = top[String(rid)];
      if (hit && typeof hit === 'object') patches.push(hit);
    }
  }
  const inner = merged.thingOverrides;
  if (inner && typeof inner === 'object') {
    const hit = inner[String(rid)];
    if (hit && typeof hit === 'object') patches.push(hit);
    else if (
      ['summary', 'description', 'logoUrl', 'price', 'title', 'name', 'lat', 'lng', 'reviews', 'sourceRecord']
        .some((key) => key in inner)
    ) {
      patches.push(inner);
    }
  }
  for (const patch of patches) {
    for (const [k, v] of Object.entries(patch)) {
      if (!blank(v) && blank(merged[k])) merged[k] = v;
    }
  }
  return merged;
}

function reviewTexts(p) {
  if (!p || typeof p !== 'object') return [];
  const src = p.sourceRecord && typeof p.sourceRecord === 'object' ? p.sourceRecord : {};
  const vals = [];
  for (const obj of [p, src]) {
    for (let i = 1; i <= 4; i += 1) {
      vals.push(dataText(obj[`review${i}`]).toLowerCase());
    }
    const reviews = obj.reviews;
    if (Array.isArray(reviews)) {
      for (const x of reviews) {
        if (x && typeof x === 'object') {
          vals.push(dataText(x.text || x.review || x.body).toLowerCase());
        } else {
          vals.push(dataText(x).toLowerCase());
        }
      }
    }
  }
  return vals.filter(Boolean).sort();
}

function logoText(p) {
  if (!p || typeof p !== 'object') return '';
  const src = p.sourceRecord && typeof p.sourceRecord === 'object' ? p.sourceRecord : {};
  return dataText(p.logoUrl || src.logoUrl || src.logo || src.faviconUrl);
}

function priceNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/\$/g, '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function capturePayloadFaults(snapshotPathOrObj, fixturePathOrObj) {
  const snap = typeof snapshotPathOrObj === 'string' ? loadJson(snapshotPathOrObj) : snapshotPathOrObj;
  if (!snap || typeof snap !== 'object' || !Object.keys(snap).length) {
    return ['DATA-CONTRACT: data snapshot is empty or not an object'];
  }
  const fixture = typeof fixturePathOrObj === 'string' ? loadJson(fixturePathOrObj) : fixturePathOrObj;
  const captured = captureRows(fixture);
  if (!Object.keys(captured).length) {
    return ['DATA-CONTRACT: captured fixture has no row payload to bind to the snapshot'];
  }
  const missing = Object.keys(snap)
    .map(String)
    .filter((k) => !(k in captured))
    .sort((a, b) => Number(a) - Number(b));
  if (missing.length) {
    const listed = missing.slice(0, 12).join(', ');
    return [`DATA-CONTRACT: captured fixture missing snapshot rows: ${listed}`];
  }
  const faults = [];
  for (const [rid, src] of Object.entries(snap)) {
    if (!src || typeof src !== 'object') {
      faults.push(`DATA-CONTRACT: snapshot row ${rid} is not an object`);
      continue;
    }
    const dst = effectiveCaptureRow(fixture, rid, captured[String(rid)] || {});
    const srcName = dataText(src.title || src.name);
    const dstName = dataText(dst.title || dst.name);
    if (srcName && dstName.toLowerCase() !== srcName.toLowerCase()) {
      faults.push(
        `DATA-CONTRACT: captured row ${rid} identity mismatch snapshot=${JSON.stringify(srcName)} capture=${JSON.stringify(dstName)}`,
      );
    }
    for (const field of ['summary', 'description']) {
      const srcV = dataText(src[field]);
      const dstV = dataText(dst[field]);
      if (srcV && dstV.toLowerCase() !== srcV.toLowerCase()) {
        faults.push(`DATA-CONTRACT: captured row ${rid} ${field} mismatch`);
      }
    }
    const srcLogo = logoText(src);
    const dstLogo = logoText(dst);
    if (srcLogo && dstLogo.toLowerCase() !== srcLogo.toLowerCase()) {
      faults.push(`DATA-CONTRACT: captured row ${rid} logo mismatch`);
    }
    let srcPrice = priceNum(src.price);
    if (srcPrice === null && src.sourceRecord && typeof src.sourceRecord === 'object') {
      srcPrice = priceNum(src.sourceRecord.price);
    }
    if (srcPrice !== null) {
      let dstPrice = priceNum(dst.price);
      if (dstPrice === null && dst.sourceRecord && typeof dst.sourceRecord === 'object') {
        dstPrice = priceNum(dst.sourceRecord.price);
      }
      if (dstPrice !== srcPrice) {
        faults.push(
          `DATA-CONTRACT: captured row ${rid} price mismatch snapshot=${JSON.stringify(srcPrice)} capture=${JSON.stringify(dstPrice)}`,
        );
      }
    }
    if (src.lat != null && src.lat !== '' && src.lng != null && src.lng !== '') {
      try {
        const dLat = Math.abs(Number(src.lat) - Number(dst.lat));
        const dLng = Math.abs(Number(src.lng) - Number(dst.lng));
        if (dLat > 1e-4 || dLng > 1e-4) {
          faults.push(`DATA-CONTRACT: captured row ${rid} coordinates mismatch`);
        }
      } catch {
        faults.push(`DATA-CONTRACT: captured row ${rid} coordinates missing`);
      }
    }
    const srcReviews = reviewTexts(src);
    const dstReviews = reviewTexts(dst);
    if (srcReviews.length && srcReviews.join('\0') !== dstReviews.join('\0')) {
      faults.push(`DATA-CONTRACT: captured row ${rid} reviews mismatch`);
    }
    if (faults.length >= 12) break;
  }
  return faults;
}

export function bindingVerdict(snapshotPathOrObj, fixturePathOrObj) {
  const faults = capturePayloadFaults(snapshotPathOrObj, fixturePathOrObj);
  return {
    overall: faults.length ? 'DATA_FAULT' : 'PASS',
    faults,
  };
}
