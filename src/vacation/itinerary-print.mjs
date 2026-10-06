/** Shared thing-card HTML for category tabs; day timeline stays native NYC TREK React. */

function text(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function sourceOf(place = {}, override = {}) {
  const rows = [override.sourceRecord, place.sourceRecord, place.source_record];
  for (const row of rows) {
    if (row && typeof row === 'object' && !Array.isArray(row)) return row;
  }
  return {};
}

function printEscape(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[ch]));
}

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

const THING_CARD_TAB_CSS = '.thing{border:1px solid #e5e7eb;border-radius:14px;padding:12px;margin:0 0 10px;background:#fff;color:#111827;box-sizing:border-box}.thing-head{display:grid;grid-template-columns:32px minmax(0,1fr);gap:10px;align-items:start;min-width:0}.thing-head h3{font-size:15px;margin:0;font-weight:800}.thing-head [data-row-summary="1"]{font-weight:400;font-size:12px;margin-top:3px;line-height:1.4;color:#334155}.thing p{font-size:12px;line-height:1.4;font-weight:400;color:#334155;margin:6px 0 0}.style2-thing-meta:empty{display:none}.thing-meta{font-size:12px;color:#475569}';

export function thingCardWebStyleTag() {
  return `<style data-itinerary-print-css="web">${THING_CARD_TAB_CSS}</style>`;
}

function thingCardSummaryText(place = {}, override = {}) {
  const source = sourceOf(place, override);
  const postal = source.postal_address && typeof source.postal_address === 'object'
    ? source.postal_address.displayAddress
    : '';
  const location = typeof place.location === 'string'
    ? place.location
    : (typeof override.location === 'string' ? override.location : '');
  const paragraph = [
    override.summary,
    place.summary,
    override.longDetails,
    place.longDetails,
    source.longDetails,
    source.details,
    place.notes,
    override.notes,
    place.description,
    source.description,
    location,
    place.address,
    override.address,
    postal,
    place.website,
    place.url,
    source.url,
    override.sourceUrl,
  ].map(text).find(Boolean);
  if (!paragraph) {
    const name = text(place.name || place.title || place.id) || 'thing';
    const message = `thing_card_summary_missing:${name}`;
    console.error(JSON.stringify({ event: 'thing_card_summary_missing', placeName: name }));
    return message;
  }
  return paragraph;
}

export function thingCardPriceText(place = {}, override = {}) {
  const source = sourceOf(place, override);
  return text(override.price ?? place.price ?? source.price ?? source.price_range);
}

export function thingCardParagraphs(place = {}, override = {}) {
  const source = sourceOf(place, override);
  const parts = [thingCardSummaryText(place, override)];
  const happyHour = text(override.happyHourDetails || place.happyHourDetails || source.happyHourDetails);
  if (happyHour) parts.push(`Happy Hour Details: ${happyHour}`);
  const story = text(override.story || place.story || source.story);
  if (story) parts.push(story);
  return parts;
}

export function thingCardBodyHtml(paragraphs = []) {
  return paragraphs.map((part) => `<p>${printEscape(part)}</p>`).join('');
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
