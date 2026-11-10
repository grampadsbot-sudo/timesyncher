const STATE_NEEDLE = '[Sa,Kt]=I.useState(!1);if(I.useEffect(()=>{var G;(G=P==null?void 0:P.trip)';
const STATE_PATCH =
  '[Sa,Kt]=I.useState(!1),[tsDetailEdit,setTsDetailEdit]=I.useState(!1);if(I.useEffect(()=>{var G;(G=P==null?void 0:P.trip)';

const TITLE_ROW_NEEDLE =
  'n.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start",marginBottom:14},children:[n.jsxs("div",{style:{flex:1,minWidth:0},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,letterSpacing:1.4,color:"#0f766e",textTransform:"uppercase"},children:"Detail page"}),';

const TITLE_ROW_PATCH =
  'n.jsxs("div",{className:"tsv-detail-title-row",style:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start",marginBottom:14,width:"100%",minWidth:0,boxSizing:"border-box"},children:[n.jsxs("div",{style:{flex:1,minWidth:0},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,letterSpacing:1.4,color:"#0f766e",textTransform:"uppercase"},children:"Detail page"}),';

const CLOSE_BTN_NEEDLE =
  'n.jsx("button",{onClick:()=>Ne(null),style:{border:"1px solid #e5e7eb",background:"#f9fafb",borderRadius:999,width:34,height:34,cursor:"pointer",fontWeight:900},children:"×"})';

const CLOSE_BTN_PATCH =
  'n.jsxs("div",{style:{display:"flex",alignItems:"center",gap:6,flexShrink:0},children:[Ce&&n.jsx("button",{type:"button","aria-label":"Edit thing",onClick:()=>setTsDetailEdit(!0),style:{border:"1px solid #e5e7eb",background:"#f9fafb",borderRadius:999,width:34,height:34,cursor:"pointer",display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0},children:n.jsx(Gs,{size:16})}),n.jsx("button",{type:"button",className:"tsv-detail-close","aria-label":"Close",onClick:()=>{Ne(null);setTsDetailEdit(!1)},style:{border:"1px solid #e5e7eb",background:"#f9fafb",borderRadius:999,width:34,height:34,cursor:"pointer",fontWeight:900},children:"×"})]})';

const FIELDSET_NEEDLE =
  '}),n.jsxs("fieldset",{"data-shared-readonly":Ce?void 0:"true",disabled:!Ce,style:{border:0,padding:0,margin:0,minInlineSize:0,opacity:1},children:[';

const FIELDSET_PATCH =
  '}),!tsDetailEdit&&/\\$?\\d/.test(String(bi(Dt)||""))&&n.jsxs("p",{className:"tsv-detail-price","data-ts-detail-field":"price",children:[n.jsx("strong",{children:"Price"})," ",String(bi(Dt)||"")]}),n.jsxs("fieldset",{"data-shared-readonly":Ce&&tsDetailEdit?void 0:"true",disabled:!(Ce&&tsDetailEdit),style:{border:0,padding:0,margin:0,minInlineSize:0,opacity:1},children:[';

const FIELDSET_BEFORE_NEEDLE = '}),n.jsxs("fieldset",{"data-shared-readonly":Ce&&tsDetailEdit?void 0:"true",disabled:!(Ce&&tsDetailEdit),style:{border:0,padding:0,margin:0,minInlineSize:0,opacity:1},children:[';

const VIEWONLY_STATUS_NEEDLE =
  'n.jsx("div",{style:{marginTop:6,fontSize:10,fontWeight:800,color:Ce?ke==="error"?"#dc2626":ke==="saving"?"#d97706":"#0f766e":"#6b7280"},children:He?"Checking edit access…":Ce?ke==="saving"?"Saving…":ke==="error"?"Could not save — check your connection and try again":"Saved to itinerary":"View-only — editing requires an approved email invite"})';

const VIEWONLY_STATUS_PATCH =
  '(Ce||tsDetailEdit)&&n.jsx("div",{style:{marginTop:6,fontSize:10,fontWeight:800,color:Ce?ke==="error"?"#dc2626":ke==="saving"?"#d97706":"#0f766e":"#6b7280"},children:He?"Checking edit access…":Ce?ke==="saving"?"Saving…":ke==="error"?"Could not save — check your connection and try again":"Saved to itinerary":"View-only — editing requires an approved email invite"})';

export function patchThingDetail951(source = '') {
  let js = String(source || '');
  if (!js.includes('[Sa,Kt]=I.useState(!1)')) {
    throw new Error('trek bundle missing Sa,Kt state in shared trip view');
  }
  if (js.includes(STATE_NEEDLE)) {
    js = js.replace(STATE_NEEDLE, STATE_PATCH);
  } else if (!js.includes('tsDetailEdit,setTsDetailEdit')) {
    throw new Error('thing detail 951 state patch did not apply');
  }
  if (js.includes(TITLE_ROW_NEEDLE)) {
    js = js.replace(TITLE_ROW_NEEDLE, TITLE_ROW_PATCH);
  } else if (!js.includes('className:"tsv-detail-title-row"')) {
    throw new Error('thing detail 951 title row patch did not apply');
  }
  if (js.includes(CLOSE_BTN_NEEDLE)) {
    js = js.replace(CLOSE_BTN_NEEDLE, CLOSE_BTN_PATCH);
  } else if (!js.includes('className:"tsv-detail-close"')) {
    throw new Error('thing detail 951 close/pencil patch did not apply');
  }
  if (js.includes(FIELDSET_NEEDLE)) {
    js = js.replace(FIELDSET_NEEDLE, FIELDSET_PATCH);
  } else if (js.includes(FIELDSET_BEFORE_NEEDLE)) {
    /* already fieldset-patched */
  } else if (!js.includes('"data-ts-detail-field":"price"')) {
    throw new Error('thing detail 951 fieldset/price patch did not apply');
  }
  if (js.includes(VIEWONLY_STATUS_NEEDLE)) {
    js = js.replace(VIEWONLY_STATUS_NEEDLE, VIEWONLY_STATUS_PATCH);
  }
  return js;
}
