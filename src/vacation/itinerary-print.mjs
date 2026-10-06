/** Shared day-by-day and thing-card markup for the web tab and PDF pages.
 * Look follows the August 2026 NYC itinerary site (commit 8096a9e): white
 * card, 10px radius, #e5e7eb border, underlined name, one summary line.
 * Web and print share this markup. itinerarySurfaceCss is what differs.
 */

function surfaceName(surface) {
  return surface === 'print' ? 'print' : 'web';
}

export function itinerarySurfaceCss(surface = 'web') {
  if (surfaceName(surface) === 'print') {
    return '.ts-nyc-card{break-inside:avoid;page-break-inside:avoid}.ts-nyc-day{break-inside:auto;page-break-inside:auto}';
  }
  return '.ts-nyc-day{max-width:100%}.ts-nyc-day-title:empty{display:none}';
}

export function renderThingCardHtml(fields = {}) {
  const surface = surfaceName(fields.surface);
  const logoHtml = fields.logoHtml || '';
  const nameHtml = fields.nameHtml || '';
  const summaryHtml = fields.summaryHtml || '';
  const timeHtml = fields.timeHtml
    ? `<div class="ts-nyc-time" style="flex:0 0 74px;text-align:right;font-size:11px;font-weight:700;color:#111827">${fields.timeHtml}</div>`
    : '';
  const summary = summaryHtml
    ? `<div class="ts-nyc-summary" data-list-summary="1" style="margin-top:6px;color:#475569;font-size:11px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${summaryHtml}</div>`
    : '';
  const thingId = fields.thingId ? ` data-thing-id="${fields.thingId}"` : '';
  return `<article class="ts-nyc-card" data-thing-card="1" data-surface="${surface}"${thingId} style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;margin:0 0 8px;box-sizing:border-box;min-width:0;max-width:100%;color:#111827"><div class="ts-nyc-row" style="display:flex;align-items:center;gap:8px;min-width:0;max-width:100%">${timeHtml}${logoHtml}<div class="ts-nyc-copy" style="min-width:0;flex:1;overflow:hidden"><div class="ts-nyc-name" style="font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:underline;text-decoration-color:#cbd5e1;text-underline-offset:3px">${nameHtml}</div>${summary}</div></div></article>`;
}

export function renderDayItineraryHtml(fields = {}) {
  const surface = surfaceName(fields.surface);
  const styleHtml = fields.styleHtml || '';
  const titleHtml = fields.titleHtml || '';
  const openingHtml = fields.openingHtml || '';
  const rowsHtml = fields.rowsHtml || '';
  if (surface === 'print') {
    return `<section class="page daily-page style2-page ts-nyc-day" data-print-ready="style2" data-day-things-2col="1" data-day-itinerary="1" data-surface="print">${styleHtml}<h1>${titleHtml}</h1>${openingHtml}<main class="style2-details ts-nyc-day-cards" data-day-things-flow="1">${rowsHtml}</main></section>`;
  }
  return `<section class="ts-nyc-day" data-day-itinerary="1" data-surface="web">${styleHtml}<h1 class="ts-nyc-day-title">${titleHtml}</h1>${openingHtml}<div class="ts-nyc-day-cards">${rowsHtml}</div></section>`;
}

export function thingCardBundleExpr() {
  return 'tsRenderThingCard=(fields)=>{const surface=fields.surface==="print"?"print":"web",logoHtml=fields.logoHtml||"",nameHtml=fields.nameHtml||"",summaryHtml=fields.summaryHtml||"",timeHtml=fields.timeHtml?`<div class="ts-nyc-time" style="flex:0 0 74px;text-align:right;font-size:11px;font-weight:700;color:#111827">${fields.timeHtml}</div>`:"",summary=summaryHtml?`<div class="ts-nyc-summary" data-list-summary="1" style="margin-top:6px;color:#475569;font-size:11px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${summaryHtml}</div>`:"",thingId=fields.thingId?` data-thing-id="${fields.thingId}"`:"";return `<article class="ts-nyc-card" data-thing-card="1" data-surface="${surface}"${thingId} style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;margin:0 0 8px;box-sizing:border-box;min-width:0;max-width:100%;color:#111827"><div class="ts-nyc-row" style="display:flex;align-items:center;gap:8px;min-width:0;max-width:100%">${timeHtml}${logoHtml}<div class="ts-nyc-copy" style="min-width:0;flex:1;overflow:hidden"><div class="ts-nyc-name" style="font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:underline;text-decoration-color:#cbd5e1;text-underline-offset:3px">${nameHtml}</div>${summary}</div></div></article>`}';
}

export function dayItineraryBundleExpr() {
  const webStyle = JSON.stringify(`<style data-itinerary-print-css="web">${itinerarySurfaceCss('web')}</style>`);
  return `tsRenderDayItinerary=(fields)=>{const surface=fields.surface==="print"?"print":"web",styleHtml=fields.styleHtml||"",titleHtml=fields.titleHtml||"",openingHtml=fields.openingHtml||"",rowsHtml=fields.rowsHtml||"";if(surface==="print")return \`<section class="page daily-page style2-page ts-nyc-day" data-print-ready="style2" data-day-things-2col="1" data-day-itinerary="1" data-surface="print">\${styleHtml}<h1>\${titleHtml}</h1>\${openingHtml}<main class="style2-details ts-nyc-day-cards" data-day-things-flow="1">\${rowsHtml}</main></section>\`;return \`<section class="ts-nyc-day" data-day-itinerary="1" data-surface="web">\${styleHtml}<h1 class="ts-nyc-day-title">\${titleHtml}</h1>\${openingHtml}<div class="ts-nyc-day-cards">\${rowsHtml}</div></section>\`},tsDayWebStyle=${webStyle}`;
}
