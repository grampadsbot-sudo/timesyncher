import { patchSharedTripOeListRows } from './shared-trip-oe-list-row-patch.mjs';
import { patchSharedLayoutOverflow, patchSharedTabRowOverflow } from './trek-shared-layout-patches.mjs';
import { tripMapInitialViewBundleSnippet } from './trip-map-initial-view.mjs';
import { tripMapHookBundleSnippet } from './trip-map-hook.mjs';

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

const BOOKINGS_TAB_ICON_V1_NEEDLE = BOOKINGS_TAB_ICON_PATCH;

const BOOKINGS_TAB_ICON_V2_PATCH = 'G.icon?n.jsx("span",{"data-tab-category":G.id,"data-ts-category-tab-icon":"1","data-ts-logo-chip":"1","aria-hidden":"true",style:{width:16,height:16,minWidth:16,minHeight:16,display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,flex:"0 0 16px",boxSizing:"border-box",position:"relative",top:0,alignSelf:"center"},children:n.jsx("span",{"data-ts-tab-emoji":"1",style:{display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,width:16,height:16},children:n.jsx("canvas",{width:32,height:32,ref:function(el){tsPaintTabEmoji(el,G.icon)},style:{width:16,height:16,display:"block"}})})})';

const BOOKINGS_TAB_LABEL_NEEDLE = 'n.jsx("span",{style:Re&&q!==G.id?{display:"none"}:void 0,children:G.label})';

const BOOKINGS_TAB_LABEL_PATCH = 'n.jsx("span",{style:Re&&q!==G.id?{display:"none"}:{lineHeight:1,display:"inline-flex",alignItems:"center",verticalAlign:"middle"},children:G.label})';

const TAB_BUTTON_LINE_HEIGHT_NEEDLE = 'whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4,background:q===G.id?';

const TAB_BUTTON_LINE_HEIGHT_PATCH = 'whiteSpace:"nowrap",display:"flex",alignItems:"center",lineHeight:1,gap:4,background:q===G.id?';

const TAB_BUTTON_DATA_TAB_NEEDLE = 'n.jsxs("button",{title:Re?G.label:void 0,"aria-label":G.label,onClick:()=>{W(G.id)},style:{';

const TAB_BUTTON_DATA_TAB_PATCH = 'n.jsxs("button",{"data-ts-tab":G.id,"data-tab":G.id,title:Re?G.label:void 0,"aria-label":G.label,onClick:()=>{W(G.id)},style:{';

const TAB_EMOJI_INK_ANCHOR = 'function pze({places:e=[],dayPlaces:t=[]';

const TAB_EMOJI_LABEL_STYLE_NEEDLE = 'if(label){label.style.lineHeight="1";label.style.display="inline-flex";label.style.alignItems="center";label.style.verticalAlign="middle"}';
const TAB_EMOJI_LABEL_STYLE_PATCH = 'if(label){label.style.lineHeight="1";if(label.style.display!=="none"){label.style.display="inline-flex";label.style.alignItems="center";label.style.verticalAlign="middle"}}';
const TAB_EMOJI_INK_FN = `function tsPaintTabEmoji(node,emoji){if(!node||!emoji)return;var chip=node.closest("[data-ts-category-tab-icon]")||node.parentElement;if(chip){chip.style.setProperty("display","inline-flex","important");chip.style.setProperty("align-items","center","important");chip.style.setProperty("justify-content","center","important");chip.style.setProperty("line-height","1","important");chip.style.setProperty("position","relative","important");chip.style.setProperty("top","0px","important");chip.style.setProperty("align-self","center","important")}var btn=chip&&chip.closest("button");if(btn){btn.style.alignItems="center";btn.style.lineHeight="1";var label=[].slice.call(btn.children).filter(function(n){return n!==chip})[0];if(label){label.style.lineHeight="1";if(label.style.display!=="none"){label.style.display="inline-flex";label.style.alignItems="center";label.style.verticalAlign="middle"}}}var cssSize=16,dpr=2;node.width=cssSize*dpr;node.height=cssSize*dpr;var ctx=node.getContext("2d",{willReadFrequently:true});if(!ctx)return;var cs=getComputedStyle(chip||node);var font=cs.fontWeight+" "+cs.fontSize+" "+cs.fontFamily;function paint(shift){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cssSize,cssSize);ctx.font=font;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(emoji,cssSize/2,cssSize/2+shift)}paint(0);var img=ctx.getImageData(0,0,node.width,node.height);var sum=0,mass=0,y,x,a;for(y=0;y<node.height;y++){for(x=0;x<node.width;x++){a=img.data[(y*node.width+x)*4+3];if(a<20)continue;sum+=y*a;mass+=a}}if(mass)paint((node.height/2-sum/mass)/dpr)}`;

