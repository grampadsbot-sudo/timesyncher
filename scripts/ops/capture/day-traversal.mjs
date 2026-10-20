export function mergeDayTimelines(perDay) {
  const seen = new Set();
  const out = [];
  for (const day of perDay) {
    for (const item of day.timeline || []) {
      const key = (item && item.title) || '';
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export function applyMergedTimeline(regions, viewportKey, mergedTimeline) {
  for (const suffix of [`daybyday-${viewportKey}.png`, `daybyday-${viewportKey}-top.png`]) {
    const reg = regions[suffix];
    if (!reg || !reg.ok || !reg.struct) continue;
    reg.struct = { ...reg.struct, timeline: mergedTimeline };
  }
}

function dayCaptureStem(dayNum, width, top) {
  const base = dayNum === 1 ? `daybyday-${width}` : `daybyday-day${dayNum}-${width}`;
  return top ? `${base}-top` : base;
}

export function dayCaptureShotNames(dayNum, width) {
  return [dayCaptureStem(dayNum, width, true) + '.png', dayCaptureStem(dayNum, width, false) + '.png'];
}
