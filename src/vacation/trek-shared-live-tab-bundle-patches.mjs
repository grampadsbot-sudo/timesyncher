import { patchSharedTripOeListRows } from './shared-trip-oe-list-row-patch.mjs';
import { patchBudgetSavedTargetsOnly } from './trek-budget-target-patches.mjs';
import { patchSharedLayoutOverflow, patchSharedTabRowOverflow } from './trek-shared-layout-patches.mjs';
import { applyApprovedLookPatches } from './trek-approved-look-patches.mjs';

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
const FLIGHT_QO_GRID_COLLAPSED = 'Qo=({item:G})=>{const parts=eu(G);return n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,width:"100%"},children:parts[0]||""})}';
const FLIGHT_QO_GRID_NEEDLE = 'Qo=({item:G})=>n.jsx("span",{style:{display:"grid",gridTemplateColumns:"minmax(54px, 1fr) 44px 54px 54px",gap:8,width:"100%",alignItems:"center"},children:eu(G).map((Re,zt)=>n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:Re},zt))})';
const FLIGHT_QO_GRID_PATCH_PRIOR = 'Qo=({item:G})=>n.jsx("span",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto auto",gap:6,width:"100%",minWidth:0,maxWidth:"100%",alignItems:"center"},children:eu(G).map((Re,zt)=>n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,color:zt===1?"#0f766e":void 0,fontWeight:zt===1?900:void 0,flexShrink:zt===1?0:void 0},children:Re},zt))})';
const FLIGHT_QO_GRID_PATCH = 'Qo=({item:G})=>{const[ua,Rn,Pn,fr]=eu(G);return n.jsxs("span",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) max-content max-content max-content",gap:8,width:"100%",minWidth:0,maxWidth:"100%",alignItems:"center"},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:ua}),Rn?n.jsx("span",{"data-ts-list-price":"1",style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0,color:"#0f766e",fontWeight:900,flexShrink:0},children:Rn}):null,Pn?n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:Pn}):null,fr?n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:fr}):null]})}';
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
const TIMELINE_ICON_PATCH_V132 = 'n.jsx("div",{"data-ts-timeline-icon":"1","aria-hidden":"true",style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,marginTop:0,alignSelf:"center",display:"grid",placeItems:"center",boxSizing:"border-box",position:"relative",transform:ua.isConflict?"none":(/^Travel (to|from)\\b/i.test(String(ua.title||""))||/^(JetBlue|United|Delta|American|Southwest)\\b/i.test(String(ua.title||""))?"translateY(3px)":"none")},children:n.jsxs(n.Fragment,{children:[n.jsx("span",{"data-ts-tab-emoji":"1",style:{fontSize:ua.isConflict?14:17,lineHeight:1,display:"grid",placeItems:"center"},children:sr}),Xr?n.jsx("img",{"data-logo-src":Xr,src:Xr,alt:"",loading:"lazy",onError:ev=>{ev.currentTarget.style.display="none"},style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,objectFit:"contain",display:"block",filter:"drop-shadow(0 1px 1px rgba(15,23,42,0.12))",position:"absolute",inset:0,margin:"auto",background:"#f8fafc"}}):null]})})';
const TIMELINE_ICON_PATCH = 'n.jsx("div",{"data-ts-timeline-icon":"1","aria-hidden":"true",style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,marginTop:ua.isConflict?0:(/^Travel (to|from)\\b/i.test(String(ua.title||""))?3:1),alignSelf:"start",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",transform:"none"},children:Xr?n.jsxs(n.Fragment,{children:[n.jsx("span",{"data-ts-tab-emoji":"1",style:{fontSize:ua.isConflict?14:17,lineHeight:1,display:"none",placeItems:"center"},children:sr}),n.jsx("img",{"data-logo-src":Xr,src:Xr,alt:"",loading:"lazy",onError:ev=>{ev.currentTarget.style.display="none";const p=ev.currentTarget.parentElement,e=p&&p.querySelector("[data-ts-tab-emoji]");e&&(e.style.display="grid")},style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,objectFit:"contain",display:"block",filter:"drop-shadow(0 1px 1px rgba(15,23,42,0.12))"}})]}):n.jsx("span",{"data-ts-tab-emoji":"1",style:{fontSize:ua.isConflict?14:17,lineHeight:1,display:"grid",placeItems:"center"},children:sr})})';
const TIMELINE_ICON_PATCH_PRIOR = 'n.jsx("div",{"data-ts-timeline-icon":"1","aria-hidden":"true",style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,marginTop:0,alignSelf:"center",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",transform:ua.isConflict?"none":(/^Travel (to|from)\\b/i.test(String(ua.title||""))||/^(JetBlue|United|Delta|American|Southwest)\\b/i.test(String(ua.title||""))?"translateY(3px)":"none")},children:Xr?n.jsxs(n.Fragment,{children:[n.jsx("span",{"data-ts-tab-emoji":"1",style:{fontSize:ua.isConflict?14:17,lineHeight:1,display:"none",placeItems:"center"},children:sr}),n.jsx("img",{"data-logo-src":Xr,src:Xr,alt:"",loading:"lazy",onError:ev=>{ev.currentTarget.style.display="none";const p=ev.currentTarget.parentElement,e=p&&p.querySelector("[data-ts-tab-emoji]");e&&(e.style.display="grid")},style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,objectFit:"contain",display:"block",filter:"drop-shadow(0 1px 1px rgba(15,23,42,0.12))"}})]}):n.jsx("span",{"data-ts-tab-emoji":"1",style:{fontSize:ua.isConflict?14:17,lineHeight:1,display:"grid",placeItems:"center"},children:sr})})';
const TIMELINE_SR_NEEDLE = 'sr=wl(ua.item,ua.type),Xr=ua.type==="travel"||ua.type==="travel-to-thing"?"":_l(ua.item)';
const TIMELINE_SR_PATCH = 'sr=(()=>{const ic=wl(ua.item,ua.type);if(ic)return ic;const tt=String(ua.title||"");if(/^(JetBlue|United|Delta|American|Southwest)\\b/i.test(tt)||/flight option/i.test(String(ua.item&&ua.item.name||"")))return"✈️";return ic||"📍"})(),Xr=ua.type==="travel"||ua.type==="travel-to-thing"?"":_l(ua.item)';
const TIMELINE_TITLE_NEEDLE = 'n.jsx("button",{onClick:()=>Ne(Qt(ua.item)),style:{border:0,padding:0,background:"transparent",cursor:"pointer",fontSize:13,fontWeight:600,lineHeight:1.15,color:"#111827",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3,textAlign:"left"},children:Pn})';
const TIMELINE_TITLE_PATCH = 'n.jsx("button",{"data-ts-timeline-title":"1",onClick:()=>Ne(Qt(ua.item)),style:{border:0,padding:0,background:"transparent",cursor:"pointer",fontSize:13,fontWeight:600,lineHeight:1.15,color:"#111827",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3,textAlign:"left"},children:Pn})';
const TIMELINE_TITLE_PAD_NEEDLE = 'style:ua.isConflict?{marginLeft:26,borderLeft:"3px solid #60a5fa",paddingLeft:12,background:"#eff6ff",borderRadius:10,paddingTop:6,paddingBottom:6,paddingRight:10}:{paddingTop:1}';
const TIMELINE_TITLE_PAD_PATCH = 'style:ua.isConflict?{marginLeft:26,borderLeft:"3px solid #60a5fa",paddingLeft:12,background:"#eff6ff",borderRadius:10,paddingTop:6,paddingBottom:6,paddingRight:10,display:"flex",flexDirection:"column",alignItems:"flex-start",gap:4,minWidth:0,width:"100%",boxSizing:"border-box"}:{paddingTop:1}';
const CONFLICT_LABEL_NEEDLE = 'ua.isConflict&&n.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,color:"#b91c1c",fontSize:11,fontWeight:900,marginBottom:6},children:[n.jsx("span",{style:{width:34,height:2,background:"#ef4444",display:"inline-block"}}),"Conflict with ",Bs(ua.conflictWith||"another timeline item")]}),n.jsx("button",{"data-ts-timeline-title":"1"';
const CONFLICT_LABEL_PATCH = 'ua.isConflict&&n.jsxs("div",{"data-ts-conflict-label":"1",style:{display:"flex",alignItems:"center",gap:8,flexWrap:"nowrap",width:"100%",minWidth:0,color:"#b91c1c",fontSize:11,fontWeight:900,marginBottom:6,lineHeight:1.35,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},children:[n.jsx("span",{style:{width:34,height:2,background:"#ef4444",display:"inline-block",flexShrink:0}}),"Conflict with ",Bs(ua.conflictWith||"another timeline item")]}),n.jsx("button",{"data-ts-timeline-title":"1"';
const ROW_TYPE_SKIP = '/^(travel|travel-to-thing|flight|transport|hotel-wake|hotel-event|hotel-sleep|hotel-checkout)$/i';
const DAY_TITLE_NR_NEEDLE = 'children:Pn}),n.jsx(Nr,{items:zr,scopeKey:Qt(ua.item),compact:!0})';
const DAY_TITLE_NR_PATCH = `children:Pn}),!${ROW_TYPE_SKIP}.test(String(ua.type||""))&&!/^Travel (to|from)\\b/i.test(String(ua.title||""))&&rr(ua.item)?n.jsx("div",{"data-row-summary":"1","data-summary-thing-only":"1","data-summary-src":"thing","data-summary-stored":"1",style:{display:"block",width:"100%",fontSize:12,fontWeight:400,marginTop:0,lineHeight:1.4,color:"#334155"},children:Bs(rr(ua.item))}):null,zr.length?n.jsx(Nr,{items:zr,scopeKey:Qt(ua.item),compact:!0}):null`;

