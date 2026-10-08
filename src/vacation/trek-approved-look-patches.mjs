/** Approved shared-trip look (issue 273). One render path; web and PDF differ only in CSS. */

const DESKTOP = 'typeof window<"u"&&window.innerWidth>=760';

const HEADER_NEEDLE = 'dn?n.jsxs("div",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,marginBottom:12,fontSize:11,fontWeight:700,letterSpacing:2.4,textTransform:"uppercase",opacity:.72},children:[n.jsx("span",{children:"TimeSyncher"}),n.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:34,height:34,borderRadius:9,background:"#000"},children:n.jsx("img",{src:"/icons/timesyncher-icon-white-transparent.png",alt:"TimeSyncher",width:"22",height:"22"})}),n.jsx("span",{children:"Vacation"})]})';

const HEADER_PATCH = 'dn?n.jsxs("div",{"data-ts-header-brand":"1",style:{position:"relative",height:67,marginTop:2,marginBottom:14},children:[n.jsx("span",{"data-ts-header-mark":"1",style:{position:"absolute",left:"50%",top:-2,marginLeft:-22,width:44,height:44,boxSizing:"border-box",borderRadius:12,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"},children:n.jsx("img",{src:"/icons/icon-white.svg",alt:"",width:"26",height:"26",style:{display:"block",width:26,height:26}})}),n.jsx("span",{"data-ts-header-word":"1",style:{position:"absolute",left:0,right:0,top:56,textAlign:"center",whiteSpace:"nowrap",textTransform:"uppercase",fontSize:10,fontWeight:700,letterSpacing:3,lineHeight:1,color:"rgba(255,255,255,0.4)"},children:"Timesyncher Travel"})]})';

const ACTION_ROW_NEEDLE = 'dn&&n.jsxs("div",{style:{marginTop:8,display:"flex",justifyContent:"center",gap:6,flexWrap:"wrap"}';

const TAB_BUTTON_NEEDLE = 'padding:"7px 7px",borderRadius:12,border:"1.5px solid",cursor:"pointer",fontSize:12,fontWeight:600';
const TAB_BUTTON_PATCH = `padding:Re?"8px 18px":q===G.id?"9px 18px 9px 20px":"9px 19px",margin:!Re&&q===G.id?"0 1px 0 -1px":0,borderRadius:12,border:"1.5px solid",cursor:"pointer",fontSize:12,fontWeight:700`;

const TAB_SELECT_NEEDLE = '"data-tab":G.id,title:Re?G.label:void 0,"aria-label":G.label,onClick:()=>{W(G.id)},';
const TAB_SELECT_PATCH = '"data-tab":G.id,title:Re?G.label:void 0,"aria-label":G.label,"aria-pressed":q===G.id,ref:tsKeepTabInView(q===G.id),onClick:()=>{W(G.id)},';
const TAB_VIEW_ANCHOR = 'function pze({places:e=[],dayPlaces:t=[]';
/** Selecting a tab that sits past the phone viewport edge scrolls the page sideways just enough to show it. */
const TAB_VIEW_FN = 'function tsKeepTabInView(active){return function(btn){if(!btn||!active||typeof window>"u")return;requestAnimationFrame(function(){var root=document.getElementById("root");if(!root)return;var r=btn.getBoundingClientRect(),left=r.left+root.scrollLeft,want=Math.max(0,Math.min(root.scrollWidth-root.clientWidth,Math.ceil(left+r.width-window.innerWidth)));root.scrollLeft=want})}}';

const EVENTS_TAB_NEEDLE = '{id:"events",label:"The Rest",icon:"🎟️"}';
const EVENTS_TAB_PATCH = '{id:"events",label:"Events",icon:"🎟️"}';

const DAY_HEADING_NEEDLE = 'children:"Vacation Day View"';
const DAY_HEADING_PATCH = 'children:"Map day view"';
const DAY_SUB_NEEDLE = 'Only things tagged for this day + Timeline appear on the map below.';
const DAY_SUB_PATCH = 'Only things tagged for this day + Timeline appear on the map.';

