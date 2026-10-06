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
  const videos = rows.filter((Oo) => Oo.kind === 'video').map((Oo) => {
    const fig = Ba(Oo);
    return fig.includes('</figure>')
      ? fig.replace('</figure>', '<figcaption style="font-size:10px;color:#64748b;margin-top:4px;text-align:center">Scan to play video</figcaption></figure>')
      : fig;
  }).join('');
  if (!photos && !videos) return '';
  return `<div data-itinerary-row-media="1" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;align-items:flex-start">${photos}${videos}</div>`;
}

export function dayTimelineMediaBundleExpr() {
  return `tsItineraryDayMedia=${itineraryDayMedia.toString()},tsItineraryRowMedia=${itineraryRowMediaInline.toString()}`;
}
