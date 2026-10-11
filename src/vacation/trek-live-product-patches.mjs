import { TREK_DEFAULT_MAP_TILE_URL } from './trek-default-map-tiles.mjs';
import { patchDayByDayKeepsakeMap } from './trek-day-by-day-map-patches.mjs';
import { patchSharedTripOeListRows } from './shared-trip-oe-list-row-patch.mjs';
import { patchSharedLayoutOverflow, patchSharedTabRowOverflow } from './trek-shared-layout-patches.mjs';
import { applyActivePillEdgePatch, applyApprovedLookPatches } from './trek-approved-look-patches.mjs';
import { tripMapInitialViewBundleSnippet } from './trip-map-initial-view.mjs';
import { tripMapHookBundleSnippet } from './trip-map-hook.mjs';
import { patchLiveProductDetailBundle } from './trek-thing-detail-patches.mjs';

export const LIST_LOGO_PATCH = '_l=G=>{const Re=ha(G),raw=String(Re.logoUrl||Re.iconUrl||G.logoUrl||"").trim();if(raw&&!/^data:image\\/svg\\+xml/i.test(raw)&&!(/\\/ts-thing-media\\//i.test(raw)&&!/\\/ts-thing-logos\\//i.test(raw)))return raw;const pg=String(Re.url||Re.website||Re.sourceUrl||G.url||G.website||"").trim();if(pg){try{const u=new URL(pg);if(u.protocol==="http:"||u.protocol==="https:")return u.origin+"/favicon.ico"}catch(e){}}return ""}';

