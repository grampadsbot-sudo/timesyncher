/** Approved shared-trip look (issue 273). Screenshots win; only CSS differs for PDF. */

import { TREK_SHARED_DAY_MAP_TILE_URL } from './trek-default-map-tiles.mjs';

const HEADER_NEEDLE = 'dn?n.jsxs("div",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,marginBottom:12,fontSize:11,fontWeight:700,letterSpacing:2.4,textTransform:"uppercase",opacity:.72},children:[n.jsx("span",{children:"TimeSyncher"}),n.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:34,height:34,borderRadius:9,background:"#000"},children:n.jsx("img",{src:"/icons/timesyncher-icon-white-transparent.png",alt:"TimeSyncher",width:"22",height:"22"})}),n.jsx("span",{children:"Vacation"})]})';

const HEADER_PATCH = 'dn?n.jsxs("div",{"data-ts-header-mark":"1",style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,marginTop:2,marginBottom:14},children:[n.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:44,height:44,borderRadius:10,background:"#000",flex:"0 0 44px"},children:n.jsx("img",{src:"/icons/timesyncher-icon-white-transparent.png",alt:"",width:"22",height:"22",style:{display:"block",width:22,height:22}})}),n.jsx("span",{style:{fontSize:11,fontWeight:800,letterSpacing:2.4,textTransform:"uppercase",color:"#fff",lineHeight:1},children:"Timesyncher Travel"})]})';

const ACTION_ROW_NEEDLE = 'dn&&n.jsxs("div",{style:{marginTop:8,display:"flex",justifyContent:"center",gap:6,flexWrap:"wrap"}';

const EVENTS_TAB_NEEDLE = '{id:"events",label:"The Rest",icon:"🎟️"}';
const EVENTS_TAB_PATCH = '{id:"events",label:"Events",icon:"🎟️"}';

const DAY_HEADING_NEEDLE = 'children:"Vacation Day View"';
const DAY_HEADING_PATCH = 'children:"Map day view"';
const DAY_SUB_NEEDLE = 'Only things tagged for this day + Timeline appear on the map below.';
const DAY_SUB_PATCH = 'Only things tagged for this day + Timeline appear on the map.';

const PLAN_CARD_NEEDLE = 'q==="plan"&&n.jsxs(n.Fragment,{children:[dn&&n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:14,border:"1px solid var(--border-faint, #e5e7eb)",padding:12,margin:"12px 0 12px"}';

const DAY_MAP = '';

const DAY_MAP_TILE_LAYER_PATCH = `n.jsx(fpe,{url:"${TREK_SHARED_DAY_MAP_TILE_URL}",attribution:"",referrerPolicy:"strict-origin-when-cross-origin",maxZoom:19,updateWhenIdle:!1,fadeAnimation:!1,keepBuffer:12}),n.jsx(gDe,{places:La,fallbackCenter:ba})`;

