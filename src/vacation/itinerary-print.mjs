/** Thing-card HTML shared by Style-two `wd()` and shared-trip category tabs. */

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
  const bodyHtml = fields.bodyHtml || '';
  const reviewsHtml = fields.reviewsHtml || '';
  const mediaHtml = fields.mediaHtml || '';
  return `<article class="thing style2-thing" data-thing-card="1"><div class="style2-thing-meta">${metaHtml}</div><div class="thing-head">${logoHtml}<div><h3>${nameHtml}</h3>${priceHtml}</div></div>${bodyHtml}${reviewsHtml}${mediaHtml}</article>`;
}

export function thingCardBundleExpr() {
  return `tsRenderThingCard=${renderThingCardHtml.toString()}`;
}

const THING_CARD_WEB_CSS = '.thing{border:1px solid #e5e7eb;border-radius:14px;padding:12px;margin:0 0 10px;background:#fff;color:#111827;box-sizing:border-box}.thing-head{display:grid;grid-template-columns:32px minmax(0,1fr);gap:10px;align-items:center;min-width:0}.thing-head h3{font-size:15px;margin:0;font-weight:800}.thing p{font-size:12px;line-height:1.4;font-weight:400;color:#334155;margin:6px 0 0}.style2-thing-meta:empty{display:none}.thing-meta{font-size:12px;color:#475569}';

export function thingCardWebStyleTag() {
  return `<style data-itinerary-print-css="web">${THING_CARD_WEB_CSS}</style>`;
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

export function renderDayItineraryHtml(fields = {}) {
  const titleHtml = fields.titleHtml || '';
  const openingHtml = fields.openingHtml || '';
  const cardsHtml = fields.cardsHtml || '';
  const styleHtml = fields.styleHtml || '';
  return `<section class="page daily-page style2-page" data-print-ready="style2" data-day-things-2col="1" data-day-itinerary="1">${styleHtml}<h1>${titleHtml}</h1>${openingHtml}<main class="style2-details" data-day-things-flow="1">${cardsHtml}</main></section>`;
}

export function dayItineraryBundleExpr() {
  return `tsRenderDayItinerary=${renderDayItineraryHtml.toString()},tsDayWebStyle=${JSON.stringify(thingCardWebStyleTag())}`;
}
