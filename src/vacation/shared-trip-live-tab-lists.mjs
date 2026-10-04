import { applyProductKeepsakeOverrides, productThingCategory } from './keepsake-product-overrides.mjs';
import { timelineCategoryIcon } from './timeline-icons.mjs';
import { resolveThingLogoUrl } from './thing-logo-capture.mjs';

const LOGO_IMG_STYLE = 'width:18px;height:18px;max-width:18px;max-height:18px;object-fit:contain;object-position:center center;display:block';
const LOGO_FALLBACK_SPAN_STYLE = 'width:18px;height:18px;font-size:13px;display:inline-grid;place-items:center';

function text(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function prepareSharedTripForLiveApp(shared = {}) {
  return applyProductKeepsakeOverrides(shared);
}

function placeSourceUrl(place = {}) {
  const sourceRecord = place.sourceRecord || place.metadata?.sourceRecord || place.source_record || {};
  return text(sourceRecord.url || place.url || '');
}

function placeSourceName(place = {}) {
  const sourceRecord = place.sourceRecord || place.metadata?.sourceRecord || place.source_record || {};
  const raw = place.source;
  if (typeof raw === 'string') return text(raw);
  if (raw && typeof raw === 'object' && typeof raw.source === 'string') return text(raw.source);
  return text(sourceRecord.source || '');
}

function logSharedLiveTabLogoMissing(place = {}, log = console.error) {
  const row = {
    event: 'logo_missing',
    placeId: text(place.id),
    placeName: text(place.name || place.title),
    source: placeSourceName(place),
    sourceUrl: placeSourceUrl(place),
  };
  log(JSON.stringify(row));
}

function sharedLiveTabRows(shared = {}, tabKeyword = '') {
  const prepared = prepareSharedTripForLiveApp(shared);
  const tab = text(tabKeyword).toLowerCase();
  const rows = [];
  for (const place of prepared.places || []) {
    const override = prepared.thingOverrides?.[`place:${place.id}`] || {};
    const category = productThingCategory(place, override);
    if (tab === 'hotels' && category === 'hotel') rows.push({ place, override, category });
    if (tab === 'cars' && category === 'car') rows.push({ place, override, category });
  }
  return rows;
}

function logoChipFallbackInline() {
  return [
    'var chip=this.closest(\'[data-ts-logo-chip]\');',
    'if(!chip||chip.dataset.tsLogoFailed===\'1\')return;',
    'chip.dataset.tsLogoFailed=\'1\';',
    'var emoji=chip.getAttribute(\'data-ts-fallback-emoji\')||\'\\uD83D\\uDCCD\';',
    'chip.innerHTML=\'<span class="thing-emoji" style="' + LOGO_FALLBACK_SPAN_STYLE + '">\'+emoji+\'</span>\';',
  ].join('');
}

function logoChipLoadInline() {
  const fail = logoChipFallbackInline();
  return [
    'var img=this,chip=img.closest(\'[data-ts-logo-chip]\');',
    'if(!chip||chip.dataset.tsLogoFailed===\'1\')return;',
    'var box=img.getBoundingClientRect();',
    'if(box.width<4||box.height<4||img.naturalWidth<1||img.naturalHeight<1){' + fail + 'return;}',
    'try{',
    'var cv=document.createElement(\'canvas\');cv.width=10;cv.height=10;',
    'var ctx=cv.getContext(\'2d\',{willReadFrequently:true});',
    'if(!ctx){return;}',
    'ctx.drawImage(img,0,0,10,10);',
    'var px=ctx.getImageData(0,0,10,10).data,ink=false;',
    'for(var i=0;i<px.length;i+=4){',
    'if(px[i+3]<8)continue;',
    'if(px[i]<248||px[i+1]<248||px[i+2]<248){ink=true;break;}',
    '}',
    'if(!ink){' + fail + '}',
    '}catch(e){}',
  ].join('');
}

function logoChipHtml({ src, category }) {
  const emoji = timelineCategoryIcon(category);
  const emojiAttr = escapeHtml(emoji);
  const onerror = escapeHtml(`this.onerror=null;${logoChipFallbackInline()}`);
  const onload = escapeHtml(logoChipLoadInline());
  return `<span data-ts-logo-chip="1" data-ts-fallback-emoji="${emojiAttr}" aria-hidden="true" style="width:22px;height:22px;min-width:22px;display:inline-grid;place-items:center;box-sizing:border-box;border-radius:6px;background:#f8fafc;border:1px solid #e5e7eb"><img class="tiny-logo" src="${src}" alt="" style="${LOGO_IMG_STYLE}" onerror="${onerror}" onload="${onload}" /></span>`;
}

function listRowHtml({ place, override, tab, category, onLogoMissing }) {
  const logoUrl = resolveThingLogoUrl(place, override);
  const name = escapeHtml(place.name || place.title || 'Place');
  const tabAttr = escapeHtml(tab);
  if (!logoUrl) {
    onLogoMissing?.(place);
    return `<li data-list-row="1" data-has-logo="0" data-shared-tab="${tabAttr}" style="display:flex;align-items:center;gap:8px"><span><strong>${name}</strong></span></li>`;
  }
  const src = escapeHtml(logoUrl);
  const chip = logoChipHtml({ src, category });
  return `<li data-list-row="1" data-has-logo="1" data-logo-src="${src}" data-shared-tab="${tabAttr}" data-thing-category="${escapeHtml(category)}" style="display:flex;align-items:center;gap:8px">${chip}<span><strong>${name}</strong></span></li>`;
}

function sharedLiveTabRowHtmlFragments(shared = {}, tabKeyword = '', options = {}) {
  const tab = text(tabKeyword).toLowerCase();
  const onLogoMissing = options.onLogoMissing || logSharedLiveTabLogoMissing;
  const rows = sharedLiveTabRows(shared, tab);
  return rows.map((row) => listRowHtml({ ...row, tab, onLogoMissing }));
}

export function renderSharedLiveTabListHtml(shared = {}, tabKeyword = '', options = {}) {
  const tab = text(tabKeyword).toLowerCase();
  const items = sharedLiveTabRowHtmlFragments(shared, tab, options);
  return `<ul data-shared-live-tab="${escapeHtml(tab)}">${items.join('')}</ul>`;
}

export function buildSharedLiveTabLists(shared = {}, options = {}) {
  const prepared = prepareSharedTripForLiveApp(shared);
  const onLogoMissing = options.onLogoMissing || logSharedLiveTabLogoMissing;
  return {
    hotels: sharedLiveTabRowHtmlFragments(prepared, 'hotels', { onLogoMissing }),
    cars: sharedLiveTabRowHtmlFragments(prepared, 'cars', { onLogoMissing }),
  };
}
