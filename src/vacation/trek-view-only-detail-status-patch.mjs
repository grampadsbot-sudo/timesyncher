const DETAIL_EDIT_STATUS_NEEDLE = 'n.jsx("div",{style:{marginTop:6,fontSize:10,fontWeight:800,color:Ce?ke==="error"?"#dc2626":ke==="saving"?"#d97706":"#0f766e":"#6b7280"},children:He?"Checking edit access…":Ce?ke==="saving"?"Saving…":ke==="error"?"Could not save — check your connection and try again":"Saved to itinerary":"View-only — editing requires an approved email invite"})';

const DETAIL_EDIT_STATUS_PATCH = '(He||Ce)&&n.jsx("div",{"data-ts-detail-edit-status":"1",style:{marginTop:6,fontSize:10,fontWeight:800,color:Ce?ke==="error"?"#dc2626":ke==="saving"?"#d97706":"#0f766e":"#6b7280"},children:He?"Checking edit access…":ke==="saving"?"Saving…":ke==="error"?"Could not save — check your connection and try again":"Saved to itinerary"})';

export function patchViewOnlyDetailEditStatus(source = '') {
  let js = String(source || '');
  if (js.includes(DETAIL_EDIT_STATUS_PATCH)) return js;
  if (!js.includes(DETAIL_EDIT_STATUS_NEEDLE)) return js;
  return js.replace(DETAIL_EDIT_STATUS_NEEDLE, DETAIL_EDIT_STATUS_PATCH);
}
