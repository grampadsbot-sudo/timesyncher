export function captureNameText(nameEl) {
  const box = (r) => [r.x, r.y, r.width, r.height];
  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden'
      && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const lineBoxesFromRange = (range) => [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0
    && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth)
    .map((r) => [r.x, r.y, r.width, r.height]);

  if (!nameEl || !visible(nameEl)) return null;
  const walker = document.createTreeWalker(nameEl, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!String(node.textContent || '').trim()) continue;
    const anchor = node.parentElement === nameEl ? nameEl : node.parentElement;
    if (!visible(anchor)) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const lineBoxes = lineBoxesFromRange(range);
    if (lineBoxes.length) {
      return {
        text: String(node.textContent || '').trim().slice(0, 80),
        box: box(nameEl.getBoundingClientRect()),
        visible: true,
        line_boxes: lineBoxes,
      };
    }
  }
  const spanRange = document.createRange();
  spanRange.selectNodeContents(nameEl);
  const spanLineBoxes = lineBoxesFromRange(spanRange);
  const spanText = String(nameEl.textContent || '').trim();
  if (spanLineBoxes.length && spanText) {
    return {
      text: spanText.slice(0, 80),
      box: box(nameEl.getBoundingClientRect()),
      visible: true,
      line_boxes: spanLineBoxes,
    };
  }
  return null;
}
