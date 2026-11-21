const CME_SIGHTSEEING_ICON_NEEDLE =
  'i==="artist"?"🎨":i==="theatre"?"🎭":i==="event"&&/family';
const CME_SIGHTSEEING_ICON_PATCH =
  'i==="artist"?"🎨":i==="theatre"?"🎭":i==="sightseeing"||i==="attraction"||i==="activity"?/hike|trail|walk|trek|climb|mountain|canyon|reserve/.test(c)?"🥾":/beach|cove|coast|ocean|surf|swim/.test(c)?"🏖️":/park|forest|garden|nature|botanical/.test(c)?"🌲":/museum|gallery|mission|monument|castle|cathedral/.test(c)?"🏛️":"🗺️":i==="tour"?"🎟️":i==="event"&&/family';

const CME_CAR_BOUNDARY_NEEDLE =
  'el|lodging|accommodation/.test(c)?"🧳":/car|rental|hertz|avis|enterprise|budget ren';
const CME_CAR_BOUNDARY_PATCH =
  'el|lodging|accommodation/.test(c)?"🧳":/\\bcar\\b|rental|hertz|avis|enterprise|budget ren';

const MN_ACTIVITY_CATS_NEEDLE =
  'Re.includes("music")||Re.includes("jazz")?"music":Re.includes("event")?"event":Re||"other"},Fn=G=>{';
const MN_ACTIVITY_CATS_PATCH =
  'Re.includes("music")||Re.includes("jazz")?"music":Re.includes("sightseeing")?"sightseeing":Re.includes("attraction")?"attraction":Re.includes("activity")?"activity":Re.includes("event")?"event":Re||"other"},Fn=G=>{';

const YD_MUSIC_NEEDLE =
  'happy hour|brewery|rooftop/i.test(zt)?"bar":/jazz|music|festival|vanguard|smoke|blue';
const YD_MUSIC_PATCH =
  'happy hour|brewery|rooftop/i.test(zt)?"bar":Re==="music"||/jazz|music|festival|vanguard|smoke|blue';

const YD_SIGHTSEEING_TOUR_NEEDLE =
  'class|climbing gym/i.test(zt)?"workout":/sightseeing|statue|ellis island|liberty|observation|viewpoint|landmark|scenic/i.test(zt)?"sightseeing":Re==="tour"||/tour|walking|audio history|boat/i.test(zt)?"tour":Re==="event"?"event":';
const YD_SIGHTSEEING_TOUR_PATCH =
  'class|climbing gym/i.test(zt)?"workout":Re==="sightseeing"||Re==="attraction"||Re==="activity"||/sightseeing|hike|trail|beach|cove|reserve|park|coast|garden|mission|museum|aquarium|statue|ellis island|liberty|observation|viewpoint|landmark|scenic|lighthouse|monument/i.test(zt)?"sightseeing":Re==="tour"||/tour|walking|audio history|boat|kayak|cruise|tasting|winery/i.test(zt)?"tour":Re==="event"?"event":';

const CONFIG_OPTIONS_MCP_NEEDLE =
  'Xe&&n.jsxs("div",{style:{position:"absolute",top:36,left:"50%",transform:"translateX(-50%)",zIndex:20,width:136,background:"rgba(255,255,255,0.98)",color:"#111827",border:"1px solid rgba(15,23,42,0.10)",borderRadius:14,boxShadow:"0 14px 40px rgba(0,0,0,0.22)",padding:8,textAlign:"left"},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,color:"#6b7280",textTransform:"uppercase",letterSpacing:.8,padding:"4px 8px 6px",textAlign:"center"},children:"Trip View"}),["flights","hotels","cars"].map(G=>n.jsxs("button",{type:"button",onClick:()=>Nt(G,!xn(G)),style:Ra,children:[n.jsx("input",{type:"checkbox",checked:xn(G),readOnly:!0,style:{pointerEvents:"none"}}),n.jsx("span",{children:G==="flights"?"Flights":G==="hotels"?"Hotels":"Cars"})]},G))]})';
const CONFIG_OPTIONS_MCP_PATCH =
  'Xe&&n.jsxs("div",{style:{position:"absolute",top:36,left:"50%",transform:"translateX(-50%)",zIndex:20,width:136,background:"rgba(255,255,255,0.98)",color:"#111827",border:"1px solid rgba(15,23,42,0.10)",borderRadius:14,boxShadow:"0 14px 40px rgba(0,0,0,0.22)",padding:8,textAlign:"left"},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,color:"#6b7280",textTransform:"uppercase",letterSpacing:.8,padding:"4px 8px 6px",textAlign:"center"},children:"Vacation View"}),["flights","hotels","cars"].map(G=>n.jsxs("button",{type:"button",onClick:()=>Nt(G,!xn(G)),style:Ra,children:[n.jsx("input",{type:"checkbox",checked:xn(G),readOnly:!0,style:{pointerEvents:"none"}}),n.jsx("span",{children:G==="flights"?"Flights":G==="hotels"?"Hotels":"Cars"})]},G))]})';

const GRID_STATE_NEEDLE =
  ',[We,Mt]=I.useState(null),[Sa,Kt]=I.useState(!1),[tsEd,tsSetEd]=I.useState(()=>typeof window<"u"&&window.innerWidth>=760);';
const GRID_STATE_PATCH =
  ',[We,Mt]=I.useState(null),[Sa,Kt]=I.useState(!1),[tsGridOpen,tsSetGridOpen]=I.useState(!1),[tsEd,tsSetEd]=I.useState(()=>typeof window<"u"&&window.innerWidth>=760);';

const GRID_OUTSIDE_NEEDLE =
  '(Rn=zt==null?void 0:zt.closest)!=null&&Rn.call(zt,"[data-trip-view-root]")||Ye(!1)';