const DAY_MAP_TILE_LAYER_RE = /n\.jsx\(fpe,\{url:"https:\/\/[^"]+",attribution:"",referrerPolicy:"strict-origin-when-cross-origin"(?:,crossOrigin:!0)?(?:,maxZoom:\d+)?(?:,updateWhenIdle:!1)?(?:,fadeAnimation:!1)?(?:,keepBuffer:\d+)?\}\),n\.jsx\(gDe,\{places:La,fallbackCenter:ba\}\)/;

const DAY_MAP_CONTAINER_NEEDLE = 'gpe,{center:Ia,zoom:11,zoomControl:!1,attributionControl:!1,style:{width:"100%",height:"100%"},children:[n.jsx(fpe,{url:';
const DAY_MAP_CONTAINER_PATCH = 'gpe,{center:Ia,zoom:11,zoomControl:!1,attributionControl:!1,fadeAnimation:!1,style:{width:"100%",height:"100%"},whenReady:function(){tsKickDayMapTiles(this)},children:[n.jsx(fpe,{url:';

const MAP_SHELL_NEEDLE = 'className:"w-full h-full relative",children:';
const MAP_SHELL_PATCH = 'className:"w-full h-full relative",style:{height:"100%",width:"100%"},children:';
const MAP_CANVAS_NEEDLE = 'className:"w-full h-full",style:{background:"#e5e7eb"}';
const MAP_CANVAS_PATCH = 'className:"w-full h-full",style:{background:"#e5e7eb",height:"100%",width:"100%"}';

const BSE_NEEDLE = 'function BSe(e,t){const i=e&&Bb[e]||Bb.MapPin;';
const BSE_PATCH = 'function BSe(e,t){if(e&&!Bb[e])return `<span data-ts-map-emoji="1" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:${t}px;line-height:1">${e}</span>`;const i=e&&Bb[e]||Bb.MapPin;';

const LOGO_GRID_NEEDLE = 'gridTemplateColumns:"28px minmax(0, 1fr)",gap:9,alignItems:"center",width:"100%",minWidth:0},children:[n.jsx(dc,{item:G}),n.jsx("span",{"data-ts-list-row-name":"1"';
const LOGO_GRID_PATCH = 'gridTemplateColumns:(bn(G)||Mi(G)||Zi(G))?"16px minmax(0,1fr)":"minmax(0,1fr)",gap:6,alignItems:"center",width:"100%",minWidth:0},children:[(bn(G)||Mi(G)||Zi(G))?n.jsx("span",{style:{display:"grid",placeItems:"center",alignSelf:"center",width:16,minWidth:16,height:16,flex:"0 0 16px"},children:n.jsx(dc,{item:G,size:16})}):null,n.jsx("span",{"data-ts-list-row-name":"1"';

const ROW_GRID_NEEDLE = 'gridTemplateColumns:"minmax(0,1fr) auto auto",gap:8,alignItems:"center",minWidth:0,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),kl(G),';
const ROW_GRID_PATCH = 'gridTemplateColumns:"minmax(0,1.15fr) minmax(0,1fr) max-content max-content",gap:8,alignItems:"center",width:"100%",minWidth:0,maxWidth:"100%",overflow:"hidden"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),Pn?n.jsx("span",{"data-list-summary":"1","data-summary-src":"thing",style:{whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:(typeof window<"u"&&window.innerWidth>=760)?"100%":"183px",minWidth:0,color:"#475569",fontSize:11,fontWeight:700,lineHeight:1.35},children:Pn}):null,kl(G),';

const SUMMARY_LINE_NEEDLE = 'Pn?n.jsx("div",{"data-list-summary":"1","data-summary-src":"thing",style:{marginTop:6,fontSize:11,fontWeight:700,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"#475569",lineHeight:1.4},children:Pn}):null';
const SUMMARY_LINE_PATCH = 'null';

const HOTEL_LINE_NEEDLE = 'gridTemplateColumns:"minmax(0,1fr) auto",gap:8,width:"100%",minWidth:0,maxWidth:"100%",alignItems:"center"},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:n.jsx("strong",{children:Re})}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,color:"#0f766e",fontWeight:900,flexShrink:0},children:ie(G)})]})';
const HOTEL_LINE_PATCH = 'gridTemplateColumns:"minmax(0,1fr) auto auto",gap:8,width:"100%",minWidth:0,alignItems:"center"},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:n.jsx("strong",{children:Re})}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,color:"#0f766e",fontWeight:900,flexShrink:0},children:ie(G)}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:ha(G).roomType||ha(G).room_type||""})]})';

const ROW_CLIP_NEEDLE = 'overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"';
const ROW_CLIP_PATCH = 'overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,minWidth:0,maxWidth:"100%",width:"100%"';

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

/** Map sits after the day chip card, before the selected day's itinerary card. */
function moveDayMapBeforeItinerary(js = '') {
  let source = String(js || '');
  const afterChips = '},G.id))})]}),Ki&&(()=>{const G=Ki';
  const mapStart = 'n.jsx("div",{"data-ts-day-map":"1"';
  const afterMap = '})})]}),dn&&(q==="hotels"';
  const mapClose = '})})]}),';
  const chipIdx = source.indexOf(afterChips);
  const mapIdx = source.indexOf(mapStart);
  const endIdx = source.indexOf(afterMap, mapIdx);
  if (chipIdx < 0 || mapIdx < 0 || endIdx < 0 || mapIdx < chipIdx) {
    throw new Error('approved look day map reorder anchors missing');
  }
  const mapEnd = endIdx + mapClose.length;
  const mapBlock = source.slice(mapIdx, mapEnd);
  const withoutMap = source.slice(0, mapIdx) + source.slice(mapEnd);
  const insertAt = withoutMap.indexOf(afterChips);
  if (insertAt < 0) {
    throw new Error('approved look day map reorder insert point missing');
  }
  const insertPos = insertAt + '},G.id))})]}),'.length;
  return `${withoutMap.slice(0, insertPos)}${mapBlock},${withoutMap.slice(insertPos)}`;
}

export function applyActivePillEdgePatch(js) {
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
  js = mustReplace(js, DAY_HEADING_NEEDLE, DAY_HEADING_PATCH, 'map day heading');
  js = mustReplace(js, 'ge.subtitle&&n.jsx("div",{className:"relative",style:{fontSize:13,opacity:.5,maxWidth:400,margin:"0 auto",lineHeight:1.5},children:ge.subtitle})', 'ge.subtitle&&n.jsx("div",{className:"relative",style:{fontSize:13,color:"rgba(255,255,255,0.5)",maxWidth:400,margin:"0 auto",lineHeight:1.5},children:ge.subtitle})', 'subtitle ink');
  js = mustReplace(js, DAY_SUB_NEEDLE, DAY_SUB_PATCH, 'map day subtitle');
  js = mustReplace(js, PLAN_CARD_NEEDLE, `q==="plan"&&n.jsxs(n.Fragment,{children:[${DAY_MAP}dn&&n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:14,border:"1px solid var(--border-faint, #e5e7eb)",padding:12,margin:"12px 0 12px"}`, 'day map card');
  if (js.includes(MAP_SHELL_NEEDLE)) js = js.replace(MAP_SHELL_NEEDLE, MAP_SHELL_PATCH);
  if (js.includes(MAP_CANVAS_NEEDLE)) js = js.replace(MAP_CANVAS_NEEDLE, MAP_CANVAS_PATCH);
  if (js.includes(BSE_NEEDLE)) js = js.replace(BSE_NEEDLE, BSE_PATCH);
  if (js.includes(LOGO_GRID_NEEDLE)) js = js.replace(LOGO_GRID_NEEDLE, LOGO_GRID_PATCH);
  if (js.includes(HOTEL_LINE_NEEDLE)) js = js.replace(HOTEL_LINE_NEEDLE, HOTEL_LINE_PATCH);
  if (js.includes(ROW_CLIP_NEEDLE)) js = js.replaceAll(ROW_CLIP_NEEDLE, ROW_CLIP_PATCH);
  js = mustReplace(js, '{id:"plan",label:"Day-by-Day",icon:"📅"}', '{id:"plan",label:"Day-by-Day",icon:"☀️"}', 'Day-by-Day sun icon');
  js = mustReplace(js, 'padding:"7px 7px",borderRadius:12,border:"1.5px solid",cursor:"pointer",fontSize:12,fontWeight:600', 'padding:Re?"5px 15px":"6px 15px",borderRadius:12,border:"1.5px solid",cursor:"pointer",fontSize:13,fontWeight:700,letterSpacing:"-0.2px"', 'tab pill size');
  js = mustReplace(js, 'Os=["event","family_event","tickets","bar","music","workout","artist","theatre","sightseeing","tour","transport","other"]', 'Os=["event","music","sightseeing","tour","transport","other"]', 'Events type chips');
  js = mustReplace(js, '/whole foods|juice generation|grocery|market|store|pharmacy|snacks|celery juice|supplies/i', '/whole foods|juice generation|grocery|market|store|pharmacy|snacks|celery juice|supplies|zabar|tiffany|bergdorf|saks|nordstrom|macy|apple fifth|moma design|strand book|chelsea market|pure green/i', 'store name categories');
  const FOOTER_NEEDLE = 'n.jsx("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:700,letterSpacing:1.8,textTransform:"uppercase"},children:"TimeSyncher"}),n.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24},children:n.jsx("img",{src:"/icons/timesyncher-icon-black-transparent.png",alt:"TimeSyncher",width:"20",height:"20"})}),n.jsx("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:700,letterSpacing:1.8,textTransform:"uppercase"},children:"Vacation"}),n.jsx("span",{style:{fontSize:11,color:"#c4c9d1"},children:"· AI-assisted vacation itinerary planning"})';
  const FOOTER_PATCH = 'n.jsx("img",{src:"/icons/icon-512x512.png",alt:"",width:"18",height:"18",style:{display:"block",width:18,height:18,borderRadius:4}}),n.jsx("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:700},children:"TimeSyncher Travel · AI-assisted itinerary planning"})';
  js = mustReplace(js, FOOTER_NEEDLE, FOOTER_PATCH, 'shared footer');
  const BUDGET_TOTAL = 'n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(82px,1fr) auto auto auto",gap:8,alignItems:"center",padding:"9px 0"},children:[n.jsx("span",{style:{fontSize:13,fontWeight:900,color:"#111827"},children:"Trip total"}),n.jsx("span",{style:{fontSize:12,fontWeight:700,color:"#374151",whiteSpace:"nowrap"},children:`Timeline ${Math.round(Number(_i)||0)} USD`}),n.jsx("span",{style:{fontSize:12,fontWeight:700,color:"#374151",whiteSpace:"nowrap"},children:`Target ${Math.round(Number(Eo)||0)} USD`}),n.jsx("span",{style:{fontSize:11,fontWeight:900,borderRadius:999,padding:"4px 8px",color:"#166534",background:"#dcfce7",whiteSpace:"nowrap"},children:`${Math.round(Number(_i)||0)} USD timeline`})]})';
  js = mustReplace(js, 'js({name:"Trip total",planned:_i,target:Eo,strong:!0}),nr.map(di=>{const Xi=Qi(di),go=Xr(di),fr=wn(di);return!fr.length?null:n.jsxs("div",{children:[js({name:Oo(di),planned:Xi,target:go,bucket:di}),fr.length>0&&fr.map(Ul=>n.jsx(zl,{r:Ul},Qt(Ul.item)))]},di)})', BUDGET_TOTAL, 'compact budget card');
  js = mustReplace(js, 'children:[n.jsxs("div",{style:{padding:"12px 16px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #f3f4f6"},children:[n.jsx("div",{style:{width:28,height:28,borderRadius:"50%"', 'children:[n.jsxs("div",{style:{padding:(typeof window<"u"&&window.innerWidth>=760)?"16px 16px 12px":"12px 16px",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #f3f4f6"},children:[n.jsx("div",{style:{width:28,height:28,borderRadius:"50%"', 'day card header padding');
  js = mustReplace(js, 'jo=G=>![bn,Zi,Mi,zi,ro].some(Re=>Re(G))', 'jo=G=>{const c=It(G);return c==="event"||c==="music"||c==="sightseeing"||c==="tour"||c==="transport"||c==="other"}', 'events list types');
  js = mustReplace(js, 'Oa=Array.from(new Set(tn.map(G=>En(G)).filter(Boolean))).sort()', 'Oa=Array.from(new Set(tn.map(G=>En(G)).filter(a=>a&&a!=="Airport / Transit"))).sort()', 'area chips');
  const mapOpen = 'n.jsx("div",{style:{borderRadius:16,overflow:"hidden",height:dn?900:300,marginBottom:12';
  if (!js.includes(mapOpen)) {
    throw new Error('approved look patch missed the day map');
  }
  js = js.split(mapOpen).join('n.jsx("div",{"data-ts-day-map":"1",style:{borderRadius:16,overflow:"hidden",height:dn?900:300,marginBottom:12');
  if (!DAY_MAP_TILE_LAYER_RE.test(js)) {
    throw new Error('approved look patch missed shared day map tile layer');
  }
  js = js.replace(DAY_MAP_TILE_LAYER_RE, DAY_MAP_TILE_LAYER_PATCH);
  js = js.replace(
    /n\.jsx\(fpe,\{url:Yr\.getState\(\)\.settings\.map_tile_url\|\|"https:\/\/\{s\}\.tile\.openstreetmap\.fr\/hot\/\{z\}\/\{x\}\/\{y\}\.png",attribution:"",referrerPolicy:"strict-origin-when-cross-origin"(?:,crossOrigin:!0)?\}\),n\.jsx\(gDe,\{places:La,fallbackCenter:ba\}\)/g,
    DAY_MAP_TILE_LAYER_PATCH,
  );
  if (js.includes(DAY_MAP_CONTAINER_NEEDLE)) {
    js = js.replace(DAY_MAP_CONTAINER_NEEDLE, DAY_MAP_CONTAINER_PATCH);
  } else if (js.includes('whenReady:function(){this.invalidateSize(!0)},children:[n.jsx(fpe,{url:')) {
    js = js.replace(
      'whenReady:function(){this.invalidateSize(!0)},children:[n.jsx(fpe,{url:',
      'whenReady:function(){tsKickDayMapTiles(this)},fadeAnimation:!1,children:[n.jsx(fpe,{url:',
    );
  } else if (!js.includes('whenReady:function(){tsKickDayMapTiles(this)},fadeAnimation:!1,children:[n.jsx(fpe,{url:')) {
    throw new Error('approved look patch missed shared day map MapContainer whenReady');
  }
  js = js.split('overflow:"hidden","data-ts-day-map":"1",height:').join('overflow:"hidden",height:');
  js = js.split('overflow:"hidden","data-ts-day-map":"1",').join('overflow:"hidden",');
  js = js.split('"data-ts-day-map":"1",height:').join('height:');
  js = moveDayMapBeforeItinerary(js);
  js = js.split('})})]}),,Ki&&(()=>{const G=Ki').join('})})]}),q==="plan"&&Ki&&(()=>{const G=Ki');
  if (!js.includes('q==="plan"&&Ki&&(()=>{const G=Ki')) {
    js = js.split(',Ki&&(()=>{const G=Ki').join(',q==="plan"&&Ki&&(()=>{const G=Ki');
  }
  js = js.split('style:{borderRadius:16,overflow:"hidden","data-ts-day-map":"1",height:').join('style:{borderRadius:16,overflow:"hidden",height:');
  if (!js.includes('},G.id))})]}),n.jsx("div",{"data-ts-day-map":"1"') || !js.includes('})(),n.jsx("div",{"data-ts-day-map":"1"')) {
    const planIdx = js.indexOf('q==="plan"&&n.jsxs(n.Fragment');
    const mapIdx = js.indexOf('{"data-ts-day-map":"1"', planIdx);
    const kiIdx = js.indexOf('Ki&&(()=>{const G=Ki', planIdx);
    if (planIdx < 0 || mapIdx < 0 || kiIdx < 0 || mapIdx > kiIdx) {
      throw new Error('approved look day map is not before itinerary card');
    }
  }
  if (!js.includes('data-ts-day-map":"1"') || !js.includes(TREK_SHARED_DAY_MAP_TILE_URL)) {
    throw new Error('approved look patch did not wire shared day map tiles');
  }
  if (!js.includes('data-ts-header-mark":"1"') || !js.includes('timesyncher-icon-white-transparent.png') || !js.includes('Timesyncher Travel') || !js.includes('data-ts-day-map":"1"') || !js.includes('label:"Events"') || !js.includes('icon:"☀️"')) {
    throw new Error('approved look patch did not apply');
  }
  const descSpriteNeedle = ['data-ts-desc', '-sprite'].join('');
  const standIns = ['label:"The Rest"', ACTION_ROW_NEEDLE, '__tsPlanGlyph', '/icons/day-map-', '/icons/pill-', '/icons/footer-', '/icons/tab-labels/', descSpriteNeedle].filter((needle) => js.includes(needle));
  if (standIns.length) {
    throw new Error(`approved look left a capture hide or a screenshot stand-in in place: ${standIns.map((needle) => needle.slice(0, 80)).join(' | ')}`);
  }
  return js;
}
