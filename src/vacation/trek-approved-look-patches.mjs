/** Gate B v6: only list-row layout needles may change outside icon boxes. */

const LOGO_GRID_NEEDLE = 'gridTemplateColumns:"28px minmax(0, 1fr)",gap:9,alignItems:"center",width:"100%",minWidth:0},children:[n.jsx(dc,{item:G}),n.jsx("span",{"data-ts-list-row-name":"1"';
const LOGO_GRID_PATCH = 'gridTemplateColumns:(bn(G)||Mi(G)||Zi(G))?"16px minmax(0,1fr)":"minmax(0,1fr)",gap:6,alignItems:"center",width:"100%",minWidth:0},children:[(bn(G)||Mi(G)||Zi(G))?n.jsx("span",{style:{display:"grid",placeItems:"center",alignSelf:"center",width:16,minWidth:16,height:16,flex:"0 0 16px"},children:n.jsx(dc,{item:G,size:16})}):null,n.jsx("span",{"data-ts-list-row-name":"1"';

const ROW_GRID_NEEDLE = 'gridTemplateColumns:"minmax(0,1fr) auto auto",gap:8,alignItems:"center",minWidth:0,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),kl(G),';
const ROW_GRID_PATCH = 'gridTemplateColumns:"minmax(0,1.15fr) minmax(0,1fr) max-content max-content",gap:8,alignItems:"center",width:"100%",minWidth:0,maxWidth:"100%",overflow:"hidden"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),Pn?n.jsx("span",{"data-list-summary":"1","data-summary-src":"thing",style:{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:(typeof window<"u"&&window.innerWidth>=760)?"100%":"183px",minWidth:0,color:"#475569",fontSize:11,fontWeight:700,lineHeight:1.35},children:Pn}):null,kl(G),';

const SUMMARY_LINE_NEEDLE = 'Pn?n.jsx("div",{"data-list-summary":"1","data-summary-src":"thing",style:{marginTop:6,fontSize:11,fontWeight:700,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#475569",lineHeight:1.4},children:Pn}):null';
const SUMMARY_LINE_PATCH = 'null';

const HOTEL_LINE_NEEDLE = 'gridTemplateColumns:"minmax(0,1fr) auto",gap:8,width:"100%",minWidth:0,maxWidth:"100%",alignItems:"center"},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:n.jsx("strong",{children:Re})}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,color:"#0f766e",fontWeight:900,flexShrink:0},children:ie(G)})]})';

const ROW_CLIP_NEEDLE = 'overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"';
const ROW_CLIP_PATCH = 'overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,minWidth:0,maxWidth:"100%",width:"100%"';

export function applyActivePillEdgePatch(js) {
  return js;
}

/** Shared-trip list row layout only (no header/footer/tab/day-map chrome). */
export function applyApprovedLookPatches(source = '') {
  let js = String(source || '');
  if (!js.includes('q==="plan"')) {
    return js;
  }
  if (js.includes(LOGO_GRID_NEEDLE)) js = js.replace(LOGO_GRID_NEEDLE, LOGO_GRID_PATCH);
  if (js.includes(ROW_GRID_NEEDLE)) js = js.replace(ROW_GRID_NEEDLE, ROW_GRID_PATCH);
  if (js.includes(SUMMARY_LINE_NEEDLE)) js = js.replace(SUMMARY_LINE_NEEDLE, SUMMARY_LINE_PATCH);
  if (
    js.includes('gridTemplateColumns:"minmax(0,1fr) auto auto",gap:8,width:"100%",minWidth:0,alignItems:"center"},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:n.jsx("strong",{children:Re})}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,color:"#0f766e",fontWeight:900,flexShrink:0},children:ie(G)}),n.jsx("span"')
  ) {
    js = js.replace(
      'gridTemplateColumns:"minmax(0,1fr) auto auto",gap:8,width:"100%",minWidth:0,alignItems:"center"},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:n.jsx("strong",{children:Re})}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,color:"#0f766e",fontWeight:900,flexShrink:0},children:ie(G)}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:ha(G).roomType||ha(G).room_type||""})]})',
      HOTEL_LINE_NEEDLE,
    );
  }
  if (js.includes(ROW_CLIP_NEEDLE)) js = js.replaceAll(ROW_CLIP_NEEDLE, ROW_CLIP_PATCH);
  return js;
}
