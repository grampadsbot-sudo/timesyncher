import { listRowDescriptionBundleSnippet } from './list-row-description.mjs';

const CO_STORED_NEEDLE =
  'Co=G=>ha(G).longDetails||(tsPf.find(row=>row.match.test(String(G.name||G.title||"")))||{}).longDetails||Fl(G)';
const CO_STORED_PATCH =
  'Co=G=>{const d=ha(G)||{};return String(d.description??(G&&G.description)??"")}';
const RR_HOTEL_SUMMARY_FALLBACK =
  'rr=G=>{const pick=t=>{const s=String(t||"").replace(/\\s+/g," ").trim();if(!s)return"";const w=s.split(" ").filter(Boolean);if(w.length<=20)return s;if(/^Documented .+ option/i.test(s))return s;return""};const hotel=It(G)==="hotel"||Zi(G);if(hotel){const summary=String(ha(G).summary??"").replace(/\\s+/g," ").trim();if(summary)return summary}return pick(ha(G).itineraryNote??ha(G).itinerary_note)||pick(ha(G).summary??"")||""}';
const DETAIL_SUMMARY_READONLY_NEEDLE =
  'const sum=String(d.summary||"").replace(/\\s+/g," ").trim();return sum?n.jsxs("div",{"data-ts-detail-summary-readonly":"1"';
const DETAIL_SUMMARY_READONLY_PATCH =
  'const sum=String(d.description??(Dt&&Dt.description)??"");return sum?n.jsxs("div",{"data-ts-detail-summary-readonly":"1"';

function patchVkDescAsStored(source = '') {
  let js = String(source || '');
  js = js.replace('Co=G=>ha(G).longDetails??Fl(G)', CO_STORED_PATCH);
  if (js.includes(CO_STORED_NEEDLE)) {
    js = js.replace(CO_STORED_NEEDLE, CO_STORED_PATCH);
  } else if (!js.includes('Co=G=>{const d=ha(G)||{};return String(d.description??(G&&G.description)')) {
    throw new Error('vk desc-as-stored Co() patch did not apply');
  }
  if (js.includes(RR_HOTEL_SUMMARY_FALLBACK)) {
    js = js.replace(
      RR_HOTEL_SUMMARY_FALLBACK,
      RR_HOTEL_SUMMARY_FALLBACK.replace(
        'const hotel=It(G)==="hotel"||Zi(G);if(hotel){const summary=String(ha(G).summary??"").replace(/\\s+/g," ").trim();if(summary)return summary}',
        '',
      ),
    );
  }
  if (js.includes(DETAIL_SUMMARY_READONLY_NEEDLE)) {
    js = js.replace(DETAIL_SUMMARY_READONLY_NEEDLE, DETAIL_SUMMARY_READONLY_PATCH);
  }
  return js;
}

const LIST_ROW_DESC_ANCHOR = 'Oe=(G,Re,zt=!1)=>';
const OE_ROW_SUMMARY_LEGACY = 'Rn=Bs(rr(G)||Co(G)||Fl(G))';
const OE_ROW_SUMMARY_RR_ONLY = 'Rn=Bs(rr(G))';
const OE_ROW_SUMMARY_FORMATTED = 'Rn=Bs(tsListRowDescription(G))';
const OE_ROW_SUMMARY_SUBSTANCE = 'Rn=tsListRowDescription(G)';

function bundleHasLiveTabListRows(js = '') {
  return js.includes(LIST_ROW_DESC_ANCHOR)
    || js.includes('tsListRowDescription=function(G){')
    || js.includes(OE_ROW_SUMMARY_LEGACY)
    || js.includes(OE_ROW_SUMMARY_RR_ONLY)
    || js.includes(OE_ROW_SUMMARY_SUBSTANCE);
}

export function patchListRowDescription(source = '') {
  let js = String(source || '');
  if (!bundleHasLiveTabListRows(js)) return js;
  const snippet = listRowDescriptionBundleSnippet();
  if (!js.includes('tsListRowDescription=function(G){')) {
    const anchor = js.indexOf(LIST_ROW_DESC_ANCHOR);
    if (anchor < 0) {
      throw new Error('trek bundle missing Oe() anchor for list row description patch');
    }
    js = `${js.slice(0, anchor)}${snippet}${js.slice(anchor)}`;
  }
  if (js.includes(OE_ROW_SUMMARY_LEGACY)) {
    js = js.replaceAll(OE_ROW_SUMMARY_LEGACY, OE_ROW_SUMMARY_SUBSTANCE);
  }
  if (js.includes(OE_ROW_SUMMARY_RR_ONLY)) {
    js = js.replaceAll(OE_ROW_SUMMARY_RR_ONLY, OE_ROW_SUMMARY_SUBSTANCE);
  }
  js = js.replaceAll(OE_ROW_SUMMARY_FORMATTED, OE_ROW_SUMMARY_SUBSTANCE);
  if (!js.includes(OE_ROW_SUMMARY_SUBSTANCE)) {
    throw new Error('live tab row summary must use tsListRowDescription()');
  }
  return patchVkDescAsStored(js);
}
