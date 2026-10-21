export function mergeDayTimelines(perDay) {
  const out = [];
  for (const day of perDay) {
    for (const item of day.timeline || []) {
      out.push(item);
    }
  }
  return out;
}

function dayCaptureStem(dayNum, width, top) {
  const base = dayNum === 1 ? `daybyday-${width}` : `daybyday-day${dayNum}-${width}`;
  return top ? `${base}-top` : base;
}

export function dayCaptureShotNames(dayNum, width) {
  return [dayCaptureStem(dayNum, width, true) + '.png', dayCaptureStem(dayNum, width, false) + '.png'];
}
