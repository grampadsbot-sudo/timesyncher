/** Checks 14/19: one row frame, the first visible name line; tolerance stays 0.5 px. */
export const ROW_NAME_TOLERANCE = 0.5;

function validBox(box) {
  return Array.isArray(box) && box.length === 4 && box.every(Number.isFinite)
    && box[2] > 0 && box[3] > 0;
}

export function nameLineFrame(firstText) {
  if (!firstText || firstText.visible !== true || !String(firstText.text || '').trim()) return null;
  // New captures carry Range rects. Immutable legacy captures retain their recorded leaf box.
  // Never derive a name frame from the item, chip, or an inferred line height.
  const boxes = firstText.line_boxes === undefined ? [firstText.box] : firstText.line_boxes;
  if (!Array.isArray(boxes)) return null;
  const line = boxes.filter(validBox).sort((a, b) => a[1] - b[1] || a[0] - b[0])[0];
  return line ? { box: line, cy: line[1] + line[3] / 2,
    source: firstText.line_boxes === undefined ? 'legacy-leaf-box' : 'range-first-line' } : null;
}

export function judgeRowNameFrame(glyphCenterY, firstText) {
  const frame = nameLineFrame(firstText);
  if (!frame) return { ok: false, reason: 'missing visible name line (fail closed)' };
  if (!Number.isFinite(glyphCenterY)) return { ok: false, reason: 'missing measured logo glyph (fail closed)', frame };
  const offset = glyphCenterY - frame.cy;
  return { ok: Math.abs(offset) <= ROW_NAME_TOLERANCE, offset, frame,
    reason: `logo ${offset > 0 ? 'low' : 'high'} vs first name line by ${Math.abs(offset)} px (tolerance ${ROW_NAME_TOLERANCE} px)` };
}
