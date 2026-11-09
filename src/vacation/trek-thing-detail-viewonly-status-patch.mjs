const STATUS_DIV_NEEDLE =
  'n.jsx("div",{style:{marginTop:6,fontSize:10,fontWeight:800,color:Ce?ke==="error"?"#dc2626":ke==="saving"?"#d97706":"#0f766e":"#6b7280"},children:He?"Checking edit access…":Ce?ke==="saving"?"Saving…":ke==="error"?"Could not save — check your connection and try again":"Saved to itinerary":"View-only — editing requires an approved email invite"})';

const STATUS_DIV_PATCH =
  '(He||Ce?n.jsx("div",{style:{marginTop:6,fontSize:10,fontWeight:800,color:Ce?ke==="error"?"#dc2626":ke==="saving"?"#d97706":"#0f766e":"#6b7280"},children:He?"Checking edit access…":ke==="saving"?"Saving…":ke==="error"?"Could not save — check your connection and try again":"Saved to itinerary"}):null)';

const STATUS_DIV_APPLIED = '(He||Ce?n.jsx("div",{style:{marginTop:6,fontSize:10,fontWeight:800,color:Ce?ke==="error"?"#dc2626":ke==="saving"?"#d97706":"#0f766e":"#6b7280"},children:He?"Checking edit access…":ke==="saving"?"Saving…":ke==="error"?"Could not save — check your connection and try again":"Saved to itinerary"}):null)';

export function patchThingDetailViewonlyStatus(source = '') {
  let js = String(source || '');
  if (js.includes(STATUS_DIV_APPLIED)) {
    return js;
  }
  if (!js.includes(STATUS_DIV_NEEDLE)) {
    if (js.includes('View-only — editing requires an approved email invite')) {
      throw new Error('thing detail view-only status patch needle mismatch');
    }
    return js;
  }
  return js.replace(STATUS_DIV_NEEDLE, STATUS_DIV_PATCH);
}
