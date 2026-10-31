import { productThingCategory } from './keepsake-product-overrides.mjs';
import { resolveThingLogoUrl } from './thing-logo-capture.mjs';
import { repairExplicitLogoUrl } from './thing-logo-fallback-url.mjs';

function text(value) {
  return String(value || '').trim();
}

function pageUrl(place = {}, override = {}) {
  return text(
    override.url
    || override.website
    || place.url
    || place.website
    || place.sourceRecord?.url
    || place.sourceRecord?.website,
  );
}

function scheduledLogoUrlForPlace(place = {}, override = {}) {
  const logoUrl = resolveThingLogoUrl(place, override) || text(override.logoUrl || place.logoUrl);
  return repairExplicitLogoUrl(logoUrl, pageUrl(place, override));
}

export function auditScheduledThingLogos(shared = {}) {
  const overrides = shared.thingOverrides && typeof shared.thingOverrides === 'object' ? shared.thingOverrides : {};
  const rows = [];
  for (const place of shared.places || []) {
    const override = overrides[`place:${place.id}`] || {};
    if (override.timeline === false) continue;
    const category = productThingCategory(place, override);
    const logoUrl = scheduledLogoUrlForPlace(place, override);
    const issues = [];
    if (!logoUrl) issues.push('missing_logo_url');
    if (/favicon\.ico$/i.test(logoUrl) && !/duckduckgo|gstatic\.com\/faviconV2/i.test(logoUrl)) {
      issues.push('bare_favicon_ico');
    }
    if (text(override.icon) === '?') issues.push('question_mark_icon');
    rows.push({
      id: place.id,
      name: text(place.name || place.title || override.title),
      category,
      logoUrl,
      issues,
      pass: issues.length === 0,
    });
  }
  const failing = rows.filter((row) => !row.pass);
  return {
    pass: failing.length === 0,
    count: rows.length,
    failing,
    rows,
  };
}

export function visibleLogoDomCheckSource() {
  return `(() => {
    const bad = [];
    const chips = [...document.querySelectorAll('[data-ts-logo-chip="1"]')];
    for (const chip of chips) {
      const img = chip.querySelector('img.tiny-logo, img.tsv-logo, img.tsv-timeline-logo, img.tiny-logo');
      const fb = chip.querySelector('.tsv-logo-fallback, .thing-emoji, .tsv-timeline-emoji');
      const text = (fb && fb.textContent || '').trim();
      if (text === '?') bad.push({ reason: 'question_glyph', text });
      if (chip.dataset.tsLogoFailed === '1' && !text) bad.push({ reason: 'failed_without_fallback' });
      if (img && img.complete && img.naturalWidth > 0 && img.naturalWidth < 16) bad.push({ reason: 'tiny_logo', src: (img.currentSrc || img.src || '').slice(0, 120), nw: img.naturalWidth });
      if (img && img.complete && img.naturalWidth === 0) bad.push({ reason: 'broken_img', src: (img.currentSrc || img.src || '').slice(0, 120) });
    }
    return { pass: bad.length === 0, bad, checked: chips.length };
  })()`;
}
