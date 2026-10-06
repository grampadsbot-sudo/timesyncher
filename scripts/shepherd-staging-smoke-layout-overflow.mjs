/** Harness-only horizontal overflow probe (in-browser + offline fixtures). */

function parentOverflowClipsX(style) {
  const clips = (v) => v === 'hidden' || v === 'clip' || v === 'auto' || v === 'scroll';
  return clips(style.overflowX) || clips(style.overflow);
}

export function elementClippedByAncestorOverflow(el, vw, getComputedStyle, docRoot) {
  const root = docRoot || el?.ownerDocument?.documentElement;
  const r = el.getBoundingClientRect();
  let node = el.parentElement;
  while (node && node !== root) {
    const ps = getComputedStyle(node);
    if (parentOverflowClipsX(ps)) {
      const pr = node.getBoundingClientRect();
      if (pr.right <= vw + 1 && r.right > pr.right + 1) return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function sampleUnclippedHorizontalOverflow(vw, getComputedStyle, queryAll, rectObj, limit = 8) {
  const overflowEls = [];
  for (const el of queryAll('body *')) {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.right <= vw + 1) continue;
    if (elementClippedByAncestorOverflow(el, vw, getComputedStyle)) continue;
    overflowEls.push({
      tag: el.tagName,
      id: el.id || '',
      cls: String(el.className || '').slice(0, 40),
      rect: rectObj(el),
    });
    if (overflowEls.length >= limit) break;
  }
  return overflowEls;
}

export function horizontalOverflowHelperSource() {
  return `
function tsParentOverflowClipsX(style) {
  const clips = (v) => v === 'hidden' || v === 'clip' || v === 'auto' || v === 'scroll';
  return clips(style.overflowX) || clips(style.overflow);
}
function tsElementClippedByAncestorOverflow(el, vw, getComputedStyle) {
  const r = el.getBoundingClientRect();
  let node = el.parentElement;
  while (node && node !== document.documentElement) {
    const ps = getComputedStyle(node);
    if (tsParentOverflowClipsX(ps)) {
      const pr = node.getBoundingClientRect();
      if (pr.right <= vw + 1 && r.right > pr.right + 1) return true;
    }
    node = node.parentElement;
  }
  return false;
}
function tsSampleUnclippedHorizontalOverflow(vw, getComputedStyle, rectObj, limit) {
  const overflowEls = [];
  const cap = limit == null ? 8 : limit;
  for (const el of document.querySelectorAll('body *')) {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.right <= vw + 1) continue;
    if (tsElementClippedByAncestorOverflow(el, vw, getComputedStyle)) continue;
    overflowEls.push({ tag: el.tagName, id: el.id || '', cls: String(el.className || '').slice(0, 40), rect: rectObj(el) });
    if (overflowEls.length >= cap) break;
  }
  return overflowEls;
}
`;
}
