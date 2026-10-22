const OE_LIST_ROW_PREP_NEEDLE = 'Xr=fo(G);return Sa?n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:10,padding:"8px 10px",border:"1px solid var(--border-faint, #e5e7eb)",minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto"';
const OE_LIST_ROW_PREP_PATCH = 'Xr=fo(G);const tsRowLogo=_l(G),tsRowHasLogo=tsRowLogo?"1":"0";return Sa?n.jsxs("li",{"data-list-row":"1","data-has-logo":tsRowHasLogo,"data-logo-src":tsRowLogo||"","data-thing-category":It(G),style:{listStyle:"none",background:"var(--bg-card, white)",borderRadius:10,padding:"8px 10px",border:"1px solid var(--border-faint, #e5e7eb)",minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto"';
const OE_LIST_ROW_ALT_NEEDLE = '},`${It(G)}-${Qt(G)}-${ua}`):n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:10,padding:"8px 10px",border:"1px solid var(--border-faint, #e5e7eb)",minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),title:Pn||"Open details"';
const OE_LIST_ROW_ALT_PATCH = '},`${It(G)}-${Qt(G)}-${ua}`):n.jsxs("li",{"data-list-row":"1","data-has-logo":tsRowHasLogo,"data-logo-src":tsRowLogo||"","data-thing-category":It(G),style:{listStyle:"none",background:"var(--bg-card, white)",borderRadius:10,padding:"8px 10px",border:"1px solid var(--border-faint, #e5e7eb)",minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),title:Pn||"Open details"';
const HOTELS_TAB_PANEL_NEEDLE = 'q==="hotels"&&n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx(Wr,{listKey:"hotels"})';
const HOTELS_TAB_PANEL_PATCH = 'q==="hotels"&&n.jsxs("div",{"data-shared-live-tab":"hotels",style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx(Wr,{listKey:"hotels"})';
const CARS_TAB_PANEL_NEEDLE = 'q==="cars"&&n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx(Wr,{listKey:"cars"})';
const CARS_TAB_PANEL_PATCH = 'q==="cars"&&n.jsxs("div",{"data-shared-live-tab":"cars",style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx(Wr,{listKey:"cars"})';

const OE_ROW_SUMMARY_NEEDLE = 'n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),title:Pn||"Open details",style:{marginTop:6,border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:Pn?"#475569":"#9ca3af",fontSize:11,fontWeight:700,width:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:Pn||"Open details for summary"})';
const OE_ROW_SUMMARY_PATCH = 'Pn?n.jsx("div",{"data-list-summary":"1","data-summary-src":"thing",style:{marginTop:6,fontSize:11,fontWeight:700,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#475569",lineHeight:1.4},children:Pn}):null';

const OE_ROW_TITLE_SPAN_NEEDLE = 'n.jsx("span",{style:{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:Zn})';
const OE_ROW_TITLE_SPAN_PATCH = 'n.jsx("span",{style:{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",width:"100%"},children:Mi(G)||Zi(G)||bn(G)?Zn:n.jsx("strong",{children:Bs(mr(G))})})';

const OE_ROW_ZN_STRONG_NEEDLE = 'Zn=bn(G)?n.jsx(Qo,{item:G}):Mi(G)?n.jsx(be,{item:G}):Zi(G)?n.jsx(je,{item:G,title:ua}):ua,sr=n.jsxs';
const OE_ROW_ZN_STRONG_PATCH = 'Zn=bn(G)?n.jsx(Qo,{item:G}):Mi(G)?n.jsx(be,{item:G}):Zi(G)?n.jsx(je,{item:G,title:ua}):n.jsx("strong",{children:ua}),sr=n.jsxs';

const OE_CAR_BE_GRID_PATCH = 'be=({item:G})=>n.jsxs("span",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto",gap:6,width:"100%",minWidth:0,maxWidth:"100%",alignItems:"center"},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:n.jsx("strong",{children:J(G)||"Rental"})}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,color:"#0f766e",fontWeight:900,flexShrink:0},children:ie(G)||""}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:uc(G)||"Car type"})]})';