const PLAN_CARD_NEEDLE = 'q==="plan"&&n.jsxs(n.Fragment,{children:[dn&&n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:14,border:"1px solid var(--border-faint, #e5e7eb)",padding:12,margin:"12px 0 12px"}';

const MAP_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const BOTTOM_MAP_NEEDLE = 'n.jsx("div",{style:{borderRadius:16,overflow:"hidden",height:dn?900:300,marginBottom:12,boxShadow:"0 2px 12px rgba(0,0,0,0.08)"},children:n.jsxs(gpe,{center:Ia,zoom:11,zoomControl:!1,attributionControl:!1,style:{width:"100%",height:"100%"},children:[n.jsx(fpe,{url:"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",attribution:"",referrerPolicy:"strict-origin-when-cross-origin"}),n.jsx(gDe,{places:La,fallbackCenter:ba}),La.map(G=>n.jsx(zx,{position:[G.lat,G.lng],icon:mDe(G),eventHandlers:{click:()=>Ne(Qt(G))},children:n.jsx(eZ,{children:mr(G)||G.name})},G.id))]})})';
const DAY_MAP = `dn&&n.jsx("div",{"data-ts-day-map":"1",style:{height:300,margin:"4px 8px 12px",borderRadius:16,overflow:"hidden",boxShadow:"0 2px 12px rgba(0,0,0,0.08)",background:"#fafaf8"},children:n.jsxs(gpe,{center:Ia,zoom:11,zoomControl:!1,attributionControl:!1,style:{width:"100%",height:"100%",background:"#fafaf8"},children:[n.jsx(fpe,{url:"${MAP_TILE_URL}",attribution:"",referrerPolicy:"strict-origin-when-cross-origin"}),n.jsx(gDe,{places:La,fallbackCenter:ba}),La.map(G=>n.jsx(zx,{position:[G.lat,G.lng],icon:mDe(G),eventHandlers:{click:()=>Ne(Qt(G))},children:n.jsx(eZ,{children:mr(G)||G.name})},G.id))]})}),`;

const MAP_SHELL_NEEDLE = 'className:"w-full h-full relative",children:';
const MAP_SHELL_PATCH = 'className:"w-full h-full relative",style:{height:"100%",width:"100%"},children:';
const MAP_CANVAS_NEEDLE = 'className:"w-full h-full",style:{background:"#e5e7eb"}';
const MAP_CANVAS_PATCH = 'className:"w-full h-full",style:{background:"#e5e7eb",height:"100%",width:"100%"}';

const BSE_NEEDLE = 'function BSe(e,t){const i=e&&Bb[e]||Bb.MapPin;';
const BSE_PATCH = 'function BSe(e,t){if(e&&!Bb[e])return `<span data-ts-map-emoji="1" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:${t}px;line-height:1">${e}</span>`;const i=e&&Bb[e]||Bb.MapPin;';

const ROW_LOGO_NEEDLE = 'gridTemplateColumns:"28px minmax(0, 1fr)",gap:9,alignItems:"center",width:"100%",minWidth:0},children:[n.jsx(dc,{item:G}),n.jsx("span",{"data-ts-list-row-name":"1"';
const ROW_LOGO_PATCH = 'gridTemplateColumns:tsList?"16px minmax(0,1fr)":"minmax(0,1fr)",gap:6,alignItems:"center",width:"100%",minWidth:0},children:[tsList?n.jsx(dc,{item:G,size:16}):null,n.jsx("span",{"data-ts-list-row-name":"1"';

const ROW_SINGLE_NEEDLE = 'return Sa?n.jsxs("li",{"data-list-row":"1"';
const ROW_SINGLE_PATCH = 'return !0?n.jsxs("li",{"data-list-row":"1"';

const ROW_HEAD_NEEDLE = 'Oe=(G,Re,zt=!1)=>{';
const ROW_HEAD_PATCH = 'Oe=(G,Re,zt=!1)=>{const tsList=bn(G)||Mi(G)||Zi(G);';

