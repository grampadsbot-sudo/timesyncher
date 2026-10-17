/** Gate B restore-check: row logo chips vs capture frame (viewport or tab clip). */

const EPS = 0.5;

function normalizeCaptureFrame(frame = null) {
  if (!frame || typeof frame !== 'object') return null;
  const x = Number(frame.x) || 0;
  const y = Number(frame.y) || 0;
  const width = Number(frame.width);
  const height = Number(frame.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height, right: x + width, bottom: y + height };
}

function normalizeChipRect(rect = null) {
  if (!rect || typeof rect !== 'object') return null;
  const left = Number(rect.left);
  const top = Number(rect.top);
  const right = Number(rect.right);
  const bottom = Number(rect.bottom);
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** @returns {'in_frame'|'clipped'|'off_frame'|'unknown'} */
export function chipCaptureClipRelation(chipRect, captureFrame) {
  const chip = normalizeChipRect(chipRect);
  const frame = normalizeCaptureFrame(captureFrame);
  if (!chip || !frame) return 'unknown';
  const fullyInside = chip.left >= frame.x - EPS
    && chip.top >= frame.y - EPS
    && chip.right <= frame.right + EPS
    && chip.bottom <= frame.bottom + EPS;
  if (fullyInside) return 'in_frame';
  const intersects = chip.right > frame.x + EPS
    && chip.left < frame.right - EPS
    && chip.bottom > frame.y + EPS
    && chip.top < frame.bottom - EPS;
  if (!intersects) return 'off_frame';
  return 'clipped';
}

export function isCaptureCoverageGap(chipRect, captureFrame) {
  const rel = chipCaptureClipRelation(chipRect, captureFrame);
  return rel === 'clipped' || rel === 'off_frame';
}

export function viewportCaptureFrame(width, height) {
  return { x: 0, y: 0, width: Number(width) || 0, height: Number(height) || 0 };
}

export function fullPageCaptureFrame(width, scrollHeight, viewportHeight) {
  const w = Number(width) || 0;
  const h = Math.max(Number(scrollHeight) || 0, Number(viewportHeight) || 0, 1);
  return { x: 0, y: 0, width: w, height: h };
}

/**
 * Grade one list-row chip: clipped capture may only report a coverage gap;
 * logo ink/centering for that chip comes from the full-page row when provided.
 */
export function gradeLogoChipRowWithCaptureCoverage(row, { captureFrame, fullPageRow, gradeLogoChipRow }) {
  if (typeof gradeLogoChipRow !== 'function') {
    throw new TypeError('gradeLogoChipRow required');
  }
  const gap = isCaptureCoverageGap(row.chipRect, captureFrame);
  if (!gap) {
    return gradeLogoChipRow(row);
  }
  const relation = chipCaptureClipRelation(row.chipRect, captureFrame);
  const gradeSource = fullPageRow
    ? { ...row, ...fullPageRow, com: fullPageRow.com ?? row.com }
    : row;
  const graded = gradeLogoChipRow(gradeSource);
  return {
    ...graded,
    captureCoverageGap: true,
    captureClipRelation: relation,
    gradedFromFullPage: Boolean(fullPageRow),
  };
}

function indexLogoChipRows(rows = []) {
  return new Map((rows || []).map((row) => [row.index, row]));
}

export function gradeLogoTabRowsWithCaptureCoverage({
  rows = [],
  captureFrame = null,
  fullPageRows = [],
  gradeLogoChipRow,
}) {
  const fullByIndex = indexLogoChipRows(fullPageRows);
  const chipRows = (rows || []).filter((row) => row && row.isListRowChip === true);
  const graded = chipRows.map((row) => gradeLogoChipRowWithCaptureCoverage(row, {
    captureFrame,
    fullPageRow: fullByIndex.get(row.index),
    gradeLogoChipRow,
  }));
  const captureCoverageGaps = graded
    .filter((row) => row.captureCoverageGap)
    .map((row) => ({
      index: row.index,
      title: row.title || null,
      relation: row.captureClipRelation || null,
    }));
  return { graded, captureCoverageGaps };
}