function patchCarBeGrid(js = '') {
  if (js.includes('be=({item:G})=>n.jsxs("span",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto",gap:6,width:"100%",minWidth:0,maxWidth:"100%"')) {
    return js;
  }
  const start = js.indexOf('be=({item:G})=>');
  const endMarker = "})]}),je=({item:G,title:Re})=>";
  const end = js.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error('shared trip Oe() car header grid patch did not apply');
  }
  const oldBe = js.slice(start, end);
  return `${js.slice(0, start)}${OE_CAR_BE_GRID_PATCH},${js.slice(end + '})]}),'.length)}`;
}

const OE_HOTEL_JE_TITLE_NEEDLE = 'je=({item:G,title:Re})=>n.jsxs("span",{style:{display:"grid",gridTemplateColumns:"minmax(0, 1fr) 44px",gap:8,width:"100%",alignItems:"center"},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:Re}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:ie(G)})]})';
const OE_HOTEL_JE_TITLE_PATCH = 'je=({item:G,title:Re})=>n.jsxs("span",{"data-ts-hotel-row-head":"1",style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,width:"100%",minWidth:0,maxWidth:"100%",alignItems:"center"},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,maxWidth:"100%"},children:n.jsx("strong",{style:{display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,maxWidth:"100%"},children:Re})}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,color:"#0f766e",fontWeight:900,flexShrink:0},children:ie(G)})]})';

const WR_SORT_ROW_NEEDLE = 'Wr=({listKey:G})=>{const Re=K[G]||{key:"name",dir:"asc"},zt=ua=>Re.key===ua?Re.dir==="asc"?" ↑":" ↓":"";return n.jsxs("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2},children:';
const WR_SORT_ROW_PATCH = 'Wr=({listKey:G})=>{const Re=K[G]||{key:"name",dir:"asc"},zt=ua=>Re.key===ua?Re.dir==="asc"?" ↑":" ↓":"";return n.jsxs("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2,minWidth:0,maxWidth:"100%"},children:';

const BI_PRICE_NEEDLE = 'bi=G=>ha(G).price??G.price??""';
const BI_PRICE_PATCH = 'bi=G=>{const o=ha(G).price,p=G.price;const pick=v=>v===""||v==null?null:v;return pick(o)??pick(p)??""}';

const BUDGET_MO_SKIP_TYPES_JSON = JSON.stringify([
  'travel',
  'travel-to-thing',
  'transport',
  'hotel-wake',
  'hotel-sleep',
  `hotel-${'checkout'}`,
]);
const BUDGET_MO_DEDUPE_NEEDLE = 'Mo=Array.from(new Map([].concat(rs,Po,bc,Oc,Fs,Cc).filter(Boolean).map(Xi=>[Qt(Xi),{item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))}])).values())';
const BUDGET_MO_DEDUPE_PATCH = 'Mo=(()=>{const m=new Map();for(const Xi of [].concat(rs,Po,bc,Oc,Fs,Cc).filter(Boolean)){const k=Qt(Xi);const row={item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))};const prev=m.get(k);if(!prev||!prev.hasPrice&&row.hasPrice)m.set(k,row);}return[...m.values()]})()';
const BUDGET_MO_TIMELINE_NEEDLE = `Mo=Array.from(new Map(Qa.flatMap(di=>Ci(di)).filter(di=>(di==null?void 0:di.item)&&!${BUDGET_MO_SKIP_TYPES_JSON}.includes(di.type)).map(di=>{const Xi=di.item;return[Qt(Xi),{item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))}])).values())`;
const BUDGET_MO_TIMELINE_PATCH = `Mo=(()=>{const m=new Map();for(const di of Qa.flatMap(di=>Ci(di)).filter(di=>(di==null?void 0:di.item)&&!${BUDGET_MO_SKIP_TYPES_JSON}.includes(di.type)){const Xi=di.item;const row={item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))};const k=Qt(Xi);const prev=m.get(k);if(!prev||!prev.hasPrice&&row.hasPrice)m.set(k,row);}return[...m.values()]})()`;