const ROW_GRID_NEEDLE = 'gridTemplateColumns:"minmax(0,1fr) auto auto",gap:8,alignItems:"center",minWidth:0,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),kl(G),';
const ROW_GRID_PATCH = `gridTemplateColumns:tsList?(Sa?"minmax(0,1fr) minmax(0,1.2fr) auto auto":"minmax(0,1fr) auto auto"):Sa?"234.625px minmax(0,1fr) auto auto":"128px 212px max-content max-content",gap:tsList&&!Sa?8:10,alignItems:"center",width:tsList||Sa?"100%":"363px",minWidth:tsList||Sa?"100%":"0",overflow:"hidden"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),Pn&&(Sa||!tsList)?n.jsx("span",{"data-list-summary":"1","data-summary-src":"thing",style:{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:Sa?"100%":"183px",minWidth:0,position:"relative",top:Sa&&!tsList?.5:0,color:"#475569",fontSize:11,fontWeight:700,lineHeight:1.35},children:Pn}):null,kl(G),`;

const SUMMARY_LINE_NEEDLE = 'Pn?n.jsx("div",{"data-list-summary":"1","data-summary-src":"thing",style:{marginTop:6,fontSize:11,fontWeight:700,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#475569",lineHeight:1.4},children:Pn}):null';

const ROW_CLIP_NEEDLE = 'overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"';
const ROW_CLIP_PATCH = 'overflow:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,minWidth:tsList?0:Sa?"max-content":"490px",width:tsList?"100%":Sa?void 0:"490px",maxWidth:tsList?"100%":void 0,boxSizing:"border-box"';

const FOOTER_NEEDLE = 'n.jsx("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:700,letterSpacing:1.8,textTransform:"uppercase"},children:"TimeSyncher"}),n.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24},children:n.jsx("img",{src:"/icons/timesyncher-icon-black-transparent.png",alt:"TimeSyncher",width:"20",height:"20"})}),n.jsx("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:700,letterSpacing:1.8,textTransform:"uppercase"},children:"Vacation"}),n.jsx("span",{style:{fontSize:11,color:"#c4c9d1"},children:"· AI-assisted vacation itinerary planning"})';
const FOOTER_PATCH = 'n.jsx("img",{src:"/icons/icon.svg",alt:"",width:"18",height:"18",style:{display:"block",width:18,height:18,borderRadius:4}}),n.jsx("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:400},children:"TimeSyncher Travel · AI-assisted itinerary planning"})';

const BUDGET_NEEDLE = 'js({name:"Trip total",planned:_i,target:Eo,strong:!0}),nr.map(di=>{const Xi=Qi(di),go=Xr(di),fr=wn(di);return!fr.length?null:n.jsxs("div",{children:[js({name:Oo(di),planned:Xi,target:go,bucket:di}),fr.length>0&&fr.map(Ul=>n.jsx(zl,{r:Ul},Qt(Ul.item)))]},di)})';
const BUDGET_PATCH = 'n.jsxs("div",{"data-ts-budget-total":"1",style:{display:"grid",gridTemplateColumns:"1fr auto auto auto",gap:8,alignItems:"baseline",padding:"9px 0"},children:[n.jsx("span",{style:{fontSize:13,fontWeight:900,color:"#111827"},children:"Trip total"}),n.jsx("span",{style:{fontSize:12,fontWeight:400,color:"#6b7280",whiteSpace:"nowrap"},children:`Timeline ${Math.round(Number(_i)||0)} USD`}),n.jsx("span",{style:{fontSize:12,fontWeight:400,color:"#6b7280",whiteSpace:"nowrap"},children:`Target ${Math.round(Number(Eo)||0)} USD`}),n.jsx("span",{style:{fontSize:11,fontWeight:900,borderRadius:999,padding:"4px 8px",color:"#166534",background:"#dcfce7",whiteSpace:"nowrap"},children:`${Math.round(Number(_i)||0)} USD timeline`})]})';
const BUDGET_HEAD_NEEDLE = 'n.jsx("div",{style:{fontSize:13,fontWeight:900,color:"#111827",marginBottom:8},children:"Overall trip budget"})';
const BUDGET_HEAD_PATCH = 'n.jsx("div",{style:{fontSize:13,fontWeight:900,color:"#111827",paddingBottom:9,borderBottom:"1px solid #f3f4f6"},children:"Overall trip budget"})';