const GRID_OUTSIDE_PATCH =
  '(Rn=zt==null?void 0:zt.closest)!=null&&Rn.call(zt,"[data-trip-view-root]")||Ye(!1),(zt==null?void 0:zt.closest)&&zt.closest("[data-ts-vacation-grid-root]")||tsSetGridOpen(!1)';

const BOTTOM_GRID_NEEDLE =
  'n.jsxs("div",{style:{textAlign:"center",padding:"40px 0 20px"},children:[n.jsx("span",{"data-vk-footer-tagline":"1",style:{display:"none"},children:"AI-assisted vacation itinerary planning"})]})';
const BOTTOM_GRID_PATCH =
  'n.jsxs("div",{className:"no-print",style:{textAlign:"center",padding:"24px 0 28px",position:"relative"},children:[n.jsx("span",{"data-vk-footer-tagline":"1",style:{display:"none"},children:"AI-assisted vacation itinerary planning"}),n.jsxs("div",{"data-ts-vacation-grid-root":"1",style:{position:"relative",display:"inline-flex",justifyContent:"center"},children:[n.jsx("button",{type:"button","data-ts-vacation-grid-btn":"1","aria-label":"Vacation Admin","aria-expanded":tsGridOpen,onClick:()=>tsSetGridOpen(G=>!G),style:{width:36,height:36,borderRadius:10,border:"1px solid rgba(15,23,42,0.14)",background:tsGridOpen?"#0f172a":"rgba(255,255,255,0.94)",color:tsGridOpen?"#ffffff":"#475569",display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"pointer",boxShadow:"0 4px 12px rgba(15,23,42,0.08)"},children:n.jsxs("svg",{width:16,height:16,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:[n.jsx("rect",{x:3,y:3,width:7,height:7,rx:1.5}),n.jsx("rect",{x:14,y:3,width:7,height:7,rx:1.5}),n.jsx("rect",{x:3,y:14,width:7,height:7,rx:1.5}),n.jsx("rect",{x:14,y:14,width:7,height:7,rx:1.5})]})}),tsGridOpen&&n.jsxs("div",{"data-ts-vacation-grid-menu":"1",role:"menu",style:{position:"absolute",bottom:44,left:"50%",transform:"translateX(-50%)",zIndex:1200,width:210,background:"rgba(255,255,255,0.99)",color:"#111827",border:"1px solid rgba(15,23,42,0.12)",borderRadius:14,boxShadow:"0 14px 40px rgba(0,0,0,0.22)",padding:8,textAlign:"left"},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,color:"#6b7280",textTransform:"uppercase",letterSpacing:.8,padding:"4px 8px 6px",textAlign:"center"},children:"Show / Hide"}),["flights","cars","hotels"].map(G=>n.jsxs("button",{type:"button","data-ts-grid-toggle":G,onClick:()=>Nt(G,!xn(G)),style:Ra,children:[n.jsx("input",{type:"checkbox",checked:xn(G),readOnly:!0,style:{pointerEvents:"none"}}),n.jsx("span",{children:G==="flights"?"Flights":G==="cars"?"Cars":"Hotels"})]},G)),Ce&&n.jsxs("div",{style:{marginTop:4,paddingTop:4,borderTop:"1px solid #e5e7eb"},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,color:"#6b7280",textTransform:"uppercase",letterSpacing:.8,padding:"4px 8px 6px",textAlign:"center"},children:"AI Access & Approvals"}),n.jsx("button",{type:"button","data-ts-mcp-open":"approvals",onClick:()=>{tsSetGridOpen(!1),window.__tsOpenMcpPanel&&window.__tsOpenMcpPanel("approvals")},style:Ra,children:"Pending AI approvals"}),n.jsx("button",{type:"button","data-ts-mcp-open":"tokens",onClick:()=>{tsSetGridOpen(!1),window.__tsOpenMcpPanel&&window.__tsOpenMcpPanel("tokens")},style:Ra,children:"AI access tokens"})]})]})]})]})';

const REPLACEMENTS = [
  ['vk1066 cme sightseeing icon', CME_SIGHTSEEING_ICON_NEEDLE, CME_SIGHTSEEING_ICON_PATCH],
  ['vk1066 cme car boundary', CME_CAR_BOUNDARY_NEEDLE, CME_CAR_BOUNDARY_PATCH],
  ['vk1066 Mn activity categories', MN_ACTIVITY_CATS_NEEDLE, MN_ACTIVITY_CATS_PATCH],
  ['vk1066 Yd music category', YD_MUSIC_NEEDLE, YD_MUSIC_PATCH],
  ['vk1066 Yd sightseeing/tour categories', YD_SIGHTSEEING_TOUR_NEEDLE, YD_SIGHTSEEING_TOUR_PATCH],
  ['vk1066 Config Options MCP menu', CONFIG_OPTIONS_MCP_NEEDLE, CONFIG_OPTIONS_MCP_PATCH],
  ['vk1070 grid admin state', GRID_STATE_NEEDLE, GRID_STATE_PATCH],
  ['vk1070 grid admin outside click', GRID_OUTSIDE_NEEDLE, GRID_OUTSIDE_PATCH],
  ['vk1070 bottom grid admin menu', BOTTOM_GRID_NEEDLE, BOTTOM_GRID_PATCH],
];

export function patchVk1066McpUi(source = '') {
  let js = String(source || '');
  for (const [label, needle, patch] of REPLACEMENTS) {
    if (js.includes(patch)) continue;
    if (!js.includes(needle)) throw new Error(`${label} anchor missing`);
    js = js.replace(needle, patch);
  }
  return js;
}
