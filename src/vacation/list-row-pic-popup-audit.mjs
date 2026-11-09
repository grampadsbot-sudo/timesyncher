export function isVisibleElement(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  if (!style) return true;
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
}

export function auditListRowPicPopup(row) {
  if (!row) {
    return { ok: false, reason: 'missing-row', popups: 0, popupVisible: 0, orphanImgs: 0 };
  }
  const popups = [...row.querySelectorAll('[data-ts-pic-popup]')];
  const popupVisible = popups.filter(isVisibleElement).length;
  const rowRect = row.getBoundingClientRect();
  const orphanImgs = [...row.querySelectorAll('img')].filter((img) => {
    if (!isVisibleElement(img)) return false;
    if (img.closest('[data-ts-pic-popup]')) return false;
    const pos = typeof getComputedStyle === 'function' ? getComputedStyle(img).position : '';
    if (pos !== 'absolute' && pos !== 'fixed') return false;
    const r = img.getBoundingClientRect();
    return r.width > 48 && r.height > 48 && r.top > rowRect.top + 24;
  }).length;
  const ok = popupVisible === 0 && orphanImgs === 0;
  return { ok, reason: ok ? null : 'pic-popup-leftover', popups: popups.length, popupVisible, orphanImgs };
}
