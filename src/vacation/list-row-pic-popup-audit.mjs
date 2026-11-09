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

export function auditListRowPicPopupMediaStrip(row) {
  const base = auditListRowPicPopup(row);
  if (!row) {
    return { ...base, ok: false, reason: 'missing-row', logoChips: 0, photoThingMedia: false, qrPresent: false };
  }
  const thumbWraps = [...row.querySelectorAll('[data-ts-pic-thumb-wrap]')];
  const stripRoot = thumbWraps[0]?.parentElement || row;
  const logoChips = [...stripRoot.querySelectorAll('[data-ts-logo-chip]')];
  const photoImg = thumbWraps.flatMap((wrap) => [...wrap.querySelectorAll('img')]).find((img) => !img.classList.contains('print-media-qr'));
  const photoSrc = photoImg?.getAttribute('src') || '';
  const photoThingMedia = /\/ts-thing-media\//.test(photoSrc);
  const qrPresent = Boolean(row.querySelector('img.print-media-qr, .print-media-qr'));
  const faviconThumb = Boolean(photoImg?.classList.contains('tiny-logo') && !photoThingMedia);
  const ok =
    base.ok &&
    logoChips.length === 0 &&
    photoThingMedia &&
    qrPresent &&
    !faviconThumb;
  let reason = base.reason;
  if (base.ok) {
    if (logoChips.length > 0) reason = 'pic-logo-chip-leftover';
    else if (!photoThingMedia || faviconThumb) reason = 'pic-thumb-not-thing-media';
    else if (!qrPresent) reason = 'pic-qr-missing';
    else reason = null;
  }
  return {
    ...base,
    ok,
    reason,
    logoChips: logoChips.length,
    photoThingMedia,
    qrPresent,
    photoSrc,
  };
}
