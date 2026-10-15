import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const LOGO_INK_MIN_MASS = 4;
const CARS_HEADING_LOGO_MAX_VERTICAL_PX = 1;
const INK_COLOR_DELTA_THRESHOLD = 18;

function normalizePngBufferInput(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (typeof data === 'string') return Buffer.from(data, 'base64');
  throw new TypeError('png_buffer_input_unsupported');
}

function readRgb(data, w, x, y) {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

/** Sample fill inside the chip, away from the 1px border chrome. */
export function chipInteriorBackgroundRgb(data, w, h) {
  const inset = Math.max(2, Math.floor(Math.min(w, h) * 0.22));
  const points = [
    [inset, inset],
    [w - 1 - inset, inset],
    [inset, h - 1 - inset],
    [w - 1 - inset, h - 1 - inset],
    [Math.floor(w / 2), inset + 1],
    [Math.floor(w / 2), h - 1 - inset - 1],
    [inset + 1, Math.floor(h / 2)],
    [w - 1 - inset - 1, Math.floor(h / 2)],
  ];
  const samples = points
    .filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h)
    .map(([x, y]) => readRgb(data, w, x, y))
    .filter(([, , , a]) => a >= 16);
  if (!samples.length) return [248, 250, 252];
  return samples.reduce(
    (acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b],
    [0, 0, 0],
  ).map((v) => v / samples.length);
}

export function analyzeLogoChipPngBuffer(buf, { bgRgb = null } = {}) {
  const png = PNG.sync.read(normalizePngBufferInput(buf));
  const { width: w, height: h, data } = png;
  if (!w || !h) return { error: 'empty_png', w, h };
  const bg = bgRgb || chipInteriorBackgroundRgb(data, w, h);
  let sumX = 0;
  let sumY = 0;
  let mass = 0;
  const borderSkip = Math.min(2, Math.max(1, Math.floor(Math.min(w, h) / 8)));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (x < borderSkip || y < borderSkip || x >= w - borderSkip || y >= h - borderSkip) continue;
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a < 16) continue;
      const dr = Math.abs(data[i] - bg[0]);
      const dg = Math.abs(data[i + 1] - bg[1]);
      const db = Math.abs(data[i + 2] - bg[2]);
      if (dr + dg + db < INK_COLOR_DELTA_THRESHOLD) continue;
      const weight = (dr + dg + db) * (a / 255);
      sumX += x * weight;
      sumY += y * weight;
      mass += weight;
    }
  }
  if (mass <= 0) return { error: 'empty_mass', w, h, mass: 0 };
  const comX = sumX / mass;
  const comY = sumY / mass;
  const chipCx = (w - 1) / 2;
  const chipCy = (h - 1) / 2;
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
    bgRgb: bg,
  };
}

export function logoChipInkPresent(com = {}, minMass = LOGO_INK_MIN_MASS) {
  if (!com || com.error) return false;
  const mass = Number(com.mass);
  return Number.isFinite(mass) && mass >= minMass;
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
  const chipMass = Number(row.chipMass);
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