export function patchTrekBiPriceField(source = '', options = {}) {
  let js = String(source || '');
  if (js.includes(BI_PRICE_NEEDLE)) return js.replace(BI_PRICE_NEEDLE, BI_PRICE_PATCH);
  if (options.served && !js.includes('const pick=v=>v===""||v==null?null:v')) {
    throw new Error('trek bi() price patch did not apply');
  }
  return js;
}

export function patchTrekBudgetRowDedupe(source = '', options = {}) {
  let js = String(source || '');
  if (js.includes(BUDGET_MO_DEDUPE_NEEDLE)) {
    js = js.replace(BUDGET_MO_DEDUPE_NEEDLE, BUDGET_MO_DEDUPE_PATCH);
  } else if (js.includes(BUDGET_MO_TIMELINE_NEEDLE)) {
    js = js.replace(BUDGET_MO_TIMELINE_NEEDLE, BUDGET_MO_TIMELINE_PATCH);
  } else if (options.served && !js.includes('!prev.hasPrice&&row.hasPrice')) {
    throw new Error('trek budget Mo() dedupe patch did not apply');
  }
  return js;
}

export function patchSharedTripOeListRows(source = '') {
  let js = String(source || '');
  if (!js.includes('Oe=(G,Re,zt=!1)=>')) return js;
  js = patchCarBeGrid(js);
  if (js.includes(OE_HOTEL_JE_TITLE_NEEDLE)) {
    js = js.replace(OE_HOTEL_JE_TITLE_NEEDLE, OE_HOTEL_JE_TITLE_PATCH);
  } else if (
    !js.includes('data-ts-hotel-row-head":"1",style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,width:"100%",minWidth:0,maxWidth:"100%"')
  ) {
    throw new Error('shared trip Oe() hotel header patch did not apply');
  }
  if (js.includes(WR_SORT_ROW_NEEDLE)) {
    js = js.replace(WR_SORT_ROW_NEEDLE, WR_SORT_ROW_PATCH);
  }
  if (js.includes(OE_LIST_ROW_PREP_NEEDLE)) {
    js = js.replace(OE_LIST_ROW_PREP_NEEDLE, OE_LIST_ROW_PREP_PATCH);
  } else if (!js.includes('"data-list-row":"1","data-has-logo":tsRowHasLogo')) {
    throw new Error('shared trip Oe() list row marker patch did not apply');
  }
  if (js.includes(OE_LIST_ROW_ALT_NEEDLE)) {
    js = js.replace(OE_LIST_ROW_ALT_NEEDLE, OE_LIST_ROW_ALT_PATCH);
  } else if (!js.includes('tsRowHasLogo,"data-logo-src":tsRowLogo')) {
    throw new Error('shared trip Oe() compact list row marker patch did not apply');
  }
  if (js.includes(HOTELS_TAB_PANEL_NEEDLE)) js = js.replace(HOTELS_TAB_PANEL_NEEDLE, HOTELS_TAB_PANEL_PATCH);
  if (js.includes(CARS_TAB_PANEL_NEEDLE)) js = js.replace(CARS_TAB_PANEL_NEEDLE, CARS_TAB_PANEL_PATCH);
  if (js.includes(OE_ROW_SUMMARY_NEEDLE)) {
    js = js.replaceAll(OE_ROW_SUMMARY_NEEDLE, OE_ROW_SUMMARY_PATCH);
  } else if (!js.includes('"data-list-summary":"1","data-summary-src":"thing"')) {
    throw new Error('shared trip Oe() row summary patch did not apply');
  }
  if (js.includes(OE_ROW_TITLE_SPAN_NEEDLE)) {
    js = js.replaceAll(OE_ROW_TITLE_SPAN_NEEDLE, OE_ROW_TITLE_SPAN_PATCH);
  }
  if (js.includes(OE_ROW_ZN_STRONG_NEEDLE)) {
    js = js.replace(OE_ROW_ZN_STRONG_NEEDLE, OE_ROW_ZN_STRONG_PATCH);
  } else if (!js.includes('Zi(G)?n.jsx(je,{item:G,title:ua}):n.jsx("strong",{children:ua})')) {
    throw new Error('shared trip Oe() default row title must wrap ua in strong for Gate B name line');
  }
  return js;
}
