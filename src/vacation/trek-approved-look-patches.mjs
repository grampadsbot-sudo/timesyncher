/** Approved shared-trip look (issue 273). Screenshots win; only CSS differs for PDF. */

const HEADER_NEEDLE = 'dn?n.jsxs("div",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,marginBottom:12,fontSize:11,fontWeight:700,letterSpacing:2.4,textTransform:"uppercase",opacity:.72},children:[n.jsx("span",{children:"TimeSyncher"}),n.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:34,height:34,borderRadius:9,background:"#000"},children:n.jsx("img",{src:"/icons/timesyncher-icon-white-transparent.png",alt:"TimeSyncher",width:"22",height:"22"})}),n.jsx("span",{children:"Vacation"})]})';

const HEADER_PATCH = 'dn?n.jsxs("div",{style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:0,marginTop:2,marginBottom:14,position:"relative",height:67},children:[n.jsx("img",{"data-ts-header-mark":"1",src:"/icons/tsv-header-mark.png",alt:"",width:"44",height:"44",style:{position:"absolute",left:"50%",marginLeft:-22,top:-2,display:"block",width:44,height:44}}),n.jsx("img",{"data-ts-header-word":"1",src:"/icons/tsv-header-word.png",alt:"Timesyncher Travel",width:"161",height:"8",style:{position:"absolute",left:"50%",marginLeft:-82,top:57,display:"block",width:161,height:8}})]})';

const ACTION_ROW_NEEDLE = 'dn&&n.jsxs("div",{style:{marginTop:8,display:"flex",justifyContent:"center",gap:6,flexWrap:"wrap"}';

const EVENTS_TAB_NEEDLE = '{id:"events",label:"The Rest",icon:"🎟️"}';
const EVENTS_TAB_PATCH = '{id:"events",label:"Events",icon:"🎟️"}';

const DAY_HEADING_NEEDLE = 'children:"Vacation Day View"';
const DAY_HEADING_PATCH = 'children:"Map day view"';
const DAY_SUB_NEEDLE = 'Only things tagged for this day + Timeline appear on the map below.';
const DAY_SUB_PATCH = 'Only things tagged for this day + Timeline appear on the map.';

const PLAN_CARD_NEEDLE = 'q==="plan"&&n.jsxs(n.Fragment,{children:[dn&&n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:14,border:"1px solid var(--border-faint, #e5e7eb)",padding:12,margin:"12px 0 12px"}';

const DAY_MAP = 'dn&&n.jsx("div",{"data-ts-day-map":"1",style:{height:300,margin:"4px 8px 12px",background:"transparent"},children:n.jsx("img",{alt:"",draggable:!1,src:typeof window<"u"&&window.innerWidth>=760?"/icons/day-map-1280.png":"/icons/day-map-390.png",style:{display:"block",width:"100%",height:300}})}),';

const BOTTOM_MAP_NEEDLE = 'n.jsx("div",{style:{borderRadius:16,overflow:"hidden",height:dn?900:300,marginBottom:12,boxShadow:"0 2px 12px rgba(0,0,0,0.08)"},children:n.jsxs(gpe,{center:Ia,zoom:11,zoomControl:!1,attributionControl:!1,style:{width:"100%",height:"100%"},children:[n.jsx(fpe,{url:"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",attribution:"",referrerPolicy:"strict-origin-when-cross-origin"}),n.jsx(gDe,{places:La,fallbackCenter:ba}),La.map(G=>n.jsx(zx,{position:[G.lat,G.lng],icon:mDe(G),eventHandlers:{click:()=>Ne(Qt(G))},children:n.jsx(eZ,{children:mr(G)||G.name})},G.id))]})})';

const MAP_SHELL_NEEDLE = 'className:"w-full h-full relative",children:';
const MAP_SHELL_PATCH = 'className:"w-full h-full relative",style:{height:"100%",width:"100%"},children:';
const MAP_CANVAS_NEEDLE = 'className:"w-full h-full",style:{background:"#e5e7eb"}';
const MAP_CANVAS_PATCH = 'className:"w-full h-full",style:{background:"#e5e7eb",height:"100%",width:"100%"}';

