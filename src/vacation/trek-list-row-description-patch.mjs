import { listRowDescriptionBundleSnippet } from './list-row-description.mjs';

const LIST_ROW_DESC_ANCHOR = 'Oe=(G,Re,zt=!1)=>';
const LIST_ROW_DESC_MARKER = 'tsListRowDescription=G=>{';
const OE_ROW_SUMMARY_LEGACY = 'Rn=Bs(rr(G)||Co(G)||Fl(G))';
const OE_ROW_SUMMARY_RR_ONLY = 'Rn=Bs(rr(G))';
const OE_ROW_SUMMARY_SUBSTANCE = 'Rn=Bs(tsListRowDescription(G))';

export function patchListRowDescription(source = '') {
  let js = String(source || '');
  js = js.replaceAll(OE_ROW_SUMMARY_LEGACY, OE_ROW_SUMMARY_SUBSTANCE);
  js = js.replaceAll(OE_ROW_SUMMARY_RR_ONLY, OE_ROW_SUMMARY_SUBSTANCE);
  if (!js.includes(OE_ROW_SUMMARY_SUBSTANCE) || js.includes(LIST_ROW_DESC_MARKER)) return js;
  const anchor = js.indexOf(LIST_ROW_DESC_ANCHOR);
  if (anchor < 0) {
    throw new Error('trek bundle missing Oe() anchor for list row description patch');
  }
  return `${js.slice(0, anchor)}${listRowDescriptionBundleSnippet()}${js.slice(anchor)}`;
}