const TIMELINE_CHECK_NEEDLE = 'n.jsx("input",{type:"checkbox",disabled:!Ce,checked:Ds(G),onChange:zr=>lc(G,zr.target.checked)})," Timeline"]})]}),null,n.jsx(Nr,';
const TIMELINE_CHECK_PATCH = 'n.jsx("input",{"data-ts-timeline-check":"1",type:"checkbox","aria-disabled":Ce?void 0:"true",checked:Ds(G),onChange:zr=>{Ce&&lc(G,zr.target.checked)},style:{margin:0,cursor:Ce?"pointer":"default"}})," Timeline"]})]}),null,n.jsx(Nr,';

const FLIGHT_LINE_NEEDLE = 'Qo=({item:G})=>{const parts=eu(G);return n.jsxs("span",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto auto",gap:8,width:"100%",alignItems:"center",minWidth:0},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:parts[0]||""}),n.jsx("span",{style:{whiteSpace:"nowrap",flexShrink:0,color:"#0f766e",fontWeight:900},children:parts[1]||""}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:parts[2]||""}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:parts[3]||""})]})}';
const FLIGHT_LINE_PATCH = 'Qo=({item:G})=>{const parts=eu(G);return n.jsxs("span",{"data-ts-flight-line":"1",style:{display:"grid",gridTemplateColumns:Sa?"minmax(56px,1fr) auto auto auto":"minmax(56px,1fr) auto",gap:8,width:"100%",alignItems:"center",minWidth:0},children:[n.jsx("span",{"data-ts-airline":"1",style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:parts[0]||""}),n.jsx("span",{style:{whiteSpace:"nowrap",flexShrink:0,color:"#0f766e",fontWeight:900},children:parts[1]||""}),Sa?n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:parts[2]||""}):null,Sa?n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:parts[3]||""}):null]})}';

const LOGO_CHIP_NEEDLE = 'dc=({item:G,size:Re=28})=>{const zt=_l(G),ua=Pc(G);return n.jsxs("span",{"data-ts-logo-chip":"1","aria-hidden":"true",style:{width:Re,height:Re,minWidth:Re,borderRadius:9,background:"#f8fafc",border:"1px solid #e5e7eb",display:"inline-grid",placeItems:"center",position:"relative",overflow:"hidden",fontSize:Math.max(14,Math.round(Re*.62)),lineHeight:1,boxShadow:"0 1px 2px rgba(15,23,42,0.05)",boxSizing:"border-box"},children:zt?[n.jsx("img",{className:"tiny-logo",src:zt,alt:"",loading:"lazy",onError:Rn=>{Rn.currentTarget.style.display="none"},style:{maxWidth:"100%",maxHeight:"100%",width:"auto",height:"auto",objectFit:"contain",objectPosition:"center center",display:"block"}})]:[n.jsx("span",{style:{display:"grid",placeItems:"center",width:"100%",height:"100%",lineHeight:1},children:ua})]})}';
const LOGO_CHIP_PATCH = 'dc=({item:G,size:Re=28})=>{const tsOwn=_l(G),[tsSeen,tsSetSeen]=I.useState({}),zt=tsSeen.bad===tsOwn?tsSeen.found||"":tsOwn||tsSeen.found||"";I.useEffect(()=>{if(zt)return;let live=!0;tsLogoSearch(G,mr(G),It(G)).then(u=>{live&&u&&tsSetSeen(s=>({...s,found:u}))});return()=>{live=!1}},[zt,Qt(G)]);return n.jsxs("span",{"data-ts-logo-chip":"1","aria-hidden":"true",style:{width:Re,height:Re,minWidth:Re,borderRadius:9,background:zt?"#f8fafc":"transparent",border:zt?"1px solid #e5e7eb":"1px solid transparent",display:"inline-grid",placeItems:"center",position:"relative",overflow:"hidden",fontSize:Math.max(14,Math.round(Re*.62)),lineHeight:1,boxShadow:zt?"0 1px 2px rgba(15,23,42,0.05)":"none",boxSizing:"border-box"},children:zt?[n.jsx("img",{className:"tiny-logo",src:zt,alt:"",loading:"lazy",onError:Rn=>{Rn.currentTarget.style.display="none"},onErrorCapture:()=>{zt===tsOwn&&tsSetSeen(s=>({...s,bad:tsOwn}))},style:{maxWidth:"100%",maxHeight:"100%",width:"auto",height:"auto",objectFit:"contain",objectPosition:"center center",display:"block"}},zt)]:[]})}';

