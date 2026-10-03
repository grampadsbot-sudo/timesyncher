import { tripMapInitialViewBundleSnippet } from './trip-map-initial-view.mjs';
import { tripMapHookBundleSnippet } from './trip-map-hook.mjs';

export const LIST_LOGO_PATCH = '_l=G=>{const Re=ha(G),raw=String(Re.logoUrl||Re.iconUrl||G.logoUrl||"").trim();if(!raw||/^data:image\\/svg\\+xml/i.test(raw))return "";if(/\\/ts-thing-media\\//i.test(raw)&&!/\\/ts-thing-logos\\//i.test(raw))return "";return raw}';

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

const TRIP_MAP_VIEW_NEEDLE = 'No=p.map_tile_url||"https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",or=[p.default_lat||48.8566,p.default_lng||2.3522],_t=p.default_zoom||10,Ua={fontFamily:';

const TRIP_MAP_VIEW_PATCH = 'No=p.map_tile_url||"https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",tsMapIv=I.useMemo(()=>tsTripMapInitialView({places:z,trip:r}),[z,r]),or=tsMapIv.ok?[tsMapIv.center.lat,tsMapIv.center.lng]:[NaN,NaN],_t=tsMapIv.ok?tsMapIv.zoom:2,Ua={fontFamily:';

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

const BOOKINGS_TAB_ICON_PATCH = 'G.icon?n.jsx("span",{"data-ts-logo-chip":"1","aria-hidden":"true",style:{width:16,height:16,display:"inline-grid",placeItems:"center",fontSize:14,lineHeight:1,flex:"0 0 16px"},children:G.icon})';

