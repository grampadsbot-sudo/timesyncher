/** Pixel ink helpers for shepherd LOGO smoke (no DOM box / naturalWidth gates). */

export const LOGO_INK_MIN_MASS = 4;
export const CARS_HEADING_LOGO_MAX_VERTICAL_PX = 1;

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

/** Vertical ink alignment for Cars tab icon vs visible label text (page Y delta). */
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