const TRIP_PLACE_NEEDLE = 'ge.subtitle&&n.jsx("div",{className:"relative",style:{fontSize:13,color:"rgba(255,255,255,0.5)"';
const TRIP_PLACE_PATCH = 'ge.subtitle&&n.jsx("div",{className:"relative","data-ts-trip-place":"1",style:{fontSize:13,color:"rgba(255,255,255,0.5)"';

/** Rows without a stored logo ask the server to search for the place's own site (name + trip city). */
const LOGO_SEARCH_FN = 'var tsLogoFound=new Map;function tsLogoSearch(item,name,kind){var label=String(name||"").trim();if(!label||typeof fetch>"u")return Promise.resolve("");var placeNode=typeof document<"u"&&document.querySelector("[data-ts-trip-place]");var city=String(placeNode&&placeNode.textContent||"").trim();var key=[label,city,kind].join("|").toLowerCase();if(tsLogoFound.has(key))return tsLogoFound.get(key);var url="/api/thing-logo?"+new URLSearchParams({name:label,city:city,kind:String(kind||""),address:String(item&&(item.address||item.place_address)||"")}).toString();var job=fetch(url,{headers:{accept:"application/json"}}).then(function(r){return r.ok?r.json():{}}).then(function(body){return String(body&&body.logoUrl||"")}).catch(function(){return""});tsLogoFound.set(key,job);return job}';

const PAGE_NEEDLE = 'minHeight:"100vh",width:"100%",maxWidth:"100vw",overflowX:"hidden"';
const PAGE_PATCH = 'minHeight:"100vh",width:"100%",overflowX:"visible"';

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

