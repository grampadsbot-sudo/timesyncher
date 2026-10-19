import { listRowDescriptionBundleSnippet } from './list-row-description.mjs';

const LIST_ROW_DESC_ANCHOR = 'Oe=(G,Re,zt=!1)=>';
const OE_ROW_SUMMARY_LEGACY = 'Rn=Bs(rr(G)||Co(G)||Fl(G))';
const OE_ROW_SUMMARY_RR_ONLY = 'Rn=Bs(rr(G))';
const OE_ROW_SUMMARY_SUBSTANCE = 'Rn=Bs(tsListRowDescription(G))';

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
  if (!js.includes(OE_ROW_SUMMARY_SUBSTANCE)) {
    throw new Error('live tab row summary must use tsListRowDescription()');
  }
  return js;
}
