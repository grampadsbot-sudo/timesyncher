import { tripMapInitialViewBundleSnippet } from './trip-map-initial-view.mjs';

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

const TRIP_MAP_LOG_PATCH = 'return I.useEffect(()=>{if(!tsMapIv.ok)console.error(JSON.stringify({event:"map_center_unresolved",code:tsMapIv.code||"map_center_unresolved",tripId:e}))},[tsMapIv.ok,tsMapIv.code,e]),I.useEffect(()=>{if(tsMapIv.ok&&jn){const lt=setTimeout(()=>{if(!document.querySelector(".leaflet-container,.mapboxgl-map"))console.error(JSON.stringify({event:"map_mount_failed",code:"map_mount_failed",tripId:e}))},3000);return()=>clearTimeout(lt)}},[tsMapIv.ok,jn,e]),I.useEffect(()=>{if(!W&&r){const lt=setTimeout(()=>vn(!0),1500);return()=>clearTimeout(lt)}},[W,r]),W||!jn?';

const TRIP_MAP_PLAN_NEEDLE = 'Se==="plan"&&n.jsxs("div",{style:{position:"absolute",inset:0},children:[n.jsx(hze,{';

const TRIP_MAP_PLAN_PATCH = 'Se==="plan"&&!tsMapIv.ok&&n.jsx("div",{"data-map-center-unresolved":"1","data-ts-trip-map-error":"1",style:{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:"var(--bg-primary)",color:"var(--text-muted)",fontSize:14,textAlign:"center"},children:c("trip.mapCenterUnresolved")}),Se==="plan"&&tsMapIv.ok&&n.jsxs("div",{style:{position:"absolute",inset:0},children:[n.jsx(hze,{';

const MAP_SETTINGS_DEFAULTS_NEEDLE = 'default_lat:48.8566,default_lng:2.3522,default_zoom:10';
const MAP_SETTINGS_DEFAULTS_PATCH = 'default_lat:null,default_lng:null,default_zoom:null';

const MAP_SETTINGS_FALLBACK_A = 'ee(e.default_lat||48.8566),pe(e.default_lng||2.3522),me(e.default_zoom||10)';
const MAP_SETTINGS_FALLBACK_B = 'ee(e.default_lat||48.8566),pe(e.default_lng||2.3522),me(e.default_zoom||10);';

const THING_LOGO_CHIP_NEEDLE = 'children:[n.jsx("span",{children:ua}),zt&&n.jsx("img",{src:zt,alt:"",loading:"lazy",onError:Rn=>{Rn.currentTarget.style.display="none"},style:{position:"absolute",inset:3,width:Re-6,height:Re-6,objectFit:"contain",borderRadius:6,background:"white"}})]})';
const THING_LOGO_CHIP_PATCH = 'children:zt?[n.jsx("img",{src:zt,alt:"",loading:"lazy",onError:Rn=>{Rn.currentTarget.style.display="none"},style:{width:"100%",height:"100%",maxWidth:"100%",maxHeight:"100%",objectFit:"contain",objectPosition:"center center",display:"block",padding:3,boxSizing:"border-box"}})]:[n.jsx("span",{style:{display:"flex",alignItems:"center",justifyContent:"center",width:"100%",height:"100%",lineHeight:1},children:ua})]})';

export function stripSharedBudgetTab(source = '') {
  let js = String(source || '');
  js = js.replace(/,\.\.\.Tn!=null&&Tn\.share_budget\?\[\{id:"budget",label:"Budget",icon:"💵"\}\]:\[\]/g, '');
  js = js.replace(/,\.\.\.Tn!=null&&Tn\.share_budget\?\[\{id:"budget",label:x\("shared\.tabBudget"\),Icon:rm\}\]:\[\]/g, '');
  return js;
}

export function patchThingLogoChipAlignment(source = '') {
  let js = String(source || '');
  if (!js.includes(THING_LOGO_CHIP_NEEDLE)) {
    if (js.includes(THING_LOGO_CHIP_PATCH)) return js;
    throw new Error('trek bundle missing thing logo chip needle for centering patch');
  }
  return js.replace(THING_LOGO_CHIP_NEEDLE, THING_LOGO_CHIP_PATCH);
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
  return js;
}

export function applyLiveProductPatches(patched = '') {
  let js = stripHotelBrandNameGuessing(String(patched || ''));
  if (js.includes(LIST_LOGO_NEEDLE)) js = js.replace(LIST_LOGO_NEEDLE, LIST_LOGO_PATCH);
  else if (js.includes(LIST_LOGO_PATCH_NEEDLE)) js = js.replace(LIST_LOGO_PATCH_NEEDLE, LIST_LOGO_PATCH);
  if (js.includes(REST_ALL_TAGS_NEEDLE)) js = js.replace(REST_ALL_TAGS_NEEDLE, REST_ALL_TAGS_PATCH);
  if (js.includes(LOGO_SELECTOR_NEEDLE)) js = js.replace(LOGO_SELECTOR_NEEDLE, LOGO_SELECTOR_PATCH);
  js = patchThingLogoChipAlignment(js);
  js = stripSharedBudgetTab(js);
  return patchTripMapInitialView(js);
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
