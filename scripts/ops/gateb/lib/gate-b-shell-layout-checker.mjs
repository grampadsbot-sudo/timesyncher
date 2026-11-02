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
