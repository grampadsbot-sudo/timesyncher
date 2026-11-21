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
  'Xe&&n.jsxs("div",{style:{position:"absolute",top:36,left:"50%",transform:"translateX(-50%)",zIndex:20,width:186,background:"rgba(255,255,255,0.98)",color:"#111827",border:"1px solid rgba(15,23,42,0.10)",borderRadius:14,boxShadow:"0 14px 40px rgba(0,0,0,0.22)",padding:8,textAlign:"left"},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,color:"#6b7280",textTransform:"uppercase",letterSpacing:.8,padding:"4px 8px 6px",textAlign:"center"},children:"Vacation View"}),["flights","hotels","cars"].map(G=>n.jsxs("button",{type:"button",onClick:()=>Nt(G,!xn(G)),style:Ra,children:[n.jsx("input",{type:"checkbox",checked:xn(G),readOnly:!0,style:{pointerEvents:"none"}}),n.jsx("span",{children:G==="flights"?"Flights":G==="hotels"?"Hotels":"Cars"})]},G)),Ce&&n.jsxs("div",{style:{marginTop:4,paddingTop:4,borderTop:"1px solid #e5e7eb"},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,color:"#6b7280",textTransform:"uppercase",letterSpacing:.8,padding:"4px 8px 6px",textAlign:"center"},children:"AI Access & Approvals"}),n.jsx("button",{type:"button","data-ts-mcp-open":"approvals",onClick:()=>{Ye(!1),window.__tsOpenMcpPanel&&window.__tsOpenMcpPanel("approvals")},style:Ra,children:"Pending AI approvals"}),n.jsx("button",{type:"button","data-ts-mcp-open":"tokens",onClick:()=>{Ye(!1),window.__tsOpenMcpPanel&&window.__tsOpenMcpPanel("tokens")},style:Ra,children:"AI access tokens"})]})]})';

const REPLACEMENTS = [
  ['vk1066 cme sightseeing icon', CME_SIGHTSEEING_ICON_NEEDLE, CME_SIGHTSEEING_ICON_PATCH],
  ['vk1066 cme car boundary', CME_CAR_BOUNDARY_NEEDLE, CME_CAR_BOUNDARY_PATCH],
  ['vk1066 Mn activity categories', MN_ACTIVITY_CATS_NEEDLE, MN_ACTIVITY_CATS_PATCH],
  ['vk1066 Yd music category', YD_MUSIC_NEEDLE, YD_MUSIC_PATCH],
  ['vk1066 Yd sightseeing/tour categories', YD_SIGHTSEEING_TOUR_NEEDLE, YD_SIGHTSEEING_TOUR_PATCH],
  ['vk1066 Config Options MCP menu', CONFIG_OPTIONS_MCP_NEEDLE, CONFIG_OPTIONS_MCP_PATCH],
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
