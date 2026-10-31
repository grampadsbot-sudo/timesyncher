import { categoryEmojiGlyph, duckDuckGoIp3LogoUrl, googleFaviconV2Url } from '../../../../src/vacation/thing-logo-fallback-url.mjs';

export function logoChipFallbackEmoji(raw, fallback = '📍') {
  return categoryEmojiGlyph(raw, fallback);
}

function applyLogoImgFallback(img, fallbackEmoji = '📍') {
  const chip = img.closest('[data-ts-logo-chip]');
  if (!chip || chip.dataset.tsLogoFailed === '1') return;
  const stage = img.dataset.tsLogoFallback || '0';
  if (stage === '0') {
    img.dataset.tsLogoFallback = '1';
    try {
      const host = new URL(img.src).hostname.replace(/^www\./i, '');
      img.src = duckDuckGoIp3LogoUrl(`https://${host}/`);
      return;
    } catch {
      void 0;
    }
  }
  if (stage === '1') {
    img.dataset.tsLogoFallback = '2';
    try {
      const next = googleFaviconV2Url(new URL(img.src).origin);
      if (next) {
        img.src = next;
        return;
      }
    } catch {
      void 0;
    }
  }
  chip.dataset.tsLogoFailed = '1';
  img.style.display = 'none';
  const fb = chip.querySelector('.tsv-logo-fallback');
  const emoji = logoChipFallbackEmoji(fallbackEmoji);
  if (fb) {
    fb.textContent = emoji;
    return;
  }
  chip.innerHTML = `<span class="tsv-logo-fallback">${emoji}</span>`;
}

export function onLogoImgError(event, fallbackEmoji = '📍') {
  applyLogoImgFallback(event.currentTarget, fallbackEmoji);
}

export function onLogoImgLoad(event, fallbackEmoji = '📍') {
  const img = event.currentTarget;
  const chip = img.closest('[data-ts-logo-chip]');
  if (!chip || chip.dataset.tsLogoFailed === '1') return;
  const box = img.getBoundingClientRect();
  if (box.width < 4 || box.height < 4 || img.naturalWidth < 16 || img.naturalHeight < 16) {
    applyLogoImgFallback(img, fallbackEmoji);
  }
}
