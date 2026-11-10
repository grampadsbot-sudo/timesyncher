export function conflictLabelClipRisk(style = {}) {
  const whiteSpace = style.whiteSpace ?? style['white-space'] ?? '';
  const overflow = style.overflow ?? '';
  const textOverflow = style.textOverflow ?? style['text-overflow'] ?? '';
  return whiteSpace === 'nowrap' && (overflow === 'hidden' || overflow === 'clip' || textOverflow === 'ellipsis');
}

export function judgeConflictLabelElement(label, getComputedStyle) {
  if (!label) return { ok: false, reason: 'missing-label' };
  const cs = getComputedStyle(label);
  if (conflictLabelClipRisk(cs)) {
    return { ok: false, reason: 'nowrap-overflow-clip' };
  }
  const scrollWidth = Number(label.scrollWidth) || 0;
  const clientWidth = Number(label.clientWidth) || 0;
  if (scrollWidth > clientWidth + 1) {
    return { ok: false, reason: 'text-scroll-overflow', scrollWidth, clientWidth };
  }
  const panel = label.parentElement;
  const panelRect = panel?.getBoundingClientRect?.();
  const labelRect = label.getBoundingClientRect?.();
  if (panelRect && labelRect && labelRect.right > panelRect.right + 1) {
    return { ok: false, reason: 'label-past-card', labelRight: labelRect.right, cardRight: panelRect.right };
  }
  return { ok: true };
}

export function judgeTimeZoneSingleLine(timeEl, createRange) {
  if (!timeEl) return { ok: false, reason: 'missing-time' };
  const text = String(timeEl.textContent || '').replace(/\s+/g, ' ').trim();
  if (!/\s(PT|ET)$/i.test(text)) return { ok: true, skipped: true };
  const range = createRange();
  range.selectNodeContents(timeEl);
  const rects = [...range.getClientRects()];
  range.detach?.();
  if (rects.length > 1) {
    return { ok: false, reason: 'timezone-wrapped-under-time', text, lineCount: rects.length };
  }
  return { ok: true, lineCount: rects.length };
}

export function collectTimelineDay390Layout(scope, deps = {}) {
  const getComputedStyle = deps.getComputedStyle ?? ((el) => el.ownerDocument?.defaultView?.getComputedStyle(el));
  const createRange = deps.createRange ?? (() => {
    const doc = scope?.ownerDocument || scope;
    return doc.createRange();
  });
  const conflictLabels = [...(scope?.querySelectorAll?.('[data-ts-conflict-label="1"]') || [])].map((label) => ({
    ...judgeConflictLabelElement(label, getComputedStyle),
    text: (label.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
  }));
  const timeCells = [...(scope?.querySelectorAll?.('[data-ts-timeline-time="1"]') || [])];
  const gridTimes = [...(scope?.querySelectorAll?.('[data-ts-day-timeline-row="1"]') || [])]
    .map((row) => row.children?.[0])
    .filter(Boolean);
  const timeChecks = [...new Set([...timeCells, ...gridTimes])].map((timeEl) => ({
    ...judgeTimeZoneSingleLine(timeEl, createRange),
    text: (timeEl.textContent || '').replace(/\s+/g, ' ').trim(),
  }));
  return {
    conflictLabelPass: conflictLabels.length > 0 && conflictLabels.every((row) => row.ok),
    conflictLabels,
    timeZonePass: timeChecks.every((row) => row.ok !== false),
    timeChecks,
    layoutPass: conflictLabels.every((row) => row.ok) && timeChecks.every((row) => row.ok !== false),
  };
}
