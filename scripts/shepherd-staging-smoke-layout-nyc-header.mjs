/** LAYOUT-NYC shared-trip header probe (harness-only, testable + in-browser snippet). */

export function layoutNycSharedHeaderVisible(el, getComputedStyle) {
  if (!el || typeof getComputedStyle !== 'function') return false;
  const st = getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
  const h = el.offsetHeight ?? 0;
  const w = el.offsetWidth ?? 0;
  if (h <= 4 || w <= 20) return false;
  const hay = String(el.textContent || '').replace(/\s+/g, ' ').trim();
  if (/vacation|timesyncher/i.test(hay) && hay.length >= 8) return true;
  return Boolean(el.querySelector?.('[data-trip-view-root],[data-print-menu-root]'));
}

export function layoutNycSharedHeaderPresentFromProbe(probe = {}) {
  return Boolean(probe.present);
}

/** Injected inside summarizeLayoutNyc(); uses page scrollY=0 so header is not missed after tab scroll. */
export const LAYOUT_NYC_SHARED_HEADER_PROBE_SOURCE = `function __layoutNycPickHeaderRoot() {
  const marked = document.querySelector('[data-ts-shared-header],[data-shared-trip-header]');
  if (marked) return marked;
  const tripRoot = document.querySelector('[data-trip-view-root]');
  const printRoot = document.querySelector('[data-print-menu-root]');
  if (tripRoot?.parentElement && tripRoot.parentElement !== document.body) return tripRoot.parentElement;
  if (printRoot?.parentElement && printRoot.parentElement !== document.body) return printRoot.parentElement;
  const h1 = document.querySelector('header h1,.shared-trip h1');
  return h1?.closest('header,.shared-trip,section,div') || h1;
}
function __layoutNycSharedHeaderVisible(el) {
  if (!el) return false;
  const st = getComputedStyle(el);
  if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
  if (el.offsetHeight <= 4 || el.offsetWidth <= 20) return false;
  const hay = String(el.textContent || '').replace(/\\s+/g, ' ').trim();
  if (/vacation|timesyncher/i.test(hay) && hay.length >= 8) return true;
  return Boolean(el.querySelector('[data-trip-view-root],[data-print-menu-root]'));
}
function __layoutNycProbeSharedHeader() {
  const savedY = window.scrollY;
  window.scrollTo(0, 0);
  const root = __layoutNycPickHeaderRoot();
  const present = __layoutNycSharedHeaderVisible(root);
  window.scrollTo(0, savedY);
  return { present, rootTag: root?.tagName || null };
}`;