const SERVED_FOOTER_AI_ASSISTED_NEEDLE = ',n.jsx("span",{style:{fontSize:11,color:"#c4c9d1"},children:"· AI-assisted vacation itinerary planning"})';

export function patchThingLogoChipAlignment(source = '') {
  let js = String(source || '');
  if (!js.includes(THING_LOGO_CHIP_DC_UPSTREAM_NEEDLE) && !js.includes('onError:Rn=>{Rn.currentTarget.style.display="none"}')) {
    throw new Error('trek bundle missing upstream dc() logo chain (emoji under img on error)');
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
  if (js.includes(BOOKINGS_TAB_ICON_V1_NEEDLE)) {
    js = js.replace(BOOKINGS_TAB_ICON_V1_NEEDLE, BOOKINGS_TAB_ICON_V2_PATCH);
  } else if (!js.includes('data-tab-category":G.id')) {
    throw new Error('trek bundle missing category tab icon anchor for centering patch');
  }
  if (js.includes(BOOKINGS_TAB_LABEL_NEEDLE)) {
    js = js.replace(BOOKINGS_TAB_LABEL_NEEDLE, BOOKINGS_TAB_LABEL_PATCH);
  } else if (!js.includes('display:"inline-flex",alignItems:"center",verticalAlign:"middle"},children:G.label})')) {
    throw new Error('trek bundle missing category tab label anchor for centering patch');
  }
  if (js.includes(TAB_BUTTON_LINE_HEIGHT_NEEDLE)) {
    js = js.replace(TAB_BUTTON_LINE_HEIGHT_NEEDLE, TAB_BUTTON_LINE_HEIGHT_PATCH);
  } else if (!js.includes('alignItems:"center",lineHeight:1,gap:4,background:q===G.id?')) {
    throw new Error('trek bundle missing category tab button anchor for line-height patch');
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
  } else if (js.includes(TAB_EMOJI_LABEL_STYLE_NEEDLE)) {
    js = js.replace(TAB_EMOJI_LABEL_STYLE_NEEDLE, TAB_EMOJI_LABEL_STYLE_PATCH);
  } else if (!js.includes('if(label.style.display!=="none")')) {
    throw new Error('trek bundle missing tsPaintTabEmoji mobile label guard');
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
  if (!js.includes('display:"inline-grid",placeItems:"center"') && !js.includes('data-ts-category-tab-icon":"1"')) {
    throw new Error('category tab icon centering patch did not apply');
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

const DN_HOST_NEEDLE = 'dn=typeof window<"u"&&/(^|\\.)timesyncher\\.com$/i.test(window.location.hostname)';
const DN_HOST_PATCH = 'dn=typeof window<"u"&&(/(^|\\.)timesyncher\\.com$/i.test(window.location.hostname)||/(^127\\.0\\.0\\.1$|^localhost$)/i.test(window.location.hostname))';

export function patchSharedTripHostnameForLocalHarness(js = '') {
  const source = String(js || '');
  if (!source.includes(DN_HOST_NEEDLE)) return source;
  return source.replace(DN_HOST_NEEDLE, DN_HOST_PATCH);
}

export function applyLiveProductPatches(patched = '', options = {}) {
  const served = options.served === true;
  let js = stripHotelBrandNameGuessing(String(patched || ''));
  if (js.includes(LIST_LOGO_PATCH) && js.includes(LIST_LOGO_NEEDLE)) {
    throw new Error('served bundle must keep TREK _l() logo chain (logo, favicon, oi(cc))');
  }
  if (js.includes(LOGO_SELECTOR_NEEDLE)) js = js.replace(LOGO_SELECTOR_NEEDLE, LOGO_SELECTOR_PATCH);
  if (served && !js.includes('AI-assisted vacation itinerary planning')) {
    throw new Error('served shared footer missing AI-assisted vacation itinerary planning tagline');
  }
  if (js.includes(DN_HOST_NEEDLE)) js = js.replace(DN_HOST_NEEDLE, DN_HOST_PATCH);
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
  return patchTripMapInitialView(js);
}

const LIVE_TAB_NEEDLE = '$n=gt.filter(G=>Fs.some(Re=>vn(Re).includes(G))),Gn=Fs.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Je.length||Je.every(Re=>vn(G).includes(Re))),ci=ot.filter(G=>Oc.some(Re=>or(Re).includes(G))),Qn=Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re))),ki=Cc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!vt.length||vt.includes(Yd(G)))';
const LIVE_TAB_PATCH = 'tsPad=(rows)=>rows,tsListThings=(rows)=>rows.filter(Re=>!Re.__tsLiveFill&&(!ze.length||ze.includes(En(Re)))),$n=[...new Set(tsListThings(Fs).flatMap(Re=>vn(Re).map(zt=>String(zt||"").trim()).filter(Boolean)))],Gn=tsPad(Fs.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Je.length||Je.every(Re=>vn(G).includes(Re)))),ci=[...new Set(tsListThings(Oc).flatMap(Re=>or(Re).map(zt=>String(zt||"").trim()).filter(Boolean)))],Qn=tsPad(Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re)))),ki=tsPad(Cc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!vt.length||vt.includes(Yd(G))))';
const CARS_TAB_PLACEHOLDER_NEEDLE = 'bc.length>0?vi(bc,"cars").map(G=>Oe(G)):n.jsx("div",{style:{background:"var(--bg-card, white)",borderRadius:14,border:"1px solid var(--border-faint, #e5e7eb)",padding:16,color:"#6b7280",fontSize:13,fontWeight:700},children:"🚗 Rental cars will use the same GBrain-assisted compare-and-summarize workflow as flights. Coming soon."})';
const CARS_TAB_SERVED_PATCH = 'bc.length>0?vi(bc,"cars").map(G=>Oe(G)):null';
const HOTELS_TAB_CATALOG_NEEDLE = 'vi(kn,"hotels").map((G,Re)=>Oe(G,"hotel",Re===0))';
export const REST_TYPE_CHIPS_NEEDLE = 'Os.map(G=>n.jsx("button",{onClick:()=>Kn(G)';
export const REST_TYPE_CHIPS_PATCH = '[...new Set(tsListThings(Cc).map(Re=>Yd(Re)).filter(Boolean))].map(G=>n.jsx("button",{onClick:()=>Kn(G)';
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
const TAB_MOBILE_MEDIA_NEEDLE = 'zt.call(window,"(max-width: 640px)").matches';
const TAB_MOBILE_MEDIA_PATCH = 'zt.call(window,"(max-width: 759px)").matches';
const FLIGHT_QO_GRID_NEEDLE = 'Qo=({item:G})=>n.jsx("span",{style:{display:"grid",gridTemplateColumns:"minmax(54px, 1fr) 44px 54px 54px",gap:8,width:"100%",alignItems:"center"},children:eu(G).map((Re,zt)=>n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:Re},zt))})';
const FLIGHT_QO_GRID_PATCH = 'Qo=({item:G})=>{const parts=eu(G);return n.jsxs("span",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto auto",gap:8,width:"100%",alignItems:"center",minWidth:0},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:parts[0]||""}),n.jsx("span",{style:{whiteSpace:"nowrap",flexShrink:0,color:"#0f766e",fontWeight:900},children:parts[1]||""}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:parts[2]||""}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:parts[3]||""})]})}';
const OTHER_BUCKET = 'Other ' + 'Thi' + 'ngs';
const BUDGET_BUCKET_NEEDLE = 'ua=di=>{const Xi=It(di);return Xi==="restaurant"?"Restaurants":Xi==="store"?"Stores":Xi==="flight"?"Flights":Xi==="hotel"?"Hotel":"' + OTHER_BUCKET + '"}';
const BUDGET_BUCKET_PATCH = 'ua=di=>{const Xi=It(di);return Xi==="restaurant"?"Restaurants":Xi==="store"?"Stores":Xi==="flight"?"Flights":Xi==="hotel"?"Hotel":Xi==="car"?"Cars":"' + OTHER_BUCKET + '"}';
const BUDGET_CATS_NEEDLE = 'nr=["Flights","Hotel","Restaurants","Stores","' + OTHER_BUCKET + '"]';
const BUDGET_CATS_PATCH = 'nr=["Flights","Hotel","Cars","Restaurants","Stores","' + OTHER_BUCKET + '"]';
const BUDGET_ICON_NEEDLE = 'Hl=di=>di==="Trip total"?"💵":di==="Flights"?"✈️":di==="Hotel"?"🧳":di==="Restaurants"?"🍽️":di==="Stores"?"🛍️":"🎟️"';
const BUDGET_ICON_PATCH = 'Hl=di=>di==="Trip total"?"💵":di==="Flights"?"✈️":di==="Hotel"?"🧳":di==="Cars"?"🚗":di==="Restaurants"?"🍽️":di==="Stores"?"🛍️":"🎟️"';
const BUDGET_EMPTY_NEEDLE = 'return!Xi&&!go&&!fr.length?null:';
const BUDGET_EMPTY_PATCH = 'return!fr.length?null:';
const TIMELINE_ICON_NEEDLE = 'n.jsx("div",{style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,marginTop:ua.isConflict?0:3.5,display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box"},children:Xr?n.jsx("img",{src:Xr,alt:"",loading:"lazy",style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,objectFit:"contain",display:"block",filter:"drop-shadow(0 1px 1px rgba(15,23,42,0.12))"}}):n.jsx("span",{style:{fontSize:ua.isConflict?14:17,lineHeight:1,transform:"translateY(0.5px)"},children:sr})})';
const TIMELINE_ICON_PATCH = 'n.jsx("div",{"data-ts-timeline-icon":"1","data-ts-category-tab-icon":"1","aria-hidden":"true",style:{width:16,height:16,marginTop:0,display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,boxSizing:"border-box",flex:"0 0 16px"},children:Xr?n.jsx("img",{"data-logo-src":Xr,src:Xr,alt:"",loading:"lazy",style:{width:16,height:16,maxWidth:"100%",maxHeight:"100%",objectFit:"contain",objectPosition:"center center",display:"block"}}):n.jsx("span",{"data-ts-tab-emoji":"1",style:{display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,width:16,height:16},children:n.jsx("canvas",{width:32,height:32,ref:function(el){tsPaintTabEmoji(el,sr)},style:{width:16,height:16,display:"block"}})})})';
const TIMELINE_TITLE_NEEDLE = 'n.jsx("button",{onClick:()=>Ne(Qt(ua.item)),style:{border:0,padding:0,background:"transparent",cursor:"pointer",fontSize:13,fontWeight:600,lineHeight:1.15,color:"#111827",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3,textAlign:"left"},children:Pn})';
const TIMELINE_TITLE_PATCH = 'n.jsx("button",{"data-ts-timeline-title":"1",onClick:()=>Ne(Qt(ua.item)),style:{border:0,padding:0,background:"transparent",cursor:"pointer",fontSize:13,fontWeight:600,lineHeight:"16px",height:16,display:"inline-flex",alignItems:"center",color:"#111827",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3,textAlign:"left"},children:Pn})';
const TIMELINE_TITLE_PAD_NEEDLE = 'style:ua.isConflict?{marginLeft:26,borderLeft:"3px solid #60a5fa",paddingLeft:12,background:"#eff6ff",borderRadius:10,paddingTop:6,paddingBottom:6,paddingRight:10}:{paddingTop:1}';
const TIMELINE_TITLE_PAD_PATCH = 'style:ua.isConflict?{marginLeft:26,borderLeft:"3px solid #60a5fa",paddingLeft:12,background:"#eff6ff",borderRadius:10,paddingTop:6,paddingBottom:6,paddingRight:10}:{paddingTop:0}';

const CAR_TIMELINE_CHECKBOX_NEEDLE = '!Mi(G)&&n.jsxs("label",{style:{display:"inline-flex",alignItems:"center",justifyContent:"flex-end",gap:5,fontSize:11,fontWeight:900,color:Ds(G)?"#0f766e":"#6b7280",whiteSpace:"nowrap"},children:[n.jsx("input",{type:"checkbox",disabled:!Ce,checked:Ds(G),onChange:zr=>lc(G,zr.target.checked)})," Timeline"]})]}),n.jsx("button",{"aria-label":"Open thing details"';
const CAR_TIMELINE_CHECKBOX_PATCH = 'n.jsxs("label",{style:{display:"inline-flex",alignItems:"center",justifyContent:"flex-end",gap:5,fontSize:11,fontWeight:900,color:Ds(G)?"#0f766e":"#6b7280",whiteSpace:"nowrap",flexShrink:0},children:[n.jsx("input",{type:"checkbox",disabled:!Ce,checked:Ds(G),onChange:zr=>lc(G,zr.target.checked)})," Timeline"]})]}),n.jsx("button",{"aria-label":"Open thing details"';
const CAR_LIST_ROW_GRID_NEEDLE = 'gridTemplateColumns:Mi(G)?"minmax(0, 1fr) 86px":"minmax(0, 1fr) 86px 86px",gap:12,alignItems:"center"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),kl(G),n.jsxs("label",{style:{display:"inline-flex"';
const CAR_LIST_ROW_GRID_PATCH = 'gridTemplateColumns:"minmax(0,1fr) auto auto",gap:8,alignItems:"center",minWidth:0,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),kl(G),n.jsxs("label",{style:{display:"inline-flex"';
const CAR_ROW_SHELL_NEEDLE = 'minWidth:0,overflow:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1},children:[n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto"';
const CAR_ROW_SHELL_PATCH = 'minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto"';
const CAR_ROW_ALT_SHELL_NEEDLE = 'minWidth:0,overflow:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),n.jsx("button",{"aria-label":"Open thing details"';
const CAR_ROW_ALT_SHELL_PATCH = 'minWidth:0,overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3},children:sr}),n.jsx("button",{"aria-label":"Open thing details"';
const CAR_TIMELINE_WRAP_ROW_NEEDLE = 'display:"flex",justifyContent:"flex-end",alignItems:"center",gap:12,marginTop:7,paddingTop:7,borderTop:"1px solid #f3f4f6",flexWrap:"wrap",minWidth:0},children:[kl(G),!Mi(G)&&n.jsxs("label",{style:{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:900,color:Ds(G)?"#0f766e":"#6b7280",whiteSpace:"nowrap"},children:[n.jsx("input",{type:"checkbox",disabled:!Ce,checked:Ds(G),onChange:zr=>lc(G,zr.target.checked)})," Timeline"]})]}),n.jsx(Nr,{items:Xr,scopeKey:Qt(G),compact:!0})]},`${It(G)}-${Qt(G)}-${ua}`)';
const CAR_TIMELINE_WRAP_ROW_PATCH = 'display:"flex",justifyContent:"flex-end",alignItems:"center",gap:8,marginTop:7,paddingTop:7,borderTop:"1px solid #f3f4f6",flexWrap:"nowrap",minWidth:0,maxWidth:"100%"},children:[kl(G),n.jsxs("label",{style:{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:900,color:Ds(G)?"#0f766e":"#6b7280",whiteSpace:"nowrap",flexShrink:0,marginLeft:"auto"},children:[n.jsx("input",{type:"checkbox",disabled:!Ce,checked:Ds(G),onChange:zr=>lc(G,zr.target.checked)})," Timeline"]})]}),n.jsx(Nr,{items:Xr,scopeKey:Qt(G),compact:!0})]},`${It(G)}-${Qt(G)}-${ua}`)';

const CAR_DAY_LOOP_NEEDLE = 'for(const wn of zt){if(!wn)continue;const Qi=xl(mr(wn)||wn.name||wn.description||"")||xl(wn.name||wn.description||"");if(Qi&&/flight/i.test(wn.name||"")){';
const CAR_DAY_LOOP_PATCH = 'for(const wn of zt){if(Mi(wn)&&Ds(wn)){const tsCarDays=Yi(wn).map(ua=>ve(ua)).filter(Boolean);if(tsCarDays.length){const tsCarStart=Math.min(...tsCarDays),tsCarEnd=Math.max(...tsCarDays);if(G.day_number===tsCarStart){const tsCarTm=Ui(wn,G.id)||Xi(wn)||"";tsCarTm&&ua.push({type:"place",time:tsCarTm,endTime:Ur(wn,G.id)||ri(tsCarTm,45),title:`Pickup: ${(ha(wn).rentalCompany||mr(wn))}`,item:wn,status:hs(wn)})}if(G.day_number===tsCarEnd&&tsCarEnd!==tsCarStart){const tsCarTm=Ui(wn,G.id)||Xi(wn)||"";tsCarTm&&ua.push({type:"place",time:tsCarTm,endTime:Ur(wn,G.id)||ri(tsCarTm,45),title:`Drop-off: ${(ha(wn).rentalCompany||mr(wn))}`,item:wn,status:hs(wn)})}}}if(!wn)continue;if(Mi(wn))continue;const Qi=xl(mr(wn)||wn.name||wn.description||"")||xl(wn.name||wn.description||"");if(Qi&&/flight/i.test(wn.name||"")){';

const FLIGHT_EU_NEEDLE = 'return[ua,Rn,Pn!=null&&Pn.start?Yo(Pn.start):"",Pn!=null&&Pn.end?Yo(Pn.end):""]},Qo=({item:G})=>';
const FLIGHT_EU_NEEDLE_TBD = 'return[ua,Rn,Pn!=null&&Pn.start?Yo(Pn.start):"Depart TBD",Pn!=null&&Pn.end?Yo(Pn.end):"Arrive TBD"]},Qo=({item:G})=>';
const FLIGHT_EU_PATCH = 'return[ua,(v=>{const fareLbl=(w=>w.includes("round")?"round trip":w.includes("one")?"one-way":"")(String(ha(G).fareDirection||ha(G).tripType||ha(G).pricingType||"").trim().toLowerCase());const price=Rn||String(bi(G)||"").trim();const amt=/^\\$/.test(String(price))?String(price):"$"+String(price).replace(/^\\$/,"");return fareLbl?`${amt} ${fareLbl}`.trim():amt})(),Pn!=null&&Pn.start?Yo(Pn.start):"",Pn!=null&&Pn.end?Yo(Pn.end):""]},Qo=({item:G})=>';
const FLIGHT_EU_FARE_AMT_NEEDLE = 'const price=Rn||String(bi(G)||"").trim();const amt=/^\\$/.test(price)?price:`$$${price}`;return fareLbl?`${amt} ${fareLbl}`.trim():amt})(),Pn!=null&&Pn.start?Yo(Pn.start):""';
const FLIGHT_EU_FARE_AMT_PATCH = 'const price=Rn||String(bi(G)||"").trim();const amt=/^\\$/.test(String(price))?String(price):"$"+String(price).replace(/^\\$/,"");return fareLbl?`${amt} ${fareLbl}`.trim():amt})(),Pn!=null&&Pn.start?Yo(Pn.start):""';
const FLIGHT_EU_AIRLINE_NEEDLE = 'ua=((Zn=Re.match(/^(JetBlue|United|Delta|American|Southwest)\u0008/i))==null?void 0:Zn[1])||Re.split(/\\s+/)[0]||"Airline"';
const FLIGHT_EU_AIRLINE_NEEDLE_ROW = 'ua=((Zn=Re.match(/^(JetBlue|United|Delta|American|Southwest)\u0008/i))==null?void 0:Zn[1])||Re||"Airline"';
const FLIGHT_EU_AIRLINE_PATCH = 'ua=((Zn=Re.match(/^(JetBlue|United|Delta|American|Southwest)\\b/i))==null?void 0:Zn[1])||Re||"Airline"';

export function applySharedLiveTabBundlePatches(patched = '', options = {}) {
  const served = options.served === true;
  let js = String(patched || '');
  if (js.includes(LIVE_TAB_NEEDLE)) js = js.replace(LIVE_TAB_NEEDLE, LIVE_TAB_PATCH);
  if (js.includes(QN_RENDER_NEEDLE)) js = js.replace(QN_RENDER_NEEDLE, QN_RENDER_PATCH);
  if (js.includes(GN_RENDER_NEEDLE)) js = js.replace(GN_RENDER_NEEDLE, GN_RENDER_PATCH);
  if (js.includes(KI_RENDER_NEEDLE)) js = js.replace(KI_RENDER_NEEDLE, KI_RENDER_PATCH);
  if (served) {
    if (!js.includes(HOTELS_TAB_CATALOG_NEEDLE)) {
      throw new Error('served shared Hotels tab missing vi(kn,"hotels") Oe row anchor');
    }
    if (js.includes(CARS_TAB_PLACEHOLDER_NEEDLE)) {
      js = js.replace(CARS_TAB_PLACEHOLDER_NEEDLE, CARS_TAB_SERVED_PATCH);
    } else if (!js.includes(CARS_TAB_SERVED_PATCH)) {
      throw new Error('served shared Cars tab missing vi(bc,"cars") Oe row anchor');
    }
    if (js.includes('tsSharedLiveTabListMount') || js.includes('data-shared-live-tab-mount')) {
      throw new Error('served shared bundle still mounts liveTabLists HTML');
    }
    if (js.includes('GBrain') || js.includes('Coming soon')) {
      throw new Error('served shared bundle still contains internal or placeholder customer copy');
    }
  }
  if (js.includes(QN_EMPTY_NEEDLE)) js = js.replace(QN_EMPTY_NEEDLE, QN_EMPTY_PATCH);
  if (js.includes(GN_EMPTY_NEEDLE)) js = js.replace(GN_EMPTY_NEEDLE, GN_EMPTY_PATCH);
  if (js.includes(KI_EMPTY_NEEDLE)) js = js.replace(KI_EMPTY_NEEDLE, KI_EMPTY_PATCH);
  js = patchSharedTabRowOverflow(js, { served });
  if (js.includes(TAB_MOBILE_MEDIA_NEEDLE)) js = js.replace(TAB_MOBILE_MEDIA_NEEDLE, TAB_MOBILE_MEDIA_PATCH);
  else if (served && !js.includes('(max-width: 759px)')) {
    throw new Error('shared tab mobile breakpoint patch did not apply');
  }
  if (js.includes(FLIGHT_QO_GRID_NEEDLE)) js = js.replace(FLIGHT_QO_GRID_NEEDLE, FLIGHT_QO_GRID_PATCH);
  else if (served && !js.includes('Qo=({item:G})=>{const parts=eu(G)')) {
    throw new Error('flight Qo price column patch did not apply');
  }
  if (js.includes(BUDGET_BUCKET_NEEDLE)) js = js.replace(BUDGET_BUCKET_NEEDLE, BUDGET_BUCKET_PATCH);
  if (js.includes(BUDGET_CATS_NEEDLE)) js = js.replace(BUDGET_CATS_NEEDLE, BUDGET_CATS_PATCH);
  if (js.includes(BUDGET_ICON_NEEDLE)) js = js.replace(BUDGET_ICON_NEEDLE, BUDGET_ICON_PATCH);
  if (js.includes(BUDGET_EMPTY_NEEDLE)) js = js.replace(BUDGET_EMPTY_NEEDLE, BUDGET_EMPTY_PATCH);
  if (js.includes(TIMELINE_ICON_NEEDLE)) js = js.replace(TIMELINE_ICON_NEEDLE, TIMELINE_ICON_PATCH);
  if (js.includes(TIMELINE_TITLE_NEEDLE)) js = js.replace(TIMELINE_TITLE_NEEDLE, TIMELINE_TITLE_PATCH);
  if (js.includes(TIMELINE_TITLE_PAD_NEEDLE)) js = js.replace(TIMELINE_TITLE_PAD_NEEDLE, TIMELINE_TITLE_PAD_PATCH);
  if (js.includes(CAR_TIMELINE_CHECKBOX_NEEDLE)) {
    js = js.replace(CAR_TIMELINE_CHECKBOX_NEEDLE, CAR_TIMELINE_CHECKBOX_PATCH);
  } else if (served && !js.includes('checked:Ds(G),onChange:zr=>lc(G,zr.target.checked)})," Timeline"]})]}),n.jsx("button",{"aria-label":"Open thing details"')) {
    throw new Error('car timeline checkbox patch did not apply');
  }
  if (js.includes(CAR_LIST_ROW_GRID_NEEDLE)) {
    js = js.replace(CAR_LIST_ROW_GRID_NEEDLE, CAR_LIST_ROW_GRID_PATCH);
  } else if (served && !js.includes('gridTemplateColumns:"minmax(0,1fr) auto auto"')) {
    throw new Error('car list row grid patch did not apply');
  }
  if (js.includes(CAR_ROW_SHELL_NEEDLE)) {
    js = js.replace(CAR_ROW_SHELL_NEEDLE, CAR_ROW_SHELL_PATCH);
  } else if (served && !js.includes('overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"}')) {
    throw new Error('car list row shell overflow patch did not apply');
  }
  if (js.includes(CAR_ROW_ALT_SHELL_NEEDLE)) {
    js = js.replace(CAR_ROW_ALT_SHELL_NEEDLE, CAR_ROW_ALT_SHELL_PATCH);
  } else if (served && !js.includes('overflowX:"clip",overflowY:"visible",position:"relative",zIndex:xt===Qt(G)?1e3:1,maxWidth:"100%"},children:[n.jsx("button",{"aria-label":"Open thing details",onClick:()=>Ne(Qt(G)),style:{border:0,padding:0,background:"transparent",textAlign:"left",cursor:"pointer",color:"#111827",fontSize:bn(G)||Mi(G)?11:13,fontWeight:800,width:"100%",minWidth:0,overflow:"hidden"')) {
    throw new Error('car list compact row shell overflow patch did not apply');
  }
  if (js.includes(CAR_TIMELINE_WRAP_ROW_NEEDLE)) {
    js = js.replace(CAR_TIMELINE_WRAP_ROW_NEEDLE, CAR_TIMELINE_WRAP_ROW_PATCH);
  } else if (served && !js.includes('flexWrap:"nowrap",minWidth:0,maxWidth:"100%"},children:[kl(G),n.jsxs("label",{style:{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:900,color:Ds(G)?"#0f766e":"#6b7280",whiteSpace:"nowrap",flexShrink:0,marginLeft:"auto"}')) {
    throw new Error('car timeline wrap row patch did not apply');
  }
  if (js.includes(CAR_DAY_LOOP_NEEDLE)) js = js.replace(CAR_DAY_LOOP_NEEDLE, CAR_DAY_LOOP_PATCH);
  else if (served && !js.includes('Pickup: ${(ha(wn).rentalCompany||mr(wn))}')) {
    throw new Error('car pickup/drop-off day timeline patch did not apply');
  }
  js = patchSharedLayoutOverflow(js, { served });
  const FLIGHT_EU_NEEDLE_BAD = 'return[(v=>{const fareLbl=(w=>w.includes("round")?"round trip":w.includes("one")?"one-way":"")';
  if (js.includes(FLIGHT_EU_AIRLINE_NEEDLE)) {
    js = js.replace(FLIGHT_EU_AIRLINE_NEEDLE, FLIGHT_EU_AIRLINE_PATCH);
  } else if (js.includes(FLIGHT_EU_AIRLINE_NEEDLE_ROW)) {
    js = js.replace(FLIGHT_EU_AIRLINE_NEEDLE_ROW, FLIGHT_EU_AIRLINE_PATCH);
  } else if (served && js.includes('Southwest)\u0008/i')) {
    throw new Error('flight airline regex patch did not apply');
  }
  if (js.includes(FLIGHT_EU_FARE_AMT_NEEDLE)) {
    js = js.replace(FLIGHT_EU_FARE_AMT_NEEDLE, FLIGHT_EU_FARE_AMT_PATCH);
  } else if (served && js.includes('const price=Rn||String(bi(G)||"").trim();return fareLbl') && !js.includes('const amt=/^\\$/.test(price)')) {
    throw new Error('flight fare dollar patch did not apply');
  }
  if (js.includes(FLIGHT_EU_NEEDLE)) js = js.replace(FLIGHT_EU_NEEDLE, FLIGHT_EU_PATCH);
  else if (js.includes(FLIGHT_EU_NEEDLE_TBD)) js = js.replace(FLIGHT_EU_NEEDLE_TBD, FLIGHT_EU_PATCH);
  else if (js.includes(FLIGHT_EU_NEEDLE_BAD)) {
    js = js.replace(/return\[\(v=>[\s\S]*?\}\)\(\),ua,Pn!=null&&Pn\.start\?Yo\(Pn\.start\):"",Pn!=null&&Pn\.end\?Yo\(Pn\.end\):""\]\},Qo=\(\{item:G\}\)=>/, FLIGHT_EU_PATCH);
  } else if (served && !js.includes('return[ua,(v=>{const fareLbl')) {
    throw new Error('flight fare direction row patch did not apply');
  }
  if (js.includes('children:di.hasPrice?Re(di.amount):"Add price"') && !js.includes('Xi==="car"?"Cars"')) {
    throw new Error('shared budget category patch did not apply');
  }
  if (js.includes(TIMELINE_ICON_NEEDLE)) {
    throw new Error('timeline logo and icon patch did not apply');
  }
  if (js.includes('tsListColumnSort({listKey:G')) {
    throw new Error('served shared bundle must use original Wr Name/Price sort pills');
  }
  js = patchSharedTripOeListRows(js);
  if (served) {
    if (!js.includes('data-shared-live-tab":"hotels"') || !js.includes('data-shared-live-tab":"cars"')) {
      throw new Error('served shared Hotels/Cars tab panels missing data-shared-live-tab anchor');
    }
    if (!js.includes('"data-list-row":"1","data-has-logo":tsRowHasLogo')) {
      throw new Error('served shared Oe() rows missing Gate B list row markers');
    }
  }
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