export function patchThingLogoChipAlignment(source = '') {
  let js = String(source || '');
  if (js.includes(THING_LOGO_CHIP_DC_PADDING_NEEDLE)) {
    js = js.replace(THING_LOGO_CHIP_DC_PADDING_NEEDLE, THING_LOGO_CHIP_DC_PATCH);
  } else if (!js.includes('className:"tiny-logo",src:zt')) {
    if (js.includes(THING_LOGO_CHIP_DC_V1_NEEDLE)) js = js.replace(THING_LOGO_CHIP_DC_V1_NEEDLE, THING_LOGO_CHIP_DC_PATCH);
    else if (js.includes(THING_LOGO_CHIP_DC_UPSTREAM_NEEDLE)) js = js.replace(THING_LOGO_CHIP_DC_UPSTREAM_NEEDLE, THING_LOGO_CHIP_DC_PATCH);
    else if (!js.includes('data-ts-logo-chip":"1"')) {
      throw new Error('trek bundle missing dc() anchor for thing logo chip centering patch');
    }
  }
  if (js.includes(MAP_MARKER_LOGO_NEEDLE)) js = js.replace(MAP_MARKER_LOGO_NEEDLE, MAP_MARKER_LOGO_PATCH);
  else if (!js.includes('data-ts-logo-chip="1" style="width:30px')) {
    throw new Error('trek bundle missing map marker logo needle for centering patch');
  }
  if (js.includes(DETAIL_TIMELINE_EMOJI_NEEDLE)) {
    js = js.replace(DETAIL_TIMELINE_EMOJI_NEEDLE, DETAIL_TIMELINE_EMOJI_PATCH);
  }
  if (js.includes(BOOKINGS_TAB_ICON_NEEDLE)) {
    js = js.replace(BOOKINGS_TAB_ICON_NEEDLE, BOOKINGS_TAB_ICON_PATCH);
  } else if (js.includes('transform:"translateY(-0.5px)"},children:G.icon}')) {
    throw new Error('trek bundle missing bookings tab icon needle for centering patch');
  }
  if (js.includes(CME_CAR_TYPE_NEEDLE)) js = js.replace(CME_CAR_TYPE_NEEDLE, CME_CAR_TYPE_PATCH);
  if (js.includes(CME_CAR_HEURISTIC_NEEDLE)) js = js.replace(CME_CAR_HEURISTIC_NEEDLE, CME_CAR_HEURISTIC_PATCH);
  if (!js.includes('display:"inline-grid",placeItems:"center"')) {
    throw new Error('thing logo chip centering patch did not apply');
  }
  if (js.includes(THING_LOGO_CHIP_DC_V1_NEEDLE) || js.includes(THING_LOGO_CHIP_DC_UPSTREAM_NEEDLE)) {
    throw new Error('thing logo chip centering patch did not apply');
  }
  return js;
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

export function applyLiveProductPatches(patched = '') {
  let js = stripHotelBrandNameGuessing(String(patched || ''));
  if (js.includes(LIST_LOGO_NEEDLE)) js = js.replace(LIST_LOGO_NEEDLE, LIST_LOGO_PATCH);
  else if (js.includes(LIST_LOGO_PATCH_NEEDLE)) js = js.replace(LIST_LOGO_PATCH_NEEDLE, LIST_LOGO_PATCH);
  if (js.includes(REST_ALL_TAGS_NEEDLE)) js = js.replace(REST_ALL_TAGS_NEEDLE, REST_ALL_TAGS_PATCH);
  if (js.includes(LOGO_SELECTOR_NEEDLE)) js = js.replace(LOGO_SELECTOR_NEEDLE, LOGO_SELECTOR_PATCH);
  return patchTripMapInitialView(js);
}

const LIVE_TAB_NEEDLE = '$n=gt.filter(G=>Fs.some(Re=>vn(Re).includes(G))),Gn=Fs.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Je.length||Je.every(Re=>vn(G).includes(Re))),ci=ot.filter(G=>Oc.some(Re=>or(Re).includes(G))),Qn=Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re))),ki=Cc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!vt.length||vt.includes(Yd(G)))';
const LIVE_TAB_PATCH = 'tsPad=(rows)=>rows,tsListThings=(rows)=>rows.filter(Re=>!Re.__tsLiveFill&&(!ze.length||ze.includes(En(Re)))),$n=gt.filter(G=>tsListThings(Fs).some(Re=>vn(Re).includes(G))),Gn=tsPad(Fs.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Je.length||Je.every(Re=>vn(G).includes(Re)))),ci=[...new Set(tsListThings(Oc).flatMap(Re=>or(Re).map(zt=>String(zt||"").trim()).filter(Boolean)))],Qn=tsPad(Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re)))),ki=tsPad(Cc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!vt.length||vt.includes(Yd(G))))';
const LIVE_TAB_MOUNT_HELPER_NEEDLE = 'tsPad=(rows)=>rows,tsListThings=';
const LIVE_TAB_MOUNT_HELPER_PATCH = 'tsPad=(rows)=>rows,tsSharedLiveTabListMount=G=>{const h=window.__TS_SHARED_LIVE_TAB_LISTS__?.[G];if(!h)throw new Error("shared_live_tab_lists_missing:"+G);return n.jsx("div",{"data-shared-live-tab-mount":G,dangerouslySetInnerHTML:{__html:h},style:{display:"contents"}})},tsListThings=';
const LIVE_TAB_DELEGATE_HOTELS_NEEDLE = 'Gn=tsPad(Fs.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Je.length||Je.every(Re=>vn(G).includes(Re)))),';
const LIVE_TAB_DELEGATE_HOTELS_PATCH = 'Gn=[],';
const LIVE_TAB_DELEGATE_CARS_NEEDLE = 'ki=tsPad(Cc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!vt.length||vt.includes(Yd(G)))),';
const LIVE_TAB_DELEGATE_CARS_PATCH = 'ki=[],';
const GN_RENDER_DELEGATE_NEEDLE = 'tsPad(Gn).map(G=>Oe(G)),tsPad(Gn).length===0';
const GN_RENDER_DELEGATE_PATCH = 'tsSharedLiveTabListMount("hotels"),false&&tsPad(Gn).length===0';
const KI_RENDER_DELEGATE_NEEDLE = 'tsPad(ki).map(G=>Oe(G))';
const KI_RENDER_DELEGATE_PATCH = 'tsSharedLiveTabListMount("cars")';
export const REST_TYPE_CHIPS_NEEDLE = 'Os.map(G=>n.jsx("button",{onClick:()=>Kn(G)';
export const REST_TYPE_CHIPS_PATCH = 'Os.filter(G=>tsListThings(Cc).some(Re=>Yd(Re)===G)).map(G=>n.jsx("button",{onClick:()=>Kn(G)';
export const QN_RENDER_PATCH = 'tsPad(Qn).map(G=>Oe(G))';
const QN_RENDER_NEEDLE = 'Qn.map(G=>Oe(G))';
export const GN_RENDER_PATCH = 'tsPad(Gn).map(G=>Oe(G))';
const GN_RENDER_NEEDLE = 'Gn.map(G=>Oe(G))';
export const KI_RENDER_PATCH = 'tsPad(ki).map(G=>Oe(G))';
const KI_RENDER_NEEDLE = 'ki.map(G=>Oe(G))';
const QN_EMPTY_NEEDLE = 'tsPad(Qn).map(G=>Oe(G)),Qn.length===0';
export const QN_EMPTY_PATCH = 'tsPad(Qn).map(G=>Oe(G)),tsPad(Qn).length===0';
const GN_EMPTY_NEEDLE = 'tsPad(Gn).map(G=>Oe(G)),Gn.length===0';
export const GN_EMPTY_PATCH = 'tsPad(Gn).map(G=>Oe(G)),tsPad(Gn).length===0';
const KI_EMPTY_NEEDLE = 'tsPad(ki).map(G=>Oe(G)),ki.length===0';
export const KI_EMPTY_PATCH = 'tsPad(ki).map(G=>Oe(G)),tsPad(ki).length===0';

export function applySharedLiveTabBundlePatches(patched = '') {
  let js = String(patched || '');
  if (js.includes(LIVE_TAB_NEEDLE)) js = js.replace(LIVE_TAB_NEEDLE, LIVE_TAB_PATCH);
  if (js.includes(LIVE_TAB_MOUNT_HELPER_NEEDLE)) js = js.replace(LIVE_TAB_MOUNT_HELPER_NEEDLE, LIVE_TAB_MOUNT_HELPER_PATCH);
  if (js.includes(LIVE_TAB_DELEGATE_HOTELS_NEEDLE)) js = js.replace(LIVE_TAB_DELEGATE_HOTELS_NEEDLE, LIVE_TAB_DELEGATE_HOTELS_PATCH);
  if (js.includes(LIVE_TAB_DELEGATE_CARS_NEEDLE)) js = js.replace(LIVE_TAB_DELEGATE_CARS_NEEDLE, LIVE_TAB_DELEGATE_CARS_PATCH);
  if (js.includes(REST_TYPE_CHIPS_NEEDLE)) js = js.replace(REST_TYPE_CHIPS_NEEDLE, REST_TYPE_CHIPS_PATCH);
  if (js.includes(QN_RENDER_NEEDLE)) js = js.replace(QN_RENDER_NEEDLE, QN_RENDER_PATCH);
  if (js.includes(GN_RENDER_DELEGATE_NEEDLE)) js = js.replace(GN_RENDER_DELEGATE_NEEDLE, GN_RENDER_DELEGATE_PATCH);
  else if (js.includes(GN_RENDER_NEEDLE)) js = js.replace(GN_RENDER_NEEDLE, GN_RENDER_PATCH);
  if (js.includes(KI_RENDER_DELEGATE_NEEDLE)) js = js.replace(KI_RENDER_DELEGATE_NEEDLE, KI_RENDER_DELEGATE_PATCH);
  else if (js.includes(KI_RENDER_NEEDLE)) js = js.replace(KI_RENDER_NEEDLE, KI_RENDER_PATCH);
  if (js.includes(QN_EMPTY_NEEDLE)) js = js.replace(QN_EMPTY_NEEDLE, QN_EMPTY_PATCH);
  if (js.includes(GN_EMPTY_NEEDLE)) js = js.replace(GN_EMPTY_NEEDLE, GN_EMPTY_PATCH);
  if (js.includes(KI_EMPTY_NEEDLE)) js = js.replace(KI_EMPTY_NEEDLE, KI_EMPTY_PATCH);
  return js;
}

export function patchThingDetailRatings(source = '') {
  let js = String(source || '');
  const ratingEndMarker = 'placeholder:"Tripadvisor/OpenTable/Booking",style:De})]})]})';
  const ratingStarts = [
    'vo(Dt)&&n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:8},children:[',
    '["googleRating","yelpRating","thirdPartyRating"].some(k=>/\\d/.test(String(No(Dt,k)||"")))&&n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:8},children:[',
  ];
  const ratingPatch = 'n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:8},children:[["googleRating","Google rating"],["yelpRating","Yelp rating"],["thirdPartyRating","Other rating"]].map(([k,label])=>n.jsxs("label",{style:Hn,children:[label,n.jsx("input",{value:No(Dt,k),onChange:G=>Xa(Dt,k,G.target.value),placeholder:"",style:De})]},k))})';
  for (const ratingStart of ratingStarts) {
    const start = js.indexOf(ratingStart);
    const ratingEnd = start >= 0 ? js.indexOf(ratingEndMarker, start) : -1;
    if (start >= 0 && ratingEnd > start) {
      js = js.slice(0, start) + ratingPatch + js.slice(ratingEnd + ratingEndMarker.length);
      break;
    }
  }
  const reviewStart = js.indexOf('vo(Dt)&&[1,2,3].map(G=>n.jsxs("label",{style:Hn,children:["5-star review quote "');
  const reviewEnd = reviewStart >= 0 ? js.indexOf(']},G))]', reviewStart) : -1;
  if (reviewStart >= 0 && reviewEnd > reviewStart) {
    const reviewPatch = '[1,2,3].filter(G=>String(Ps(Dt,G)||"").trim()).map(G=>n.jsxs("label",{style:Hn,children:["Review ",G,n.jsx("textarea",{value:Ps(Dt,G),onChange:Re=>Xa(Dt,`review${G}`,Re.target.value),style:ur})]},G))]';
    js = js.slice(0, reviewStart) + reviewPatch + js.slice(reviewEnd + ']},G))]'.length);
  }
  return js.replaceAll('placeholder:"4.6"', 'placeholder:""').replaceAll('placeholder:"4.4"', 'placeholder:""');
}