/** Runs after the category tab buttons carry data-tab and the row logo chip is final. */
export function applyApprovedTabViewPatch(source = '') {
  let js = String(source || '');
  if (!js.includes('q==="plan"')) return js;
  js = mustReplace(js, TAB_SELECT_NEEDLE, TAB_SELECT_PATCH, 'tab keeps selected pill in view');
  js = mustReplace(js, TAB_VIEW_ANCHOR, `${TAB_VIEW_FN}${LOGO_SEARCH_FN};${TAB_VIEW_ANCHOR}`, 'tab view helper');
  js = mustReplace(js, LOGO_CHIP_NEEDLE, LOGO_CHIP_PATCH, 'row logo search');
  return js;
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
  js = mustReplace(js, '{id:"plan",label:"Day-by-Day",icon:"📅"}', '{id:"plan",label:"Day-by-Day",icon:"☀️"}', 'Day-by-Day sun icon');
  js = mustReplace(js, TAB_BUTTON_NEEDLE, TAB_BUTTON_PATCH, 'tab pill size');
  js = mustReplace(js, DAY_HEADING_NEEDLE, DAY_HEADING_PATCH, 'map day heading');
  js = mustReplace(js, DAY_SUB_NEEDLE, DAY_SUB_PATCH, 'map day subtitle');
  js = mustReplace(js, 'ge.subtitle&&n.jsx("div",{className:"relative",style:{fontSize:13,opacity:.5,maxWidth:400,margin:"0 auto",lineHeight:1.5},children:ge.subtitle})', 'ge.subtitle&&n.jsx("div",{className:"relative",style:{fontSize:13,color:"rgba(255,255,255,0.5)",maxWidth:400,margin:"0 auto",lineHeight:1.5},children:ge.subtitle})', 'subtitle ink');
  js = mustReplace(js, PLAN_CARD_NEEDLE, `q==="plan"&&n.jsxs(n.Fragment,{children:[${DAY_MAP}dn&&n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:14,border:"1px solid var(--border-faint, #e5e7eb)",padding:12,margin:"12px 0 12px"}`, 'day map card');
  if (!js.includes(BOTTOM_MAP_NEEDLE)) {
    throw new Error('approved look patch missed the lower day map');
  }
  js = js.split(BOTTOM_MAP_NEEDLE).join(`dn?null:${BOTTOM_MAP_NEEDLE}`);
  if (js.includes(MAP_SHELL_NEEDLE)) js = js.replace(MAP_SHELL_NEEDLE, MAP_SHELL_PATCH);
  if (js.includes(MAP_CANVAS_NEEDLE)) js = js.replace(MAP_CANVAS_NEEDLE, MAP_CANVAS_PATCH);
  if (js.includes(BSE_NEEDLE)) js = js.replace(BSE_NEEDLE, BSE_PATCH);
  js = mustReplace(js, ROW_HEAD_NEEDLE, ROW_HEAD_PATCH, 'row list flag');
  js = mustReplace(js, ROW_LOGO_NEEDLE, ROW_LOGO_PATCH, 'row logo column');
  js = mustReplace(js, ROW_GRID_NEEDLE, ROW_GRID_PATCH, 'row description column');
  js = mustReplace(js, SUMMARY_LINE_NEEDLE, 'null', 'two-line summary');
  js = mustReplace(js, ROW_SINGLE_NEEDLE, ROW_SINGLE_PATCH, 'single-line list rows');
  if (js.includes(ROW_CLIP_NEEDLE)) js = js.replaceAll(ROW_CLIP_NEEDLE, ROW_CLIP_PATCH);
  js = mustReplace(js, 'Os=["event","family_event","tickets","bar","music","workout","artist","theatre","sightseeing","tour","transport","other"]', 'Os=["event","music","sightseeing","tour","transport","other"]', 'Events type chips');
  js = mustReplace(js, 'jo=G=>![bn,Zi,Mi,zi,ro].some(Re=>Re(G))', 'jo=G=>{const c=It(G);return c==="event"||c==="music"||c==="sightseeing"||c==="tour"||c==="transport"||c==="other"}', 'events list types');
  js = mustReplace(js, 'Re.includes("store")||Re.includes("grocery")', 'Re.includes("store")||Re.includes("shop")||Re.includes("grocery")', 'shopping category');
  js = mustReplace(js, 'Oa=Array.from(new Set(tn.map(G=>En(G)).filter(Boolean))).sort()', 'Oa=Array.from(new Set(tn.map(G=>En(G)).filter(a=>a&&a!=="Airport / Transit"))).sort()', 'area chips');
  js = mustReplace(js, FOOTER_NEEDLE, FOOTER_PATCH, 'shared footer');
  js = mustReplace(js, BUDGET_NEEDLE, BUDGET_PATCH, 'compact budget card');
  js = mustReplace(js, BUDGET_HEAD_NEEDLE, BUDGET_HEAD_PATCH, 'budget card heading');
  js = mustReplace(js, 'children:[n.jsxs("div",{style:{padding:"12px 16px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #f3f4f6"},children:[n.jsx("div",{style:{width:28,height:28,borderRadius:"50%"', `children:[n.jsxs("div",{style:{padding:${DESKTOP}?"16px 16px 12px":"12px 16px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #f3f4f6"},children:[n.jsx("div",{style:{width:28,height:28,borderRadius:"50%"`, 'day card header padding');
  js = mustReplace(js, PAGE_NEEDLE, PAGE_PATCH, 'page width');
  js = mustReplace(js, TIMELINE_CHECK_NEEDLE, TIMELINE_CHECK_PATCH, 'timeline checkbox');
  js = mustReplace(js, FLIGHT_LINE_NEEDLE, FLIGHT_LINE_PATCH, 'flight row airline');
  js = mustReplace(js, TRIP_PLACE_NEEDLE, TRIP_PLACE_PATCH, 'trip place for logo search');
  if (!js.includes('data-ts-header-mark":"1"') || !js.includes('data-ts-day-map":"1"') || !js.includes('label:"Events"') || !js.includes('data-ts-budget-total":"1"') || !js.includes(MAP_TILE_URL)) {
    throw new Error('approved look patch did not apply');
  }
  if (js.includes('label:"The Rest"') || js.includes(ACTION_ROW_NEEDLE)) {
    throw new Error('approved look left the staging header actions or Events label in place');
  }
  return js;
}