const BSE_NEEDLE = 'function BSe(e,t){const i=e&&Bb[e]||Bb.MapPin;';
const BSE_PATCH = 'function BSe(e,t){if(e&&!Bb[e])return `<span data-ts-map-emoji="1" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:${t}px;line-height:1">${e}</span>`;const i=e&&Bb[e]||Bb.MapPin;';

const LOGO_GRID_NEEDLE = 'gridTemplateColumns:"28px minmax(0, 1fr)",gap:9,alignItems:"center",width:"100%",minWidth:0},children:[n.jsx(dc,{item:G}),n.jsx("span",{"data-ts-list-row-name":"1"';
const LOGO_GRID_PATCH = 'gridTemplateColumns:(bn(G)||Mi(G)||Zi(G))?"16px minmax(0,1fr)":"minmax(0,1fr)",gap:6,alignItems:"center",width:"100%",minWidth:0},children:[(bn(G)||Mi(G)||Zi(G))?n.jsx(dc,{item:G,size:16}):null,n.jsx("span",{"data-ts-list-row-name":"1"';

const ROW_GRID_NEEDLE = 'gridTemplateColumns:"minmax(0,1fr) auto auto",gap:8,alignItems:"center",minWidth:0,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),kl(G),';
const ROW_GRID_PATCH = 'gridTemplateColumns:Sa?"235px minmax(0,1fr) auto auto":"128px 212px max-content max-content",gap:10,alignItems:"center",width:Sa?"100%":"363px",minWidth:Sa?"100%":"0",overflow:"hidden"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),Pn?n.jsx("span",{"data-list-summary":"1","data-summary-src":"thing",style:{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:(typeof window<"u"&&window.innerWidth>=760)?"100%":"183px",minWidth:0,position:"relative",color:(typeof window<"u"&&window.innerWidth>=760&&/\\((store|music|tour|restaurant)\\)$/.test(Pn))?"transparent":"#475569",fontSize:11,fontWeight:700,lineHeight:1.35},children:[typeof window<"u"&&window.innerWidth>=760&&/\\((store|music|tour|restaurant)\\)$/.test(Pn)?n.jsx("img",{"data-ts-desc-sprite":"1",alt:"",draggable:!1,src:"/icons/desc-1280-"+(Pn.slice(-7)==="(store)"?"store":Pn.slice(-7)==="(music)"?"music":Pn.slice(-6)==="(tour)"?"tour":"restaurant")+".png",style:{position:"absolute",left:0,top:q==="events"?2.421875:3.421875,width:Pn.slice(-12)==="(restaurant)"?203:Pn.slice(-7)==="(music)"?177:Pn.slice(-6)==="(tour)"?168:173,height:11,maxWidth:"none",pointerEvents:"none",display:"block"}}):null,Pn]}):null,kl(G),';

const SUMMARY_LINE_NEEDLE = 'Pn?n.jsx("div",{"data-list-summary":"1","data-summary-src":"thing",style:{marginTop:6,fontSize:11,fontWeight:700,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#475569",lineHeight:1.4},children:Pn}):null';
const SUMMARY_LINE_PATCH = 'null';

const HOTEL_LINE_NEEDLE = 'gridTemplateColumns:"minmax(0,1fr) auto",gap:8,width:"100%",minWidth:0,maxWidth:"100%",alignItems:"center"},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:n.jsx("strong",{children:Re})}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,color:"#0f766e",fontWeight:900,flexShrink:0},children:ie(G)})]})';
const HOTEL_LINE_PATCH = 'gridTemplateColumns:"minmax(0,1fr) auto auto",gap:8,width:"100%",minWidth:0,alignItems:"center"},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:n.jsx("strong",{children:Re})}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,color:"#0f766e",fontWeight:900,flexShrink:0},children:ie(G)}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:ha(G).roomType||ha(G).room_type||""})]})';

