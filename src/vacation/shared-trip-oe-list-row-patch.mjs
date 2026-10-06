const OE_LIST_ROW_PREP_NEEDLE = 'Xr=fo(G);return Sa?n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:10,padding:"8px 10px",border:"1px solid var(--border-faint, #e5e7eb)",minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto"';
const OE_LIST_ROW_PREP_PATCH = 'Xr=fo(G);const tsRowLogo=_l(G),tsRowHasLogo=tsRowLogo?"1":"0";return Sa?n.jsxs("li",{"data-list-row":"1","data-has-logo":tsRowHasLogo,"data-logo-src":tsRowLogo||"","data-thing-category":It(G),style:{listStyle:"none",background:"var(--bg-card, white)",borderRadius:10,padding:"8px 10px",border:"1px solid var(--border-faint, #e5e7eb)",minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto"';
const OE_LIST_ROW_ALT_NEEDLE = '},`${It(G)}-${Qt(G)}-${ua}`):n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:10,padding:"8px 10px",border:"1px solid var(--border-faint, #e5e7eb)",minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),title:Pn||"Open details"';
const OE_LIST_ROW_ALT_PATCH = '},`${It(G)}-${Qt(G)}-${ua}`):n.jsxs("li",{"data-list-row":"1","data-has-logo":tsRowHasLogo,"data-logo-src":tsRowLogo||"","data-thing-category":It(G),style:{listStyle:"none",background:"var(--bg-card, white)",borderRadius:10,padding:"8px 10px",border:"1px solid var(--border-faint, #e5e7eb)",minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),title:Pn||"Open details"';
const HOTELS_TAB_PANEL_NEEDLE = 'q==="hotels"&&n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx(Wr,{listKey:"hotels"})';
const HOTELS_TAB_PANEL_PATCH = 'q==="hotels"&&n.jsxs("div",{"data-shared-live-tab":"hotels",style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx(Wr,{listKey:"hotels"})';
const CARS_TAB_PANEL_NEEDLE = 'q==="cars"&&n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx(Wr,{listKey:"cars"})';
const CARS_TAB_PANEL_PATCH = 'q==="cars"&&n.jsxs("div",{"data-shared-live-tab":"cars",style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsx(Wr,{listKey:"cars"})';

/** Gate B markers on served shared-trip Oe() catalog rows (li + data-shared-live-tab panels). */
export function patchSharedTripOeListRows(source = '') {
  let js = String(source || '');
  if (!js.includes('Oe=(G,Re,zt=!1)=>')) return js;
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
  return js;
}
