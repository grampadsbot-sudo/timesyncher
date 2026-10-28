const OE_LIST_ROW_PREP_NEEDLE = 'Xr=fo(G);return Sa?n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:10,padding:"8px 10px",border:"1px solid var(--border-faint, #e5e7eb)",minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto"';
const OE_LIST_ROW_PREP_PATCH = 'Xr=fo(G);const tsRowLogo=_l(G),tsRowHasLogo=tsRowLogo?"1":"0";return Sa?n.jsxs("li",{"data-list-row":"1","data-has-logo":tsRowHasLogo,"data-logo-src":tsRowLogo||"","data-thing-category":It(G),style:{listStyle:"none",background:"var(--bg-card, white)",borderRadius:10,padding:"8px 10px",border:"1px solid var(--border-faint, #e5e7eb)",minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto"';
const OE_LIST_ROW_ALT_NEEDLE = '},`${It(G)}-${Qt(G)}-${ua}`):n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:10,padding:"8px 10px",border:"1px solid var(--border-faint, #e5e7eb)",minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),title:Pn||"Open details"';
const OE_LIST_ROW_ALT_PATCH = '},`${It(G)}-${Qt(G)}-${ua}`):n.jsxs("li",{"data-list-row":"1","data-has-logo":tsRowHasLogo,"data-logo-src":tsRowLogo||"","data-thing-category":It(G),style:{listStyle:"none",background:"var(--bg-card, white)",borderRadius:10,padding:"8px 10px",border:"1px solid var(--border-faint, #e5e7eb)",minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),title:Pn||"Open details"';
const HOTELS_DESC_CLAMP_CSS = '[data-shared-live-tab="hotels"] [data-list-summary="1"][data-list-description="1"]{display:block!important;overflow:hidden!important;white-space:nowrap!important;text-overflow:ellipsis!important;overflow-wrap:normal!important;word-break:normal!important;line-height:1.4!important;max-height:1.4em!important}';
const HOTELS_TAB_PANEL_NEEDLE = 'q==="hotels"&&n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx(Wr,{listKey:"hotels"})';
const HOTELS_TAB_PANEL_PATCH = `q==="hotels"&&n.jsxs("div",{"data-shared-live-tab":"hotels",style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx("style",{children:'${HOTELS_DESC_CLAMP_CSS}'}),n.jsx(Wr,{listKey:"hotels"})`;
const CARS_TAB_PANEL_NEEDLE = 'q==="cars"&&n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx(Wr,{listKey:"cars"})';
const CARS_TAB_PANEL_PATCH = 'q==="cars"&&n.jsxs("div",{"data-shared-live-tab":"cars",style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx(Wr,{listKey:"cars"})';

const OE_ROW_SUMMARY_NEEDLE = 'n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),title:Pn||"Open details",style:{marginTop:6,border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:Pn?"#475569":"#9ca3af",fontSize:11,fontWeight:700,width:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:Pn||"Open details for summary"})';
const OE_ROW_SUMMARY_PATCH = 'Pn?n.jsx("div",{"data-list-summary":"1","data-summary-src":"thing",style:{marginTop:6,fontSize:11,fontWeight:700,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#475569",lineHeight:1.4},children:Pn}):null';

const OE_ROW_TEXT_ORIGINAL = 'Oe=(G,Re,zt=!1)=>{const ua=Bs(mr(G)),Rn=Bs(rr(G)),Pn=';
const OE_ROW_TEXT_NEEDLE = 'Oe=(G,Re,zt=!1)=>{const ua=Bs(mr(G)),Rn=Bs((Zi(G)?[ha(G).longDetails,ha(G).description,G.longDetails,G.description,ha(G).sourceRecord?.longDetails,ha(G).sourceRecord?.description].map(v=>String(v||"").trim()).find(Boolean):"")||rr(G)),Pn=';
const OE_ROW_TEXT_PATCH = 'Oe=(G,Re,zt=!1)=>{const ua=Bs(mr(G)),Rn=Bs(rr(G)),Ld=Bs(Zi(G)?[ha(G).longDetails,ha(G).description,G.longDetails,G.description,ha(G).sourceRecord?.longDetails,ha(G).sourceRecord?.description].map(v=>String(v||"").trim()).find(Boolean):""),Pn=';
const OE_ROW_TEXT_LD_MARKER = 'Rn=Bs(rr(G)),Ld=Bs(Zi(G)?';
const OE_ROW_SUMMARY_PRIOR = 'Pn?n.jsx("div",{"data-list-summary":"1","data-summary-src":"thing","data-list-description":Zi(G)?"1":undefined,style:{marginTop:6,fontSize:11,fontWeight:700,width:"100%",minWidth:0,overflow:"hidden",textOverflow:Zi(G)?"clip":"ellipsis",whiteSpace:Zi(G)?"normal":"nowrap",overflowWrap:Zi(G)?"break-word":undefined,color:"#475569",lineHeight:1.4},children:Pn}):null';
const HOTELS_TAB_PANEL_PRIOR = '[data-shared-live-tab="hotels"] [data-list-summary="1"][data-list-description="1"]{white-space:normal!important;text-overflow:clip!important;overflow-wrap:anywhere}';
const HOTELS_TAB_PANEL_CLAMP_PRIOR = '[data-shared-live-tab="hotels"] [data-list-summary="1"][data-list-description="1"]{display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:2!important;overflow:hidden!important;white-space:normal!important;text-overflow:ellipsis!important;overflow-wrap:anywhere!important;line-height:1.4!important;max-height:2.85em}';
const HOTELS_DESC_CLAMP_BREAK_PRIOR = '[data-shared-live-tab="hotels"] [data-list-summary="1"][data-list-description="1"]{display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:2!important;overflow:hidden!important;white-space:normal!important;text-overflow:ellipsis!important;overflow-wrap:break-word!important;line-height:1.4!important;max-height:2.85em}';
const OE_ROW_SUMMARY_WRAP_PRIOR = '(Zi(G)?Ld:Rn)?n.jsx("div",{"data-list-summary":"1","data-summary-src":"thing","data-list-description":Zi(G)&&Ld?"1":undefined,style:{marginTop:6,fontSize:11,fontWeight:700,width:"100%",minWidth:0,overflow:"hidden",textOverflow:Zi(G)&&Ld?"clip":"ellipsis",whiteSpace:Zi(G)&&Ld?"normal":"nowrap",overflowWrap:Zi(G)&&Ld?"break-word":undefined,color:"#475569",lineHeight:1.4},children:Zi(G)?Ld||Rn:Rn}):null';
const OE_ROW_SUMMARY_LD_PRIOR = '(Zi(G)?Ld:Rn)?n.jsx("div",{"data-list-summary":"1","data-summary-src":"thing","data-list-description":Zi(G)&&Ld?"1":undefined,style:{marginTop:6,fontSize:11,fontWeight:700,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#475569",lineHeight:1.4},children:Zi(G)?Ld||Rn:Rn}):null';

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
const OE_HOTEL_JE_TITLE_PATCH = 'je=({item:G,title:Re})=>n.jsxs("span",{"data-ts-hotel-row-head":"1","data-ts-list-row-name":"1",style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,width:"100%",minWidth:0,maxWidth:"100%",alignItems:"center"},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,maxWidth:"100%"},children:n.jsx("strong",{style:{display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,maxWidth:"100%"},children:Re})}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,color:"#0f766e",fontWeight:900,flexShrink:0},children:ie(G)})]})';

