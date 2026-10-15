import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const LOGO_INK_MIN_MASS = 4;
const CARS_HEADING_LOGO_MAX_VERTICAL_PX = 1;
const CHIP_INTERIOR_INSET_PX = 3;

function interiorLogoMassFromPng(png, { inset = CHIP_INTERIOR_INSET_PX, threshold = 18 } = {}) {
  const { width: w, height: h, data } = png;
  if (!w || !h) return 0;
  const x0 = Math.min(inset, Math.floor(w / 3));
  const y0 = Math.min(inset, Math.floor(h / 3));
  const x1 = Math.max(x0 + 1, w - inset);
  const y1 = Math.max(y0 + 1, h - inset);
  const sampleAt = (x, y) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const corners = [
    sampleAt(x0, y0),
    sampleAt(x1 - 1, y0),
    sampleAt(x0, y1 - 1),
    sampleAt(x1 - 1, y1 - 1),
  ];
  const bg = corners.reduce(
    (acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b],
    [0, 0, 0],
  ).map((v) => v / corners.length);
  let mass = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a < 16) continue;
      const dr = Math.abs(data[i] - bg[0]);
      const dg = Math.abs(data[i + 1] - bg[1]);
      const db = Math.abs(data[i + 2] - bg[2]);
      if (dr + dg + db < threshold) continue;
      mass += (dr + dg + db) * (a / 255);
    }
  }
  return mass;
}

export function measureLogoInkComFromPngBuffer(buf) {
  const png = PNG.sync.read(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  const logoMass = interiorLogoMassFromPng(png);
  const { width: w, height: h } = png;
  if (logoMass <= 0) {
    return { error: 'empty_mass', w, h, logoMass: 0, mass: 0 };
  }
  let sumX = 0;
  let sumY = 0;
  let mass = 0;
  const inset = CHIP_INTERIOR_INSET_PX;
  const x0 = Math.min(inset, Math.floor(w / 3));
  const y0 = Math.min(inset, Math.floor(h / 3));
  const x1 = Math.max(x0 + 1, w - inset);
  const y1 = Math.max(y0 + 1, h - inset);
  const corners = [
    [x0, y0], [x1 - 1, y0], [x0, y1 - 1], [x1 - 1, y1 - 1],
  ].map(([x, y]) => {
    const i = (y * w + x) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  });
  const bg = corners.reduce(
    (acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b],
    [0, 0, 0],
  ).map((v) => v / corners.length);
  const threshold = 18;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * w + x) * 4;
      const a = png.data[i + 3];
      if (a < 16) continue;
      const dr = Math.abs(png.data[i] - bg[0]);
      const dg = Math.abs(png.data[i + 1] - bg[1]);
      const db = Math.abs(png.data[i + 2] - bg[2]);
      if (dr + dg + db < threshold) continue;
      const weight = (dr + dg + db) * (a / 255);
      sumX += x * weight;
      sumY += y * weight;
      mass += weight;
    }
  }
  if (mass <= 0) {
    return { error: 'empty_mass', w, h, logoMass: 0, mass: 0 };
  }
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
    mass: logoMass,
    logoMass,
  };
}

export function logoChipInkPresent(com = {}, minMass = LOGO_INK_MIN_MASS) {
  if (!com || com.error) return false;
  if (Number.isFinite(com.logoMass)) {
    return com.logoMass >= minMass;
  }
  const mass = Number(com.mass);
  if (!Number.isFinite(mass) || mass < minMass) return false;
  const dxPx = Number(com.dxPx);
  const dyPx = Number(com.dyPx);
  if (
    Number.isFinite(dxPx)
    && Number.isFinite(dyPx)
    && dxPx <= 1.5
    && dyPx <= 1.5
    && mass >= 8000
  ) {
    return false;
  }
  return true;
}

export function gradeLogoChipInkPresence(com = {}) {
  const present = logoChipInkPresent(com);
  return {
    inkPresent: present,
    inkError: present ? null : (com?.error || 'ink_below_min_mass'),
  };
}

export function gradeCarsHeadingLogoInk(
  row = {},
  { maxVerticalPx = CARS_HEADING_LOGO_MAX_VERTICAL_PX } = {},
) {
  if (!row || typeof row !== 'object') {
    return { pass: false, reason: 'missing_cars_tab_ink_row', iconVsLabelPx: null, iconVsTabPx: null };
  }
  const chipMass = Number(row.logoMass ?? row.chipMass);
  if (!Number.isFinite(chipMass) || chipMass < LOGO_INK_MIN_MASS) {
    return { pass: false, reason: 'cars_tab_icon_ink_missing', iconVsLabelPx: row.iconVsLabelPx, iconVsTabPx: row.iconVsTabPx };
  }
  if (row.labelVisible === true && row.iconVsLabelPx != null) {
    const dy = Math.abs(Number(row.iconVsLabelPx));
    if (!Number.isFinite(dy) || dy > maxVerticalPx) {
      return { pass: false, reason: 'cars_heading_logo_vertical_off', iconVsLabelPx: row.iconVsLabelPx, iconVsTabPx: row.iconVsTabPx };
    }
    return { pass: true, reason: null, iconVsLabelPx: row.iconVsLabelPx, iconVsTabPx: row.iconVsTabPx };
  }
  const tabDy = Math.abs(Number(row.iconVsTabPx));
  if (!Number.isFinite(tabDy) || tabDy > maxVerticalPx) {
    return { pass: false, reason: 'cars_tab_icon_vertical_off', iconVsLabelPx: row.iconVsLabelPx, iconVsTabPx: row.iconVsTabPx };
  }
  return { pass: true, reason: null, iconVsLabelPx: row.iconVsLabelPx, iconVsTabPx: row.iconVsTabPx };
}

export function findCarsTabInkMetric(metrics = []) {
  return (metrics || []).find((row) => /\bcars\b/i.test(String(row.tab || ''))) || null;
}