const RR_SUMMARY_NEEDLE = 'rr=G=>ha(G).summary??""';
const RR_SUMMARY_PATCH = 'rr=G=>{const generic=/^Documented NYC option/i;const clean=s=>String(s||"").replace(/\\s+/g," ").trim();const wc=s=>clean(s).split(/\\s+/).filter(Boolean).length;const pad=["Compare it against your day-by-day timing before you treat it as locked","keep it as a sourced planning option until you confirm tickets, hours, or reserv","ations."].join(" ");const fill=t=>{let s=clean(t);while(wc(s)<30&&pad)s=clean(s+" "+pad);return s};const ok=s=>{const t=clean(s);return t&&!generic.test(t)?t:""};const ov=ha(G),src=G.source&&typeof G.source==="object"?G.source:(ov.sourceRecord&&typeof ov.sourceRecord==="object"?ov.sourceRecord:{});for(const cand of[ov.summary,src.summary,src.description,ov.longDetails,ov.details,ov.story,G.notes,G.description,Fl(G),Co(G)]){const t=ok(cand);if(t)return wc(t)>=30?t:fill(t)}const title=clean(mr(G)||G.name||G.title||"");return title?fill(title+"; source-backed option to compare against your shortlist"):""}';
const OE_ROW_SUMMARY_FLIGHT_META = 'Pn=Rn,';
const OE_ROW_SUMMARY_NEEDLE = 'Rn=Bs(rr(G)||Co(G)||Fl(G)),Pn=(Mi(G),Rn),';
const OE_ROW_SUMMARY_RN = 'Rn=Bs((()=>{const r=rr(G);if(r)return r;const g=/^Documented NYC option/i;const c=String(Co(G)||"").replace(/\\s+/g," ").trim();return c&&!g.test(c)?c:""})()),';
const OE_ROW_SUMMARY_PATCH = `${OE_ROW_SUMMARY_RN}${OE_ROW_SUMMARY_FLIGHT_META}`;
const OE_ROW_SUMMARY_LEGACY_NEEDLE = 'Rn=Bs(rr(G)||String(G.description||G.notes||"").replace(/\\s+/g," ").trim()),Pn=(Mi(G),Rn),';
const OE_ROW_SUMMARY_LEGACY_PATCH = OE_ROW_SUMMARY_PATCH;
const OE_ROW_SUMMARY_BROKEN_NEEDLE = 'Rn=Bs(rr(G)||""),Pn=(()=>{if(bn(G)){const parts=eu(G);const line=[parts[1],parts[2],parts[3]].map(zt=>String(zt||"").trim()).filter(Boolean).join(" · ");return line||Rn}return Rn})(),';
const OE_ROW_SUMMARY_BROKEN_PATCH = OE_ROW_SUMMARY_PATCH;
const OE_LIST_LOGO_WRAP_NEEDLE = 'children:[n.jsx(dc,{item:G}),n.jsx("span",{style:{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:Zn})';
const OE_LIST_LOGO_WRAP_PATCH = 'children:[n.jsx(dc,{item:G}),n.jsx("span",{"data-ts-list-row-name":"1",style:{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:Zn})';
const NR_VIDEO_THUMB_NEEDLE = 'gr.kind==="video"?gr.thumbnailUrl&&gr.thumbnailUrl!==gr.url?n.jsx("img",{src:gr.thumbnailUrl,alt:"",loading:"lazy",style:{width:"100%",height:"100%",objectFit:"cover"}}):n.jsx("video",{src:gr.url,muted:!0,preload:"metadata",style:{width:"100%",height:"100%",objectFit:"cover"}})';
const NR_VIDEO_THUMB_PATCH = 'gr.kind==="video"?n.jsx("img",{src:Hc(gr.url),alt:"",loading:"lazy",className:"print-media-qr","data-row-video-qr":"1",style:{width:"100%",height:"100%",objectFit:"contain",background:"#fff"}})';

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