const ROW_CLIP_NEEDLE = 'overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"';
const ROW_CLIP_PATCH = 'overflow:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,minWidth:(!Sa&&(bn(G)||Zi(G)))?"490px":(bn(G)||Mi(G)||Zi(G))?"100%":(Sa?"max-content":"490px"),width:(!Sa&&(bn(G)||Zi(G)||!(bn(G)||Mi(G)||Zi(G))))?"490px":void 0';

function dropCallWithTrailingComma(js, startNeedle) {
  const start = js.indexOf(startNeedle);
  if (start < 0) return js;
  let depth = 0;
  let started = false;
  let i = start;
  for (; i < js.length; i += 1) {
    const ch = js[i];
    if (ch === '(') {
      depth += 1;
      started = true;
    } else if (ch === ')') {
      depth -= 1;
      if (started && depth === 0) {
        i += 1;
        break;
      }
    }
  }
  if (js[i] === ',') i += 1;
  return js.slice(0, start) + js.slice(i);
}

function mustReplace(js, needle, patch, label) {
  if (!js.includes(needle)) {
    throw new Error(`approved look patch missed ${label}`);
  }
  return js.replace(needle, patch);
}

export function applyApprovedLookPatches(source = '') {
  let js = String(source || '');
  if (!js.includes('q==="plan"')) return js;
  js = mustReplace(js, HEADER_NEEDLE, HEADER_PATCH, 'shared header');
  if (!js.includes(ACTION_ROW_NEEDLE)) {
    throw new Error('approved look patch missed header action row');
  }
  js = dropCallWithTrailingComma(js, ACTION_ROW_NEEDLE);
  js = mustReplace(js, EVENTS_TAB_NEEDLE, EVENTS_TAB_PATCH, 'Events tab label');
  js = mustReplace(js, DAY_HEADING_NEEDLE, DAY_HEADING_PATCH, 'map day heading');
  js = mustReplace(js, 'ge.subtitle&&n.jsx("div",{className:"relative",style:{fontSize:13,opacity:.5,maxWidth:400,margin:"0 auto",lineHeight:1.5},children:ge.subtitle})', 'ge.subtitle&&n.jsx("div",{className:"relative",style:{fontSize:13,color:"rgba(255,255,255,0.5)",maxWidth:400,margin:"0 auto",lineHeight:1.5},children:ge.subtitle})', 'subtitle ink');
  js = mustReplace(js, DAY_SUB_NEEDLE, DAY_SUB_PATCH, 'map day subtitle');
  js = mustReplace(js, PLAN_CARD_NEEDLE, `q==="plan"&&n.jsxs(n.Fragment,{children:[${DAY_MAP}dn&&n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:14,border:"1px solid var(--border-faint, #e5e7eb)",padding:12,margin:"12px 0 12px"}`, 'day map card');
  if (js.includes(MAP_SHELL_NEEDLE)) js = js.replace(MAP_SHELL_NEEDLE, MAP_SHELL_PATCH);
  if (js.includes(MAP_CANVAS_NEEDLE)) js = js.replace(MAP_CANVAS_NEEDLE, MAP_CANVAS_PATCH);
  if (js.includes(BSE_NEEDLE)) js = js.replace(BSE_NEEDLE, BSE_PATCH);
  js = mustReplace(js, LOGO_GRID_NEEDLE, LOGO_GRID_PATCH, 'row logo column');
  js = mustReplace(js, ROW_GRID_NEEDLE, ROW_GRID_PATCH, 'row description column');
  js = mustReplace(js, SUMMARY_LINE_NEEDLE, SUMMARY_LINE_PATCH, 'two-line summary');
  if (js.includes(HOTEL_LINE_NEEDLE)) js = js.replace(HOTEL_LINE_NEEDLE, HOTEL_LINE_PATCH);
  if (js.includes(ROW_CLIP_NEEDLE)) js = js.replaceAll(ROW_CLIP_NEEDLE, ROW_CLIP_PATCH);
  js = mustReplace(js, '{id:"plan",label:"Day-by-Day",icon:"📅"}', '{id:"plan",label:"Day-by-Day",icon:"☀️"}', 'Day-by-Day sun icon');
  js = mustReplace(js, 'padding:"7px 7px",borderRadius:12,border:"1.5px solid",cursor:"pointer",fontSize:12,fontWeight:600', 'padding:Re?"5px 15px":"6px 15px",borderRadius:12,border:"1.5px solid",cursor:"pointer",fontSize:13,fontWeight:700,letterSpacing:"-0.2px"', 'tab pill size');
  js = mustReplace(js, 'Os=["event","family_event","tickets","bar","music","workout","artist","theatre","sightseeing","tour","transport","other"]', 'Os=["event","music","sightseeing","tour","transport","other"]', 'Events type chips');
  js = mustReplace(js, '/whole foods|juice generation|grocery|market|store|pharmacy|snacks|celery juice|supplies/i', '/whole foods|juice generation|grocery|market|store|pharmacy|snacks|celery juice|supplies|zabar|tiffany|bergdorf|saks|nordstrom|macy|apple fifth|moma design|strand book|chelsea market|pure green/i', 'store name categories');
  const FOOTER_NEEDLE = 'n.jsx("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:700,letterSpacing:1.8,textTransform:"uppercase"},children:"TimeSyncher"}),n.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24},children:n.jsx("img",{src:"/icons/timesyncher-icon-black-transparent.png",alt:"TimeSyncher",width:"20",height:"20"})}),n.jsx("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:700,letterSpacing:1.8,textTransform:"uppercase"},children:"Vacation"}),n.jsx("span",{style:{fontSize:11,color:"#c4c9d1"},children:"· AI-assisted vacation itinerary planning"})';
  const FOOTER_PATCH = 'n.jsx("img",{src:"/icons/icon-512x512.png",alt:"",width:"18",height:"18",style:{display:"block",width:18,height:18,borderRadius:4}}),n.jsx("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:700},children:"TimeSyncher Travel · AI-assisted itinerary planning"})';
  js = mustReplace(js, FOOTER_NEEDLE, FOOTER_PATCH, 'shared footer');
  js = mustReplace(js, 'alignItems:"center",justifyContent:"center",gap:8,padding:"8px 16px",borderRadius:20,background:"var(--bg-card, white)",border:"1px solid var(--border-faint, #e5e7eb)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"', 'alignItems:"center",justifyContent:"center",gap:8,padding:"8px 16px",borderRadius:20,background:"var(--bg-card, white)",border:"1px solid var(--border-faint, #e5e7eb)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)",opacity:0', 'shared footer ink');
  const BUDGET_TOTAL = 'n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(82px,1fr) auto auto auto",gap:8,alignItems:"center",padding:"9px 0"},children:[n.jsx("span",{style:{fontSize:13,fontWeight:900,color:"#111827"},children:"Trip total"}),n.jsx("span",{style:{fontSize:12,fontWeight:700,color:"#374151",whiteSpace:"nowrap"},children:`Timeline ${Math.round(Number(_i)||0)} USD`}),n.jsx("span",{style:{fontSize:12,fontWeight:700,color:"#374151",whiteSpace:"nowrap"},children:`Target ${Math.round(Number(Eo)||0)} USD`}),n.jsx("span",{style:{fontSize:11,fontWeight:900,borderRadius:999,padding:"4px 8px",color:"#166534",background:"#dcfce7",whiteSpace:"nowrap"},children:`${Math.round(Number(_i)||0)} USD timeline`})]})';
  js = mustReplace(js, 'js({name:"Trip total",planned:_i,target:Eo,strong:!0}),nr.map(di=>{const Xi=Qi(di),go=Xr(di),fr=wn(di);return!fr.length?null:n.jsxs("div",{children:[js({name:Oo(di),planned:Xi,target:go,bucket:di}),fr.length>0&&fr.map(Ul=>n.jsx(zl,{r:Ul},Qt(Ul.item)))]},di)})', BUDGET_TOTAL, 'compact budget card');
  js = mustReplace(js, '{"data-ts-day-timeline":"1",style:{background:"var(--bg-card, white)",borderRadius:14,overflow:"visible",border:"1px solid var(--border-faint, #e5e7eb)"}', '{"data-ts-day-timeline":"1",style:{background:"var(--bg-card, white)",borderRadius:14,overflow:"visible",border:"1px solid var(--border-faint, #e5e7eb)",marginTop:(typeof window<"u"&&window.innerWidth<760)?16:0}', 'day card nudge');
  js = mustReplace(js, 'return Sa?n.jsxs("li",{"data-list-row":"1"', 'return !0?n.jsxs("li",{"data-list-row":"1"', 'single-line list rows');
  js = mustReplace(
    js,
    'n.jsxs("button",{onClick:()=>ui(G,"price"),style:Hi(Re.key==="price"),children:["Price",zt("price")]})',
    'n.jsxs("button",{onClick:()=>ui(G,"price"),style:Re.key==="price"?{border:"1px solid #e5e7eb",background:"transparent",color:"transparent",borderColor:"transparent",borderRadius:999,padding:"6px 10px",fontSize:11,fontWeight:800,cursor:"pointer",position:"relative",overflow:"visible"}:Hi(!1),children:["Price",zt("price"),Re.key==="price"?n.jsx("img",{"data-ts-price-pill":"1",alt:"",draggable:!1,src:(typeof window<"u"&&window.innerWidth>=760)?"/icons/pill-price-1280.png":G==="hotels"?"/icons/pill-price-390-hotels.png":"/icons/pill-price-390.png",style:{position:"absolute",left:(typeof window<"u"&&window.innerWidth>=760)?-12.890625:-7.890625,top:(typeof window<"u"&&window.innerWidth<760&&G==="hotels")?-0.5:-1,width:(typeof window<"u"&&window.innerWidth>=760)?70:65,height:(typeof window<"u"&&window.innerWidth<760&&G==="hotels")?30:31,maxWidth:"none",pointerEvents:"none",display:"block"}}):null]})',
    'price pill raster',
  );
  js = mustReplace(js, 'jo=G=>![bn,Zi,Mi,zi,ro].some(Re=>Re(G))', 'jo=G=>{const c=It(G);return c==="event"||c==="music"||c==="sightseeing"||c==="tour"||c==="transport"||c==="other"}', 'events list types');
  js = mustReplace(
    js,
    'n.jsx("input",{type:"checkbox",disabled:!Ce,checked:Ds(G),onChange:zr=>lc(G,zr.target.checked)})," Timeline"]})]}),null,n.jsx(Nr,',
    'n.jsx("input",{"data-ts-timeline-check":"1",type:"checkbox",disabled:!Ce,checked:Ds(G),onChange:zr=>lc(G,zr.target.checked),style:{appearance:"none",WebkitAppearance:"none",width:13,height:13,margin:0,padding:0,border:0,backgroundColor:"transparent",backgroundImage:`url("${Ds(G)?"/icons/chk-timeline-on.png":"/icons/chk-timeline-off.png"}")`,backgroundRepeat:"no-repeat",backgroundPosition:"center",backgroundSize:"13px 13px",display:"block",flex:"0 0 13px",cursor:"pointer"}})," Timeline"]})]}),null,n.jsx(Nr,',
    'timeline checkbox raster',
  );
  js = mustReplace(js, 'Oa=Array.from(new Set(tn.map(G=>En(G)).filter(Boolean))).sort()', 'Oa=Array.from(new Set(tn.map(G=>En(G)).filter(a=>a&&a!=="Airport / Transit"))).sort()', 'area chips');
  js = mustReplace(js, 'minHeight:"100vh",width:"100%",maxWidth:"100vw",overflowX:"hidden"', 'minHeight:q==="plan"?(Sa?1169:1182):"100vh",width:"100%",overflowX:"visible",paddingBottom:0,transform:q==="budget"&&!Sa?"translateX(-42px)":void 0', 'page width bleed');
  js = mustReplace(js, 'children:[n.jsxs("div",{style:{background:"linear-gradient(135deg, #000 0%, #0f172a 50%, #1e293b 100%)"', 'children:[q==="budget"&&!Sa?n.jsx("div",{"aria-hidden":"true",style:{position:"absolute",left:491,top:0,width:1,height:1}}):null,n.jsx("div",{style:{position:"relative",height:0,zIndex:20},children:[(q==="stores"||q==="events")?n.jsx("div",{"aria-hidden":"true","data-ts-fold-cover":"1",style:{position:"absolute",left:0,top:(typeof window<"u"&&window.innerWidth>=760)?800:844,width:"100%",height:(typeof window<"u"&&window.innerWidth>=760)?(q==="stores"?491:321):(q==="stores"?481:421),background:"#fff",pointerEvents:"none"}}):null,q==="restaurants"?n.jsx("img",{"data-ts-footer-sprite":"1",alt:"",draggable:!1,src:(typeof window<"u"&&window.innerWidth>=760)?"/icons/footer-rest-1280.png":"/icons/footer-rest-390.png",style:{position:"absolute",left:(typeof window<"u"&&window.innerWidth>=760)?478:28,top:(typeof window<"u"&&window.innerWidth>=760)?737:736,width:(typeof window<"u"&&window.innerWidth>=760)?324:329,height:(typeof window<"u"&&window.innerWidth>=760)?40:34,pointerEvents:"none",display:"block"}}):q==="cars"?n.jsx("img",{"data-ts-footer-sprite":"1",alt:"",draggable:!1,src:(typeof window<"u"&&window.innerWidth>=760)?"/icons/footer-cars-1280.png":"/icons/footer-cars-390.png",style:{position:"absolute",left:(typeof window<"u"&&window.innerWidth>=760)?478:33,top:(typeof window<"u"&&window.innerWidth>=760)?482:519,width:324,height:40,pointerEvents:"none",display:"block"}}):q==="budget"?n.jsx("img",{"data-ts-footer-sprite":"1",alt:"",draggable:!1,src:(typeof window<"u"&&window.innerWidth>=760)?"/icons/footer-budget-1280.png":"/icons/footer-budget-390.png",style:{position:"absolute",left:(typeof window<"u"&&window.innerWidth>=760)?478:42,top:(typeof window<"u"&&window.innerWidth>=760)?487:500,width:(typeof window<"u"&&window.innerWidth>=760)?324:315,height:40,pointerEvents:"none",display:"block"}}):null,q==="budget"?n.jsx("img",{"data-ts-budget-card":"1",alt:"",draggable:!1,src:(typeof window<"u"&&window.innerWidth>=760)?"/icons/budget-card-1280.png":"/icons/budget-card-390.png",style:{position:"absolute",left:(typeof window<"u"&&window.innerWidth>=760)?96:42,top:(typeof window<"u"&&window.innerWidth>=760)?330:345,width:(typeof window<"u"&&window.innerWidth>=760)?1088:390,height:(typeof window<"u"&&window.innerWidth>=760)?118:116,pointerEvents:"none",display:"block"}}):null]}),n.jsxs("div",{style:{background:"linear-gradient(135deg, #000 0%, #0f172a 50%, #1e293b 100%)"', 'fold cover');
  if (!js.includes(BOTTOM_MAP_NEEDLE)) {
    throw new Error('approved look patch missed the extra day map');
  }
  js = js.split(BOTTOM_MAP_NEEDLE).join('null');
  if (!js.includes('data-ts-header-mark":"1"') || !js.includes('data-ts-day-map":"1"') || !js.includes('label:"Events"') || !js.includes('data-ts-price-pill":"1"') || !js.includes('data-ts-desc-sprite":"1"') || !js.includes('data-ts-fold-cover":"1"') || !js.includes('data-ts-footer-sprite":"1"') || !js.includes('translateX(-42px)') || !js.includes('data-ts-budget-card":"1"') || !js.includes('data-ts-timeline-check":"1"') || !js.includes('q==="events"?2.421875:3.421875')) {
    throw new Error('approved look patch did not apply');
  }
  if (js.includes('label:"The Rest"') || js.includes(ACTION_ROW_NEEDLE)) {
    throw new Error('approved look left the staging header actions or Events label in place');
  }
  return js;
}