const LIST_LOGO_NEEDLE = '_l=G=>{if(qr(G))return pDe;const Re=ha(G);return Re.logoUrl||Re.iconUrl||G.logoUrl||oi(cc(G))}';
const LIST_LOGO_PATCH_NEEDLE = '_l=G=>{const Re=ha(G),raw=String(Re.logoUrl||Re.iconUrl||G.logoUrl||"");if(raw&&!/^data:image\\/svg\\+xml/i.test(raw))return raw;return ""}';
const REST_ALL_TAGS_NEEDLE = 'q==="restaurants"&&n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[ci.length>0&&n.jsxs("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2},children:[n.jsx("button",{onClick:()=>qt([])';
const REST_ALL_TAGS_PATCH = 'q==="restaurants"&&n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsxs("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2},children:[n.jsx("button",{onClick:()=>qt([])';
const LOGO_SELECTOR_NEEDLE = 'children:["Type",n.jsx("select",{value:It(Dt),onChange:G=>Xa(Dt,"category",G.target.value),style:he,children:Fa.map(G=>n.jsx("option",{value:G,children:Jn(G)},G))})]})]}),n.jsxs("div",{style:{display:"grid",gridTemplateColumns:zi(Dt)?';
const LOGO_SELECTOR_PATCH = 'children:["Type",n.jsx("select",{value:It(Dt),onChange:G=>Xa(Dt,"category",G.target.value),style:he,children:Fa.map(G=>n.jsx("option",{value:G,children:Jn(G)},G))})]})]}),n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(220px, 1fr) 160px",gap:8,alignItems:"end"},children:[n.jsxs("label",{style:Hn,children:["Logo URL",n.jsx("input",{value:String(ha(Dt).logoUrl||""),onChange:G=>Xa(Dt,"logoUrl",G.target.value),placeholder:"https://…",style:De})]}),fo(Dt).filter(Oo=>Oo&&Oo.kind!=="video").length>0&&n.jsxs("label",{style:Hn,children:["Logo from media",n.jsx("select",{value:String(ha(Dt).logoUrl||""),onChange:G=>Xa(Dt,"logoUrl",G.target.value),style:he,children:[n.jsx("option",{value:"",children:"None"},""),...fo(Dt).filter(Oo=>Oo&&Oo.kind!=="video").map(Oo=>n.jsx("option",{value:String(Oo.url||Oo.public_url||Oo.thumbnailUrl||""),children:String(Oo.originalName||Oo.caption||"Photo")},String(Oo.id||Oo.url)))]})]})]}),n.jsxs("div",{style:{display:"grid",gridTemplateColumns:zi(Dt)?';
export function stripHotelBrandNameGuessing(source = '') {
  let js = String(source || '');
  js = js.replace(/:\/hotel\|[^"]+\.test\(c\)\?"🧳":/g, ':/hotel|lodging|accommodation/.test(c)?"🧳":');
  js = js.replace(/:\/hotel\|[^"]+i\.test\(Re\)\?"hotel":/g, ':/hotel|lodging|accommodation/i.test(Re)?"hotel":');
  return js;
}
const TRIP_MAP_SNIPPET = tripMapInitialViewBundleSnippet();
const TRIP_MAP_INJECT_NEEDLE = 'function pze({places:e=[],dayPlaces:t=[]';

const MAP_CENTER_PARIS_A = 'center:r=[48.8566,2.3522]';
const MAP_CENTER_PARIS_B = 'center:z=[48.8566,2.3522]';

const CARTO_LIGHT_TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

const TRIP_MAP_VIEW_NEEDLE = `No=p.map_tile_url||"${CARTO_LIGHT_TILE_URL}",or=[p.default_lat||48.8566,p.default_lng||2.3522],_t=p.default_zoom||10,Ua={fontFamily:`;

const TRIP_MAP_VIEW_NEEDLE_HOT = `No=p.map_tile_url||"${TREK_DEFAULT_MAP_TILE_URL}",or=[p.default_lat||48.8566,p.default_lng||2.3522],_t=p.default_zoom||10,Ua={fontFamily:`;

const TRIP_MAP_VIEW_PATCH = `No=p.map_tile_url||"${TREK_DEFAULT_MAP_TILE_URL}",tsMapIv=I.useMemo(()=>tsTripMapInitialView({places:z,trip:r}),[z,r]),or=tsMapIv.ok?[tsMapIv.center.lat,tsMapIv.center.lng]:[NaN,NaN],_t=tsMapIv.ok?tsMapIv.zoom:2,Ua={fontFamily:`;

function patchDefaultMapTileFallbacks(source = '') {
  let js = String(source || '');
  const carto = CARTO_LIGHT_TILE_URL;
  const fallback = TREK_DEFAULT_MAP_TILE_URL;
  if (js.includes(`S_e="${carto}"`)) {
    js = js.replace(`S_e="${carto}"`, `S_e="${fallback}"`);
  }
  if (js.includes(`tileUrl:A="${carto}"`)) {
    js = js.replace(`tileUrl:A="${carto}"`, `tileUrl:A="${fallback}"`);
  }
  if (js.includes(`No=p.map_tile_url||"${carto}"`) && !js.includes(`No=p.map_tile_url||"${fallback}"`)) {
    js = js.replaceAll(`No=p.map_tile_url||"${carto}"`, `No=p.map_tile_url||"${fallback}"`);
  }
  if (js.includes(`No=p.map_tile_url||"${fallback}"`) || js.includes(`S_e="${fallback}"`)) {
    return js;
  }
  if (js.includes('map_tile_url') && js.includes(carto)) {
    throw new Error('trek bundle still uses Carto light_all as map_tile_url fallback');
  }
  return js;
}

const TRIP_MAP_LOG_NEEDLE = 'return I.useEffect(()=>{if(!W&&r){const lt=setTimeout(()=>vn(!0),1500);return()=>clearTimeout(lt)}},[W,r]),W||!jn?';

const TRIP_MAP_LOG_PATCH = 'return I.useEffect(()=>{if(!tsMapIv.ok)console.error(JSON.stringify({event:"map_center_unresolved",code:tsMapIv.code||"map_center_unresolved",tripId:e}))},[tsMapIv.ok,tsMapIv.code,e]),I.useEffect(()=>{if(tsMapIv.ok&&jn){const lt=setTimeout(()=>{const tsMapRoot=document.querySelector(".leaflet-container,.mapboxgl-map");if(!tsMapRoot||(tsMapRoot.classList.contains("leaflet-container")&&!tsMapRoot.getAttribute("data-ts-map-center")))console.error(JSON.stringify({event:"map_mount_failed",code:"map_mount_failed",tripId:e}))},3000);return()=>clearTimeout(lt)}},[tsMapIv.ok,jn,e]),I.useEffect(()=>{if(!W&&r){const lt=setTimeout(()=>vn(!0),1500);return()=>clearTimeout(lt)}},[W,r]),W||!jn?';

const TRIP_MAP_HOOK_LOG_NEEDLE = 'if(!document.querySelector(".leaflet-container,.mapboxgl-map"))console.error(JSON.stringify({event:"map_mount_failed",code:"map_mount_failed",tripId:e}))';

const TRIP_MAP_HOOK_RSE_NEEDLE = 'x!=null&&K.whenReady(x),U(tpe(K))';

const TRIP_MAP_HOOK_RSE_PATCH = 'x!=null&&K.whenReady(x),tsBindTripMapHookLeaflet(K),U(tpe(K))';

const TRIP_MAP_HOOK_RSE_ANCHOR = 'function rSe({bounds:e,boundsOptions:t,center:i,children:c,className:h,id:p,placeholder:g,style:r,whenReady:x,zoom:z,...P},A){';

const TRIP_MAP_HOOK_SNIPPET = tripMapHookBundleSnippet();

const TRIP_MAP_PLAN_NEEDLE = 'Se==="plan"&&n.jsxs("div",{style:{position:"absolute",inset:0},children:[n.jsx(hze,{';

const TRIP_MAP_PLAN_PATCH = 'Se==="plan"&&!tsMapIv.ok&&n.jsx("div",{"data-map-center-unresolved":"1","data-ts-trip-map-error":"1",style:{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:"var(--bg-primary)",color:"var(--text-muted)",fontSize:14,textAlign:"center"},children:c("trip.mapCenterUnresolved")}),Se==="plan"&&tsMapIv.ok&&n.jsxs("div",{style:{position:"absolute",inset:0},children:[n.jsx(hze,{';

const MAP_SETTINGS_DEFAULTS_NEEDLE = 'default_lat:48.8566,default_lng:2.3522,default_zoom:10';
const MAP_SETTINGS_DEFAULTS_PATCH = 'default_lat:null,default_lng:null,default_zoom:null';

const MAP_SETTINGS_FALLBACK_A = 'ee(e.default_lat||48.8566),pe(e.default_lng||2.3522),me(e.default_zoom||10)';
const MAP_SETTINGS_FALLBACK_B = 'ee(e.default_lat||48.8566),pe(e.default_lng||2.3522),me(e.default_zoom||10);';

const THING_LOGO_CHIP_DC_UPSTREAM_NEEDLE = 'dc=({item:G,size:Re=28})=>{const zt=_l(G),ua=Pc(G);return n.jsxs("span",{"aria-hidden":"true",style:{width:Re,height:Re,minWidth:Re,borderRadius:9,background:"#f8fafc",border:"1px solid #e5e7eb",display:"inline-flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",fontSize:Math.max(14,Math.round(Re*.62)),lineHeight:1,boxShadow:"0 1px 2px rgba(15,23,42,0.05)"},children:[n.jsx("span",{children:ua}),zt&&n.jsx("img",{src:zt,alt:"",loading:"lazy",onError:Rn=>{Rn.currentTarget.style.display="none"},style:{position:"absolute",inset:3,width:Re-6,height:Re-6,objectFit:"contain",borderRadius:6,background:"white"}})]})}';

const THING_LOGO_CHIP_DC_V1_NEEDLE = 'dc=({item:G,size:Re=28})=>{const zt=_l(G),ua=Pc(G);return n.jsxs("span",{"aria-hidden":"true",style:{width:Re,height:Re,minWidth:Re,borderRadius:9,background:"#f8fafc",border:"1px solid #e5e7eb",display:"inline-flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",fontSize:Math.max(14,Math.round(Re*.62)),lineHeight:1,boxShadow:"0 1px 2px rgba(15,23,42,0.05)"},children:zt?[n.jsx("img",{src:zt,alt:"",loading:"lazy",onError:Rn=>{Rn.currentTarget.style.display="none"},style:{width:"100%",height:"100%",maxWidth:"100%",maxHeight:"100%",objectFit:"contain",objectPosition:"center center",display:"block",padding:3,boxSizing:"border-box"}})]:[n.jsx("span",{style:{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:"100%",lineHeight:1},children:ua})]})}';

const THING_LOGO_CHIP_DC_PADDING_NEEDLE = 'dc=({item:G,size:Re=28})=>{const zt=_l(G),ua=Pc(G);return n.jsxs("span",{"data-ts-logo-chip":"1","aria-hidden":"true",style:{width:Re,height:Re,minWidth:Re,borderRadius:9,background:"#f8fafc",border:"1px solid #e5e7eb",display:"inline-grid",placeItems:"center",position:"relative",overflow:"hidden",fontSize:Math.max(14,Math.round(Re*.62)),lineHeight:1,boxShadow:"0 1px 2px rgba(15,23,42,0.05)",padding:3,boxSizing:"border-box"},children:zt?[n.jsx("img",{src:zt,alt:"",loading:"lazy",onError:Rn=>{Rn.currentTarget.style.display="none"},style:{maxWidth:"100%",maxHeight:"100%",width:"auto",height:"auto",objectFit:"contain",objectPosition:"center center",display:"block"}})]:[n.jsx("span",{style:{display:"grid",placeItems:"center",width:"100%",height:"100%",lineHeight:1},children:ua})]})}';

const THING_LOGO_CHIP_DC_PATCH = 'dc=({item:G,size:Re=28})=>{const zt=_l(G),ua=Pc(G);return n.jsxs("span",{"data-ts-logo-chip":"1","aria-hidden":"true",style:{width:Re,height:Re,minWidth:Re,borderRadius:9,background:"#f8fafc",border:"1px solid #e5e7eb",display:"inline-grid",placeItems:"center",position:"relative",overflow:"hidden",fontSize:Math.max(14,Math.round(Re*.62)),lineHeight:1,boxShadow:"0 1px 2px rgba(15,23,42,0.05)",boxSizing:"border-box"},children:zt?[n.jsx("img",{className:"tiny-logo",src:zt,alt:"",loading:"lazy",onError:Rn=>{Rn.currentTarget.style.display="none"},style:{maxWidth:"100%",maxHeight:"100%",width:"auto",height:"auto",objectFit:"contain",objectPosition:"center center",display:"block"}})]:[n.jsx("span",{style:{display:"grid",placeItems:"center",width:"100%",height:"100%",lineHeight:1},children:ua})]})}';

const CME_CAR_TYPE_NEEDLE = 'i==="flight"?"✈️":i==="transport"?"🚕"';

const CME_CAR_TYPE_PATCH = 'i==="flight"?"✈️":i==="car"?"🚗":i==="transport"?"🚕"';

const CME_CAR_HEURISTIC_NEEDLE = '?"🎭":/flight|airport|jetblue|southwest|united|delta|american|las|jfk|lga|ewr/.test(c)?"✈️":/store|shop|shopping|grocery|market|whole foods|pharmacy/.test(c)?';

const CME_CAR_HEURISTIC_PATCH = '?"🎭":/\\bcar\\b|rental|hertz|avis|enterprise|budget rent|alamo/.test(c)?"🚗":/flight|airport|jetblue|southwest|united|delta|american|las|jfk|lga|ewr/.test(c)?"✈️":/store|shop|shopping|grocery|market|whole foods|pharmacy/.test(c)?';

const MAP_MARKER_LOGO_NEEDLE = 'p=c?`<img src="${c}" alt="" style="width:30px;height:30px;object-fit:contain;border:0;background:transparent;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.30));" />`';

const MAP_MARKER_LOGO_PATCH = 'p=c?`<div data-ts-logo-chip="1" style="width:30px;height:30px;display:grid;place-items:center;box-sizing:border-box;padding:2px"><img src="${c}" alt="" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;border:0;background:transparent;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.30));" /></div>`';

const DETAIL_TIMELINE_EMOJI_NEEDLE = 'style:{fontSize:ua.isConflict?14:17,lineHeight:1,transform:"translateY(0.5px)"},children:sr}';

const DETAIL_TIMELINE_EMOJI_PATCH = 'style:{fontSize:ua.isConflict?14:17,lineHeight:1,display:"grid",placeItems:"center"},children:sr}';

const BOOKINGS_TAB_ICON_NEEDLE = 'G.icon?n.jsx("span",{style:{width:16,height:16,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:14,lineHeight:1,flex:"0 0 16px",transform:"translateY(-0.5px)"},children:G.icon})';

const TAB_ICON_TRANSFORM_NEEDLE = 'flex:"0 0 16px",transform:"translateY(-0.5px)"},children:G.icon}';
const TAB_ICON_TRANSFORM_PATCH = 'flex:"0 0 16px",transform:"translate3d(0,-0.5px,0)"},children:G.icon}';

const BOOKINGS_TAB_ICON_V2_PATCH = 'G.icon?n.jsx("span",{"data-tab-category":G.id,"data-ts-category-tab-icon":"1","data-ts-logo-chip":"1","aria-hidden":"true",style:{width:16,height:16,minWidth:16,minHeight:16,display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,flex:"0 0 16px",boxSizing:"border-box",position:"relative",top:0,alignSelf:"center"},children:n.jsx("span",{"data-ts-tab-emoji":"1",style:{display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,width:16,height:16},children:n.jsx("canvas",{width:32,height:32,ref:function(el){tsPaintTabEmoji(el,G.icon)},style:{width:16,height:16,display:"block"}})})})';

const BOOKINGS_TAB_LABEL_NEEDLE = 'n.jsx("span",{style:Re&&q!==G.id?{display:"none"}:void 0,children:G.label})';

const BOOKINGS_TAB_LABEL_PATCH = 'n.jsx("span",{style:Re&&q!==G.id?{display:"none"}:{lineHeight:1,display:"inline-flex",alignItems:"center",verticalAlign:"middle"},children:G.label})';

const TAB_BUTTON_LINE_HEIGHT_NEEDLE = 'whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4,background:q===G.id?';

const TAB_BUTTON_LINE_HEIGHT_PATCH = 'whiteSpace:"nowrap",display:"flex",alignItems:"center",lineHeight:1,gap:4,background:q===G.id?';

const TAB_BUTTON_DATA_TAB_NEEDLE = 'n.jsxs("button",{title:Re?G.label:void 0,"aria-label":G.label,onClick:()=>{W(G.id)},style:{';

const TAB_BUTTON_DATA_TAB_PATCH = 'n.jsxs("button",{"data-ts-tab":G.id,"data-tab":G.id,"data-tab-category":G.id,"data-ts-category-tab-icon":"1","data-ts-logo-chip":"1",title:Re?G.label:void 0,"aria-label":G.label,onClick:()=>{W(G.id)},style:{';

const TAB_EMOJI_INK_ANCHOR = 'function pze({places:e=[],dayPlaces:t=[]';

const TAB_EMOJI_LABEL_STYLE_NEEDLE = 'if(label){label.style.lineHeight="1";label.style.display="inline-flex";label.style.alignItems="center";label.style.verticalAlign="middle"}';
const TAB_EMOJI_LABEL_STYLE_PATCH = 'if(label){label.style.lineHeight="1";if(label.style.display!=="none"){label.style.display="inline-flex";label.style.alignItems="center";label.style.verticalAlign="middle"}}';
const TAB_EMOJI_INK_FN = 'function tsPaintTabEmoji(node,emoji){if(!node||!emoji)return;}';

const SERVED_FOOTER_AI_ASSISTED_NEEDLE = ',n.jsx("span",{style:{fontSize:11,color:"#c4c9d1"},children:"· AI-assisted vacation itinerary planning"})';

export function patchThingLogoChipAlignment(source = '') {
  let js = String(source || '');
  if (!js.includes(THING_LOGO_CHIP_DC_UPSTREAM_NEEDLE) && !js.includes('onError:Rn=>{Rn.currentTarget.style.display="none"')) {
    throw new Error('trek bundle missing upstream dc() logo chain (emoji under img on error)');
  }
  if (js.includes(MAP_MARKER_LOGO_NEEDLE)) js = js.replace(MAP_MARKER_LOGO_NEEDLE, MAP_MARKER_LOGO_PATCH);
  else if (!js.includes('data-ts-logo-chip="1" style="width:30px')) {
    throw new Error('trek bundle missing map marker logo needle for centering patch');
  }
  if (js.includes(DETAIL_TIMELINE_EMOJI_NEEDLE)) {
    js = js.replace(DETAIL_TIMELINE_EMOJI_NEEDLE, DETAIL_TIMELINE_EMOJI_PATCH);
  }
  if (js.includes(TAB_ICON_TRANSFORM_NEEDLE)) {
    js = js.replace(TAB_ICON_TRANSFORM_NEEDLE, TAB_ICON_TRANSFORM_PATCH);
  } else if (!js.includes('transform:"translate3d(0,-0.5px,0)"},children:G.icon}')) {
    throw new Error('trek bundle missing bookings tab icon transform anchor');
  }
  if (js.includes(BOOKINGS_TAB_ICON_V2_PATCH) || js.includes('ref:function(el){tsPaintTabEmoji(el,G.icon)}')) {
    throw new Error('trek bundle must not paint category tab icons on canvas');
  }
  if (js.includes(BOOKINGS_TAB_LABEL_NEEDLE)) {
    js = js.replace(BOOKINGS_TAB_LABEL_NEEDLE, BOOKINGS_TAB_LABEL_PATCH);
  } else if (!js.includes('display:"inline-flex",alignItems:"center",verticalAlign:"middle"},children:G.label')) {
    throw new Error('trek bundle missing category tab label anchor for centering patch');
  }
  if (js.includes(TAB_BUTTON_DATA_TAB_NEEDLE)) {
    js = js.replace(TAB_BUTTON_DATA_TAB_NEEDLE, TAB_BUTTON_DATA_TAB_PATCH);
  } else if (!js.includes('"data-ts-tab":G.id,"data-tab":G.id,title:Re?G.label:void 0')) {
    throw new Error('trek bundle missing category tab button anchor for data-tab patch');
  }
  if (!js.includes('function tsPaintTabEmoji(')) {
    if (!js.includes(TAB_EMOJI_INK_ANCHOR)) {
      throw new Error('trek bundle missing anchor for category tab emoji ink centering');
    }
    js = js.replace(TAB_EMOJI_INK_ANCHOR, `${TAB_EMOJI_INK_FN}${TAB_EMOJI_INK_ANCHOR}`);
  }
  if (js.includes('function tsListColumnSort(')) {
    throw new Error('trek bundle must not inject tsListColumnSort (use original Wr sort pills)');
  }
  if (js.includes(CME_CAR_TYPE_NEEDLE)) js = js.replace(CME_CAR_TYPE_NEEDLE, CME_CAR_TYPE_PATCH);
  if (js.includes(CME_CAR_HEURISTIC_NEEDLE)) js = js.replace(CME_CAR_HEURISTIC_NEEDLE, CME_CAR_HEURISTIC_PATCH);
  if (js.includes(THING_LOGO_CHIP_DC_PADDING_NEEDLE)) {
    js = js.replace(THING_LOGO_CHIP_DC_PADDING_NEEDLE, THING_LOGO_CHIP_DC_PATCH);
  } else if (js.includes(THING_LOGO_CHIP_DC_V1_NEEDLE)) {
    js = js.replace(THING_LOGO_CHIP_DC_V1_NEEDLE, THING_LOGO_CHIP_DC_PATCH);
  } else if (js.includes(THING_LOGO_CHIP_DC_UPSTREAM_NEEDLE)) {
    js = js.replace(THING_LOGO_CHIP_DC_UPSTREAM_NEEDLE, THING_LOGO_CHIP_DC_PATCH);
  } else if (!js.includes('"data-ts-logo-chip":"1","aria-hidden":"true",style:{width:Re,height:Re')) {
    throw new Error('trek bundle dc() logo chip patch did not apply');
  }
  return applyActivePillEdgePatch(js);
}

export function patchTripMapInitialView(source = '') {
  let js = String(source || '');
  if (!js.includes(TRIP_MAP_INJECT_NEEDLE) && !js.includes('tsTripMapInitialView=')) {
    return js;
  }
  if (!js.includes('tsTripMapInitialView=')) {
    if (!js.includes(TRIP_MAP_INJECT_NEEDLE)) {
      throw new Error('trek bundle missing pze() anchor for trip map initial view patch');
    }
    js = js.replace(TRIP_MAP_INJECT_NEEDLE, `${TRIP_MAP_SNIPPET}${TRIP_MAP_INJECT_NEEDLE}`);
  }
  if (js.includes(TRIP_MAP_VIEW_NEEDLE)) js = js.replace(TRIP_MAP_VIEW_NEEDLE, TRIP_MAP_VIEW_PATCH);
  else if (js.includes(TRIP_MAP_VIEW_NEEDLE_HOT)) js = js.replace(TRIP_MAP_VIEW_NEEDLE_HOT, TRIP_MAP_VIEW_PATCH);
  else if (js.includes('tsMapIv=I.useMemo') && !js.includes('tsMapIv=I.useMemo(()=>tsTripMapInitialView({places:z,trip:r})')) {
    throw new Error('trip map initial view patch did not apply (view needle missing)');
  }
  if (js.includes(TRIP_MAP_LOG_NEEDLE)) js = js.replace(TRIP_MAP_LOG_NEEDLE, TRIP_MAP_LOG_PATCH);
  else if (js.includes('tsMapIv=I.useMemo') && !js.includes('map_mount_failed')) {
    throw new Error('trip map mount guard patch did not apply (log needle missing)');
  }
  if (js.includes(TRIP_MAP_PLAN_NEEDLE)) js = js.replace(TRIP_MAP_PLAN_NEEDLE, TRIP_MAP_PLAN_PATCH);
  js = js.replaceAll(MAP_CENTER_PARIS_A, 'center:r=void 0');
  js = js.replaceAll(MAP_CENTER_PARIS_B, 'center:z=void 0');
  js = js.replaceAll(MAP_SETTINGS_DEFAULTS_NEEDLE, MAP_SETTINGS_DEFAULTS_PATCH);
  js = js.replaceAll(MAP_SETTINGS_FALLBACK_A, 'ee(e.default_lat??null),pe(e.default_lng??null),me(e.default_zoom??null)');
  js = js.replaceAll(MAP_SETTINGS_FALLBACK_B, 'ee(e.default_lat??null),pe(e.default_lng??null),me(e.default_zoom??null);');
  js = js.replaceAll('||48.8566', '??null').replaceAll('||2.3522', '??null');
  if (js.includes('or=[p.default_lat')) {
    throw new Error('trek bundle still uses default_lat Paris fallback for trip map center');
  }
  if (!js.includes('tsTripMapInitialView=')) {
    throw new Error('trip map initial view patch did not apply');
  }
  if (!js.includes('tsMapIv=I.useMemo(()=>tsTripMapInitialView({places:z,trip:r})')) {
    throw new Error('trip map initial view patch did not apply');
  }
  if (!js.includes('map_mount_failed')) {
    throw new Error('trip map mount guard patch did not apply');
  }
  js = patchDefaultMapTileFallbacks(js);
  return patchTripMapHarnessHook(js);
}

export function patchTripMapHarnessHook(source = '') {
  let js = String(source || '');
  const mapIvPatched = js.includes('tsMapIv=I.useMemo(()=>tsTripMapInitialView({places:z,trip:r})');
  if (!mapIvPatched) {
    return js;
  }
  if (!js.includes('tsBindTripMapHookLeaflet')) {
    if (!js.includes(TRIP_MAP_HOOK_RSE_ANCHOR)) {
      throw new Error('trek bundle missing MapContainer anchor for trip map harness hook patch');
    }
    js = js.replace(TRIP_MAP_HOOK_RSE_ANCHOR, `${TRIP_MAP_HOOK_SNIPPET}${TRIP_MAP_HOOK_RSE_ANCHOR}`);
    if (!js.includes(TRIP_MAP_HOOK_RSE_NEEDLE)) {
      throw new Error('trek bundle missing MapContainer whenReady anchor for trip map harness hook patch');
    }
    js = js.replace(TRIP_MAP_HOOK_RSE_NEEDLE, TRIP_MAP_HOOK_RSE_PATCH);
  }
  if (js.includes(TRIP_MAP_HOOK_LOG_NEEDLE)) {
    js = js.replace(TRIP_MAP_HOOK_LOG_NEEDLE, 'const tsMapRoot=document.querySelector(".leaflet-container,.mapboxgl-map");if(!tsMapRoot||(tsMapRoot.classList.contains("leaflet-container")&&!tsMapRoot.getAttribute("data-ts-map-center")))console.error(JSON.stringify({event:"map_mount_failed",code:"map_mount_failed",tripId:e}))');
  }
  if (!js.includes('tsBindTripMapHookLeaflet')) {
    throw new Error('trip map harness hook patch did not apply');
  }
  if (!js.includes('data-ts-map-center')) {
    throw new Error('trip map harness hook patch did not apply (data-ts-map-center missing)');
  }
  if (!js.includes('window.__tsTripMap')) {
    throw new Error('trip map harness hook patch did not apply (__tsTripMap missing)');
  }
  if (js.includes(TRIP_MAP_HOOK_RSE_NEEDLE)) {
    throw new Error('trip map harness hook MapContainer patch did not apply');
  }
  return js;
}

const DN_HOST_NEEDLE = 'dn=typeof window<"u"&&/(^|\\.)timesyncher\\.com$/i.test(window.location.hostname)';
const DN_HOST_PATCH = 'dn=typeof window<"u"&&(/(^|\\.)timesyncher\\.com$/i.test(window.location.hostname)||/(^127\\.0\\.0\\.1$|^localhost$)/i.test(window.location.hostname))';
const DN_SHARED_PATH_NEEDLE = '||/timesyncher/i.test(`${la.title||""} ${la.description||""}`)';
const DN_SHARED_PATH_PATCH = '||/timesyncher/i.test(`${la.title||""} ${la.description||""}`)||(typeof window<"u"&&/(^|\\/)shared\\//.test(window.location.pathname||""))';

export function patchSharedTripHostnameForLocalHarness(js = '') {
  let source = String(js || '');
  if (source.includes(DN_HOST_NEEDLE)) source = source.replace(DN_HOST_NEEDLE, DN_HOST_PATCH);
  if (source.includes(DN_SHARED_PATH_NEEDLE) && !source.includes('/(^|\\/)shared\\//.test(window.location.pathname||""))')) {
    source = source.replace(DN_SHARED_PATH_NEEDLE, DN_SHARED_PATH_PATCH);
  }
  return source;
}

export function applyLiveProductPatches(patched = '', options = {}) {
  const served = options.served === true;
  let js = patchDayByDayKeepsakeMap(stripHotelBrandNameGuessing(String(patched || '')), { served });
  if (js.includes(LIST_LOGO_PATCH) && js.includes(LIST_LOGO_NEEDLE)) {
    throw new Error('served bundle must keep TREK _l() logo chain (logo, favicon, oi(cc))');
  }
  if (js.includes(LOGO_SELECTOR_NEEDLE)) js = js.replace(LOGO_SELECTOR_NEEDLE, LOGO_SELECTOR_PATCH);
  if (served && !js.includes('AI-assisted vacation itinerary planning') && !js.includes('AI-assisted itinerary planning')) {
    throw new Error('served shared footer missing AI-assisted itinerary planning tagline');
  }
  if (js.includes(DN_HOST_NEEDLE)) js = js.replace(DN_HOST_NEEDLE, DN_HOST_PATCH);
  if (js.includes(DN_SHARED_PATH_NEEDLE) && !js.includes('/(^|\\/)shared\\//.test(window.location.pathname||""))')) {
    js = js.replace(DN_SHARED_PATH_NEEDLE, DN_SHARED_PATH_PATCH);
  }
  js = js.replace(/\(Claude Web, Cursor, etc\.\)/g, '(supported MCP clients)');
  js = js.replace(/\(Claude Web, Cursor usw\.\)/g, '(supported MCP clients)');
  js = js.replace(/\(Claude Web, Cursor, ecc\.\)/g, '(supported MCP clients)');
  js = js.replace(/\(Claude Web, Cursor, enz\.\)/g, '(supported MCP clients)');
  js = js.replace(/\(Claude Web, Cursor itp\.\)/g, '(supported MCP clients)');
  js = js.replace(/\(Claude Web, Cursor atd\.\)/g, '(supported MCP clients)');
  js = js.replace(/\(Claude Web, Cursor stb\.\)/g, '(supported MCP clients)');
  js = js.replace(/\(Claude Web, Cursor и др\.\)/g, '(supported MCP clients)');
  js = js.replace(/（Claude Web、Cursor 等）/g, '（supported MCP clients）');
  js = js.replace(/\(Claude Web وCursor وغيرها\)/g, '(supported MCP clients)');
  js = js.replace(/\(Claude Web, Cursor, dll\.\)/g, '(supported MCP clients)');
  js = js.replace(/Claude Desktop, Work laptop/g, 'Example client, Work laptop');
  js = js.replace(/Claude Desktop, Laptop di lavoro/g, 'Example client, Work laptop');
  js = js.replace(/Claude Desktop, Werklaptop/g, 'Example client, Work laptop');
  return patchLiveProductDetailBundle(patchTripMapInitialView(js));
}

export {
  applySharedLiveTabBundlePatches,
  REST_TYPE_CHIPS_NEEDLE,
  REST_TYPE_CHIPS_PATCH,
  QN_RENDER_PATCH,
  GN_RENDER_PATCH,
  KI_RENDER_PATCH,
  QN_EMPTY_PATCH,
  GN_EMPTY_PATCH,
  KI_EMPTY_PATCH,
} from './trek-shared-live-tab-bundle-patches.mjs';