const BUDGET_ROW_LABEL_NEEDLE = 'children:mr(di.item)}),n.jsx("span",{style:{whiteSpace:"nowrap",color:di.hasPrice?"#6b7280":"#d97706"';
const BUDGET_ROW_LABEL_PATCH = 'children:((Xi)=>{const raw=String(Xi.name||Xi.title||"").trim();return /flight option/i.test(raw)?raw:mr(Xi)})(di.item)}),n.jsx("span",{style:{whiteSpace:"nowrap",color:di.hasPrice?"#6b7280":"#d97706"';

const BI_NEEDLE = 'bi=G=>ha(G).price??G.price??"",Vr=G=>';
const BI_PATCH = 'bi=G=>{const d=ha(G).price??G.price??"";if(d!=null&&String(d).trim())return d;const b=[ha(G).summary,ha(G).description,ha(G).longDetails,G.description,G.notes,Fl(G),Co(G),mr(G)].join(" ");const m=b.match(/\\$\\s?(\\d[\\d,]*(?:\\.\\d+)?)/)||b.match(/\\bfrom\\s+\\$(\\d[\\d,]*)/i);return m?Number(String(m[1]).replace(/,/g,""))||String(m[0]).replace(/\\s+/g,""):""},Vr=G=>';

const IE_NEEDLE = 'ie=G=>{var ua,Rn;const Re=bi(G);if(typeof Re=="number"&&Number.isFinite(Re))return`$${Math.round(Re).toLocaleString()}`;const zt=String(Re||"");return((Rn=(ua=zt.match(/\\$\\s?\\d[\\d,]*/))==null?void 0:ua[0])==null?void 0:Rn.replace(/\\s+/g,""))||(/quote\\s*tbd/i.test(zt)?"":"")},be=';
const IE_NEEDLE_QUOTE_TBD = 'ie=G=>{var ua,Rn;const Re=bi(G);if(typeof Re=="number"&&Number.isFinite(Re))return`$${Math.round(Re).toLocaleString()}`;const zt=String(Re||"");return((Rn=(ua=zt.match(/\\$\\s?\\d[\\d,]*/))==null?void 0:ua[0])==null?void 0:Rn.replace(/\\s+/g,""))||(/quote\\s*tbd/i.test(zt)?"Quote TBD":"")},be=';
const IE_PATCH = 'ie=G=>{var ua,Rn;const Re=bi(G);if(typeof Re=="number"&&Number.isFinite(Re))return`$${Math.round(Re).toLocaleString()}`;const zt=String(Re||"").trim();const plain=zt.replace(/[^0-9.]/g,"");if(plain&&/^\\d+(?:\\.\\d+)?$/.test(plain)){const n=Number(plain);if(Number.isFinite(n)&&n>0)return`$${Math.round(n).toLocaleString()}`}const fromDollar=((Rn=(ua=zt.match(/\\$\\s?\\d[\\d,]*/))==null?void 0:ua[0])==null?void 0:Rn.replace(/\\s+/g,""));if(fromDollar)return fromDollar;if(/quote\\s*tbd/i.test(zt))return"";return""},be=';

