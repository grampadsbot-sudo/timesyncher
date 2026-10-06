/** Shared thing-card HTML for category tabs; day timeline stays native NYC TREK React. */

export function renderThingCardHtml(fields = {}) {
  const metaHtml = fields.metaHtml || '';
  const logoHtml = fields.logoHtml || '';
  const nameHtml = fields.nameHtml || '';
  const priceHtml = fields.priceHtml || '';
  const summaryHtml = fields.summaryHtml || '';
  const bodyHtml = fields.bodyHtml || '';
  const reviewsHtml = fields.reviewsHtml || '';
  const mediaHtml = fields.mediaHtml || '';
  return `<article class="thing style2-thing" data-thing-card="1"><div class="style2-thing-meta">${metaHtml}</div><div class="thing-head">${logoHtml}<div><h3>${nameHtml}</h3>${summaryHtml}${priceHtml}</div></div>${bodyHtml}${reviewsHtml}${mediaHtml}</article>`;
}

export function thingCardBundleExpr() {
  return `tsRenderThingCard=${renderThingCardHtml.toString()}`;
}

/** Keepsake style-2 print-media-card sizing, scoped to shared day timeline only. */
function itineraryTimelineMediaStyleTag() {
  const scope = '[data-ts-day-timeline="1"]';
  const css = [
    `${scope} .print-media-card{margin:0 8px 8px 0;width:92px;max-width:92px;display:inline-block;vertical-align:top;text-align:center;break-inside:avoid}`,
    `${scope} .print-media-card>img:not(.print-media-qr){width:92px;height:72px;object-fit:cover;border-radius:10px;border:1px solid #e5e7eb;background:#f8fafc;display:block}`,
    `${scope} .print-media-card.video>img.print-media-qr{width:72px;height:72px;object-fit:contain;background:#fff;border:1px solid #e5e7eb;border-radius:10px;display:block}`,
    `${scope} .print-media-card figcaption{font:400 10px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color:#64748b;margin-top:4px}`,
    `${scope} [data-itinerary-day-media="1"],${scope} [data-itinerary-row-media="1"]{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}`,
  ].join('');
  return `<style data-itinerary-timeline-media-css="1">${css}</style>`;
}

function itineraryTimelineMediaStyleBundleExpr() {
  return `tsItineraryTimelineMediaCss=${itineraryTimelineMediaStyleTag.toString()}`;
}

function itineraryDayMedia(G) {
  const rows = (typeof li == 'function' ? li(G) : []).filter((Oo) => {
    if (!Oo) return false;
    const src = String(Oo.url || '');
    if (/^data:image\//i.test(src)) return src.length > 12000;
    const blob = [Oo.filename, Oo.original_name, Oo.originalName, Oo.caption, src.slice(0, 240), String(Oo.thumbnailUrl || '').slice(0, 240), Oo.id].join(' ');
    return !/placeholder|1024.?1024|default[-_]?thumb|bind[- ]?proof|neon file bind proof/i.test(blob);
  });
  const photos = rows.filter((Oo) => Oo.kind !== 'video').map(Ba).join('');
  const videos = rows.filter((Oo) => Oo.kind === 'video').map(Ba).join('');
  return photos + videos;
}

function itineraryRowMediaInline(item, type) {
  const rowType = String(type || '');
  if (/^(travel|travel-to-thing|flight|transport|hotel-wake|hotel-event|hotel-sleep|hotel-checkout)$/i.test(rowType)) return '';
  const rows = (typeof fo == 'function' ? fo(item) : []).filter((Oo) => {
    if (!Oo) return false;
    return !/bind[- ]?proof|neon file bind proof/i.test([Oo.filename, Oo.original_name, Oo.originalName, Oo.caption, Oo.url, Oo.public_url, Oo.id].join(' '));
  });
  const photos = rows.filter((Oo) => Oo.kind !== 'video').map(Ba).join('');
  const videos = rows.filter((Oo) => Oo.kind === 'video').map(Ba).join('');
  if (!photos && !videos) return '';
  return `<div data-itinerary-row-media="1">${photos}${videos}</div>`;
}

export function dayTimelineMediaBundleExpr() {
  return `${itineraryTimelineMediaStyleBundleExpr()},tsItineraryDayMedia=${itineraryDayMedia.toString()},tsItineraryRowMedia=${itineraryRowMediaInline.toString()}`;
}