const WR_SORT_ROW_NEEDLE = 'Wr=({listKey:G})=>{const Re=K[G]||{key:"name",dir:"asc"},zt=ua=>Re.key===ua?Re.dir==="asc"?" ↑":" ↓":"";return n.jsxs("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2},children:';
const WR_SORT_ROW_PATCH = 'Wr=({listKey:G})=>{const Re=K[G]||{key:"name",dir:"asc"},zt=ua=>Re.key===ua?Re.dir==="asc"?" ↑":" ↓":"";return n.jsxs("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2,minWidth:0,maxWidth:"100%"},children:';

export function patchSharedTripOeListRows(source = '') {
  let js = String(source || '');
  if (!js.includes('Oe=(G,Re,zt=!1)=>')) return js;
  if (js.includes(OE_ROW_TEXT_NEEDLE)) {
    js = js.replace(OE_ROW_TEXT_NEEDLE, OE_ROW_TEXT_PATCH);
  } else if (js.includes(OE_ROW_TEXT_ORIGINAL)) {
    js = js.replace(OE_ROW_TEXT_ORIGINAL, OE_ROW_TEXT_PATCH);
  } else if (!js.includes(OE_ROW_TEXT_LD_MARKER)) {
    throw new Error('shared trip Oe() hotel description binding did not apply');
  }
  js = patchCarBeGrid(js);
  if (js.includes(OE_HOTEL_JE_TITLE_NEEDLE)) {
    js = js.replace(OE_HOTEL_JE_TITLE_NEEDLE, OE_HOTEL_JE_TITLE_PATCH);
  } else if (
    !js.includes('data-ts-hotel-row-head":"1","data-ts-list-row-name":"1",style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,width:"100%",minWidth:0,maxWidth:"100%"')
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
  else if (js.includes(HOTELS_TAB_PANEL_PRIOR)) js = js.replace(HOTELS_TAB_PANEL_PRIOR, HOTELS_DESC_CLAMP_CSS);
  else if (js.includes(HOTELS_TAB_PANEL_CLAMP_PRIOR) && HOTELS_TAB_PANEL_CLAMP_PRIOR !== HOTELS_DESC_CLAMP_CSS) {
    js = js.replace(HOTELS_TAB_PANEL_CLAMP_PRIOR, HOTELS_DESC_CLAMP_CSS);
  }
  if (js.includes(HOTELS_DESC_CLAMP_BREAK_PRIOR)) js = js.replaceAll(HOTELS_DESC_CLAMP_BREAK_PRIOR, HOTELS_DESC_CLAMP_CSS);
  if (js.includes(CARS_TAB_PANEL_NEEDLE)) js = js.replace(CARS_TAB_PANEL_NEEDLE, CARS_TAB_PANEL_PATCH);
  if (js.includes(OE_ROW_SUMMARY_NEEDLE)) {
    js = js.replaceAll(OE_ROW_SUMMARY_NEEDLE, OE_ROW_SUMMARY_PATCH);
  } else if (js.includes(OE_ROW_SUMMARY_LD_PRIOR)) {
    js = js.replaceAll(OE_ROW_SUMMARY_LD_PRIOR, OE_ROW_SUMMARY_PATCH);
  } else if (js.includes(OE_ROW_SUMMARY_WRAP_PRIOR)) {
    js = js.replaceAll(OE_ROW_SUMMARY_WRAP_PRIOR, OE_ROW_SUMMARY_PATCH);
  } else if (js.includes(OE_ROW_SUMMARY_PRIOR)) {
    js = js.replaceAll(OE_ROW_SUMMARY_PRIOR, OE_ROW_SUMMARY_PATCH);
  } else if (!js.includes(OE_ROW_SUMMARY_PATCH)) {
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