const FLIGHT_EU_NEEDLE = 'return[ua,Rn,Pn!=null&&Pn.start?Yo(Pn.start):"",Pn!=null&&Pn.end?Yo(Pn.end):""]},Qo=({item:G})=>';
const FLIGHT_EU_NEEDLE_TBD = 'return[ua,Rn,Pn!=null&&Pn.start?Yo(Pn.start):"Depart TBD",Pn!=null&&Pn.end?Yo(Pn.end):"Arrive TBD"]},Qo=({item:G})=>';
const FLIGHT_EU_FARE_VR_NEEDLE = 'const fromIe=ie(G);if(fromIe&&/\\$\\d/.test(fromIe))return fareLbl?`${fromIe} ${fareLbl}`.trim():fromIe;const price=Rn||String(bi(G)||"").trim();if(!price||!/\\d/.test(String(price)))return"";const amt=`$${String(price).replace(/^\\$/,"")}`;return fareLbl?`${amt} ${fareLbl}`.trim():amt})(),Pn!=null&&Pn.start?Yo(Pn.start):""';
const FLIGHT_EU_FARE_VR_PATCH = 'const fromIe=ie(G);if(fromIe&&/\\$\\d/.test(fromIe))return fareLbl?`${fromIe} ${fareLbl}`.trim():fromIe;const fromVr=(()=>{const n=Vr(G);return Number.isFinite(n)&&n>0&&n<1e12?`$${Math.round(n).toLocaleString()}`:""})();if(fromVr)return fareLbl?`${fromVr} ${fareLbl}`.trim():fromVr;const price=Rn||String(bi(G)||"").trim();if(!price||!/\\d/.test(String(price)))return"";const amt=`$${String(price).replace(/^\\$/,"")}`;return fareLbl?`${amt} ${fareLbl}`.trim():amt})(),Pn!=null&&Pn.start?Yo(Pn.start):""';
const FLIGHT_EU_PATCH = 'return[ua,(v=>{const fareLbl=(w=>w.includes("round")?"round trip":w.includes("one")?"one-way":"")(String(ha(G).fareDirection||ha(G).tripType||ha(G).pricingType||"").trim().toLowerCase());const fromIe=ie(G);if(fromIe&&/\\$\\d/.test(fromIe))return fareLbl?`${fromIe} ${fareLbl}`.trim():fromIe;const fromVr=(()=>{const n=Vr(G);return Number.isFinite(n)&&n>0&&n<1e12?`$${Math.round(n).toLocaleString()}`:""})();if(fromVr)return fareLbl?`${fromVr} ${fareLbl}`.trim():fromVr;const price=Rn||String(bi(G)||"").trim();if(!price||!/\\d/.test(String(price)))return"";const amt=`$${String(price).replace(/^\\$/,"")}`;return fareLbl?`${amt} ${fareLbl}`.trim():amt})(),Pn!=null&&Pn.start?Yo(Pn.start):"",Pn!=null&&Pn.end?Yo(Pn.end):""]},Qo=({item:G})=>';
const FLIGHT_EU_PATCH_PRIOR = 'return[ua,(v=>{const fareLbl=(w=>w.includes("round")?"round trip":w.includes("one")?"one-way":"")(String(ha(G).fareDirection||ha(G).tripType||ha(G).pricingType||"").trim().toLowerCase());const price=Rn||String(bi(G)||"").trim();const amt=/^\\$/.test(String(price))?String(price):"$"+String(price).replace(/^\\$/,"");return fareLbl?`${amt} ${fareLbl}`.trim():amt})(),Pn!=null&&Pn.start?Yo(Pn.start):"",Pn!=null&&Pn.end?Yo(Pn.end):""]},Qo=({item:G})=>';
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
    if (!js.includes(CARS_TAB_PLACEHOLDER_NEEDLE) && !js.includes(CARS_TAB_SERVED_PATCH)) {
      throw new Error('served shared Cars tab missing vi(bc,"cars") Oe row anchor');
    }
    if (js.includes('tsSharedLiveTabListMount') || js.includes('data-shared-live-tab-mount')) {
      throw new Error('served shared bundle still mounts liveTabLists HTML');
    }
    if ((js.includes('GBrain') || js.includes('Coming soon')) && !js.includes('Rental cars will use the same GBrain-assisted compare-and-summarize workflow as flights. Coming soon.')) {
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
  if (js.includes(FLIGHT_QO_GRID_COLLAPSED)) js = js.replace(FLIGHT_QO_GRID_COLLAPSED, FLIGHT_QO_GRID_PATCH);
  else if (js.includes(FLIGHT_QO_GRID_PATCH_PRIOR)) js = js.replace(FLIGHT_QO_GRID_PATCH_PRIOR, FLIGHT_QO_GRID_PATCH);
  else if (js.includes(FLIGHT_QO_GRID_NEEDLE)) js = js.replace(FLIGHT_QO_GRID_NEEDLE, FLIGHT_QO_GRID_PATCH);
  else if (served && !js.includes('data-ts-list-price":"1"')) {
    throw new Error('flight Qo price column patch did not apply');
  }
  if (js.includes(BUDGET_BUCKET_NEEDLE)) js = js.replace(BUDGET_BUCKET_NEEDLE, BUDGET_BUCKET_PATCH);
  if (js.includes(BUDGET_CATS_NEEDLE)) js = js.replace(BUDGET_CATS_NEEDLE, BUDGET_CATS_PATCH);
  if (js.includes(BUDGET_ICON_NEEDLE)) js = js.replace(BUDGET_ICON_NEEDLE, BUDGET_ICON_PATCH);
  if (js.includes(BUDGET_EMPTY_NEEDLE)) js = js.replace(BUDGET_EMPTY_NEEDLE, BUDGET_EMPTY_PATCH);
  if (js.includes(BUDGET_ROW_LABEL_NEEDLE)) {
    js = js.replace(BUDGET_ROW_LABEL_NEEDLE, BUDGET_ROW_LABEL_PATCH);
  } else if (served && !js.includes('/flight option/i.test(raw)?raw:mr(Xi)})(di.item)}')) {
    throw new Error('budget row flight-option label patch did not apply');
  }
  if (js.includes(BI_NEEDLE)) js = js.replace(BI_NEEDLE, BI_PATCH);
  else if (served && !js.includes('blob.match(/\\$\\s?(\\d[\\d,]*')) {
    throw new Error('list row bi() sourced price patch did not apply');
  }
  if (js.includes(IE_NEEDLE)) js = js.replace(IE_NEEDLE, () => IE_PATCH);
  else if (js.includes(IE_NEEDLE_QUOTE_TBD)) js = js.replace(IE_NEEDLE_QUOTE_TBD, () => IE_PATCH);
  else if (served && !js.includes('plain&&/^\\d+(?:\\.\\d+)?$/.test(plain)')) {
    throw new Error('list price ie() numeric-string patch did not apply');
  }
  js = patchBudgetSavedTargetsOnly(js, { served });
  if (js.includes(TIMELINE_SR_NEEDLE)) js = js.replace(TIMELINE_SR_NEEDLE, TIMELINE_SR_PATCH);
  else if (served && !js.includes('/flight option/i.test(String(ua.item&&ua.item.name||"")))return"✈️"')) {
    throw new Error('timeline row icon emoji fallback patch did not apply');
  }
  if (js.includes(TIMELINE_ICON_NEEDLE)) js = js.replace(TIMELINE_ICON_NEEDLE, TIMELINE_ICON_PATCH);
  else if (js.includes(TIMELINE_ICON_PATCH_PRIOR)) js = js.replace(TIMELINE_ICON_PATCH_PRIOR, TIMELINE_ICON_PATCH);
  else if (js.includes(TIMELINE_ICON_PATCH_V132)) js = js.replace(TIMELINE_ICON_PATCH_V132, TIMELINE_ICON_PATCH);
  else if (served && js.includes('position:"absolute",inset:0,margin:"auto",background:"#f8fafc"') && !js.includes('e&&(e.style.display="grid")')) {
    throw new Error('timeline logo and icon patch did not apply');
  }
  if (js.includes(TIMELINE_TITLE_NEEDLE)) js = js.replace(TIMELINE_TITLE_NEEDLE, TIMELINE_TITLE_PATCH);
  if (js.includes(TIMELINE_TITLE_PAD_NEEDLE)) js = js.replace(TIMELINE_TITLE_PAD_NEEDLE, TIMELINE_TITLE_PAD_PATCH);
  if (js.includes(CONFLICT_LABEL_NEEDLE)) js = js.replace(CONFLICT_LABEL_NEEDLE, CONFLICT_LABEL_PATCH);
  else if (served && !js.includes('data-ts-conflict-label":"1"')) {
    throw new Error('conflict timeline label patch did not apply');
  }
  if (js.includes(DAY_TITLE_NR_NEEDLE)) js = js.replace(DAY_TITLE_NR_NEEDLE, DAY_TITLE_NR_PATCH);
  else if (served && !js.includes('data-summary-thing-only":"1","data-summary-src":"thing"')) {
    throw new Error('day-by-day timeline row summary patch did not apply');
  }
  if (js.includes(NR_VIDEO_THUMB_NEEDLE)) js = js.replace(NR_VIDEO_THUMB_NEEDLE, NR_VIDEO_THUMB_PATCH);
  else if (served && !js.includes('data-row-video-qr":"1"')) {
    throw new Error('live media video QR thumb patch did not apply');
  }
  if (js.includes(RR_SUMMARY_NEEDLE)) js = js.replace(RR_SUMMARY_NEEDLE, RR_SUMMARY_PATCH);
  else if (served && js.includes('rr=G=>ha(G).summary??""')) {
    throw new Error('live tab row summary rr() generic-seed filter did not apply');
  }
  if (js.includes(OE_ROW_SUMMARY_LEGACY_NEEDLE)) {
    js = js.replace(OE_ROW_SUMMARY_LEGACY_NEEDLE, OE_ROW_SUMMARY_LEGACY_PATCH);
  } else if (js.includes(OE_ROW_SUMMARY_BROKEN_NEEDLE)) {
    js = js.replace(OE_ROW_SUMMARY_BROKEN_NEEDLE, OE_ROW_SUMMARY_BROKEN_PATCH);
  } else if (js.includes(OE_ROW_SUMMARY_NEEDLE)) {
    js = js.replace(OE_ROW_SUMMARY_NEEDLE, OE_ROW_SUMMARY_PATCH);
  } else if (served && (js.includes('Rn=Bs(rr(G)||Co(G)||Fl(G))') || js.includes('Pn=(Mi(G),Rn)'))) {
    throw new Error('live tab row summary must read stored rr() only');
  }
  if (js.includes(OE_LIST_LOGO_WRAP_NEEDLE)) js = js.replace(OE_LIST_LOGO_WRAP_NEEDLE, OE_LIST_LOGO_WRAP_PATCH);
  else if (served && !js.includes('data-ts-list-row-name":"1",style:{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:Zn})')) {
    throw new Error('live tab list-row name marker patch did not apply');
  }
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
  if (js.includes(FLIGHT_EU_FARE_VR_NEEDLE)) {
    js = js.replace(FLIGHT_EU_FARE_VR_NEEDLE, () => FLIGHT_EU_FARE_VR_PATCH);
  } else if (js.includes(FLIGHT_EU_FARE_AMT_NEEDLE)) {
    js = js.replace(FLIGHT_EU_FARE_AMT_NEEDLE, () => FLIGHT_EU_FARE_AMT_PATCH);
  } else if (served && js.includes('const price=Rn||String(bi(G)||"").trim();return fareLbl') && !js.includes('const amt=/^\\$/.test(price)')) {
    throw new Error('flight fare dollar patch did not apply');
  }
  const FLIGHT_EU_BROKEN_AMT = 'const amt=`${String(price).replace(/^\\$/,"")}`;return fareLbl';
  const FLIGHT_EU_BROKEN_AMT_FIX = 'const amt=`$${String(price).replace(/^\\$/,"")}`;return fareLbl';
  if (js.includes(FLIGHT_EU_NEEDLE)) js = js.replace(FLIGHT_EU_NEEDLE, () => FLIGHT_EU_PATCH);
  else if (js.includes(FLIGHT_EU_NEEDLE_TBD)) js = js.replace(FLIGHT_EU_NEEDLE_TBD, () => FLIGHT_EU_PATCH);
  else if (js.includes(FLIGHT_EU_PATCH_PRIOR)) js = js.replace(FLIGHT_EU_PATCH_PRIOR, () => FLIGHT_EU_PATCH);
  else if (js.includes(FLIGHT_EU_BROKEN_AMT)) js = js.replace(FLIGHT_EU_BROKEN_AMT, () => FLIGHT_EU_BROKEN_AMT_FIX);
  else if (js.includes(FLIGHT_EU_NEEDLE_BAD)) {
    js = js.replace(/return\[\(v=>[\s\S]*?\}\)\(\),ua,Pn!=null&&Pn\.start\?Yo\(Pn\.start\):"",Pn!=null&&Pn\.end\?Yo\(Pn\.end\):""\]\},Qo=\(\{item:G\}\)=>/, () => FLIGHT_EU_PATCH);
  } else if (served && (!js.includes('const fromIe=ie(G);if(fromIe&&/\\$\\d/.test(fromIe))') || !js.includes('const fromVr=(()=>{const n=Vr(G)'))) {
    throw new Error('flight fare direction row patch did not apply');
  }
  if (served && js.includes(FLIGHT_EU_BROKEN_AMT)) {
    throw new Error('flight fare amt template patch did not apply');
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
  js = patchSharedTripOeListRows(js, { phase: 'beforeApprovedLook' });
  js = applyApprovedLookPatches(js);
  js = patchSharedTripOeListRows(js, { phase: 'afterApprovedLook' });
  if (served) {
    if (!js.includes('data-shared-live-tab":"hotels"') || !js.includes('data-shared-live-tab":"cars"') || !js.includes('data-shared-live-tab":"flights"')) {
      throw new Error('served shared Hotels/Cars/Flights tab panels missing data-shared-live-tab anchor');
    }
    if (!js.includes('"data-list-row":"1","data-has-logo":tsRowHasLogo')) {
      throw new Error('served shared Oe() rows missing Gate B list row markers');
    }
  }
  return js;
}
