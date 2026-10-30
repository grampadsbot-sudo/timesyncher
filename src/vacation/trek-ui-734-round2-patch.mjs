import { STORED_SUMMARY_LIST_ROW_PICK_BUNDLE } from './flight-list-row-summary.mjs';

const REST_CHIP_PATCH =
  '(zi(Dt)&&(Ce||or(Dt).length))&&n.jsxs("label",{style:Hn,children:["Restaurant tags / chips",Ce?n.jsx("input",{value:_t(Dt),onChange:G=>Ua(Dt,G.target.value),placeholder:"Italian, Michelin-starred, Romantic / Date Night",style:De}):null,n.jsx("div",{"data-ts-cuisine-chips":"1",style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:or(Dt).map(G=>n.jsx("button",{type:"button",onClick:()=>jn(Dt,G),style:{border:"1px solid #e5e7eb",background:"#111827",color:"white",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800,cursor:"pointer"},children:G},G))})]})';

const STORE_CHIP_PATCH =
  '(ro(Dt)&&(Ce||vn(Dt).length))&&n.jsxs("label",{style:Hn,children:["Store tags / chips",Ce?n.jsx("input",{value:lt(Dt),onChange:G=>va(Dt,G.target.value),placeholder:"Grocery / Market, Juice / Smoothie, High-end Retail",style:De}):null,n.jsx("div",{"data-ts-store-chips":"1",style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:vn(Dt).map(G=>n.jsx("button",{type:"button",onClick:()=>rn(Dt,G),style:{border:"1px solid #e5e7eb",background:"#111827",color:"white",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800,cursor:"pointer"},children:G},G))})]})';

const EN_AREA_NEEDLE = 'En=G=>Sn(ha(G).area,G),Mn=G=>';
const EN_AREA_PATCH = 'En=G=>Sn("",G),Mn=G=>';

const RR_HOTEL_LIST_NEEDLE = `rr=G=>{const pick=${STORED_SUMMARY_LIST_ROW_PICK_BUNDLE};return pick(ha(G).itineraryNote??ha(G).itinerary_note)||pick(ha(G).summary??"")||""}`;

const RR_HOTEL_LIST_PATCH = `rr=G=>{const pick=${STORED_SUMMARY_LIST_ROW_PICK_BUNDLE};const hotel=It(G)==="hotel"||Zi(G);if(hotel){const summary=pick(ha(G).summary??"");if(summary)return summary}return pick(ha(G).itineraryNote??ha(G).itinerary_note)||pick(ha(G).summary??"")||""}`;

const WEBSITE_INSERT_NEEDLE =
  'phone?n.jsxs("a",{"data-ts-detail-info-box":"phone",href:"tel:"+phone.replace(/\\s+/g,""),style:{display:"block",border:"1px solid #e5e7eb",borderRadius:10,padding:"10px 12px",marginBottom:10,background:"#f0fdf4",color:"#0f766e",textDecoration:"none",fontSize:13},children:[n.jsx("strong",{children:"Phone:"})," ",phone]}):null,hhShow?';

const WEBSITE_INSERT_PATCH =
  'phone?n.jsxs("a",{"data-ts-detail-info-box":"phone",href:"tel:"+phone.replace(/\\s+/g,""),style:{display:"block",border:"1px solid #e5e7eb",borderRadius:10,padding:"10px 12px",marginBottom:10,background:"#f0fdf4",color:"#0f766e",textDecoration:"none",fontSize:13},children:[n.jsx("strong",{children:"Phone:"})," ",phone]}):null,(()=>{const web=String(d.website||d.url||"").replace(/\\s+/g," ").trim();return web?n.jsxs("a",{"data-ts-detail-info-box":"website",href:web.startsWith("http")?web:"https://"+web.replace(/^\\/\\//,""),target:"_blank",rel:"noreferrer",style:{display:"block",border:"1px solid #e5e7eb",borderRadius:10,padding:"10px 12px",marginBottom:10,background:"#eff6ff",color:"#1d4ed8",textDecoration:"none",fontSize:13},children:[n.jsx("strong",{children:"Website:"})," ",web]}):null})(),(()=>{const sum=String(d.summary||"").replace(/\\s+/g," ").trim();return sum?n.jsxs("div",{"data-ts-detail-summary-readonly":"1",style:{border:"1px solid #e5e7eb",borderRadius:10,padding:"10px 12px",marginBottom:10,background:"#fff"},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,letterSpacing:1.2,color:"#0f766e",textTransform:"uppercase",marginBottom:6},children:"Summary"}),n.jsx("p",{style:{margin:0,fontSize:13,lineHeight:1.45,color:"#334155"},children:sum})]}):null})(),(()=>{const rev=[1,2,3,4].map(i=>({i,t:String(d["review"+i]||"").replace(/\\s+/g," ").trim(),r:String(d["review"+i+"Rating"]||"").trim()})).filter(x=>x.t);return rev.length?n.jsxs("div",{"data-ts-detail-reviews-readonly":"1",style:{marginBottom:10},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,letterSpacing:1.2,color:"#0f766e",textTransform:"uppercase",marginBottom:6},children:"Reviews"}),rev.map(x=>n.jsxs("div",{key:x.i,style:{marginBottom:8,fontSize:13,lineHeight:1.45},children:[x.r?n.jsx("span",{"data-ts-review-stars":"1",style:{display:"inline-flex",marginRight:6,verticalAlign:"middle"},dangerouslySetInnerHTML:{__html:tsRenderStarRatingHtml(String(x.r))},role:"img","aria-label":tsStarRatingAria(String(x.r))}):null,x.t]},x.i))]}):null})(),hhShow?';

const SUMMARY_EDITOR_NEEDLE =
  'n.jsxs("label",{style:Hn,children:["Summary",n.jsx("textarea",{value:ha(Dt).summary??"",onChange:G=>Xa(Dt,"summary",G.target.value),placeholder:"Short paragraph on why this is a good option",style:ur})]}),n.jsxs("label",{style:Hn,children:["Story"';

const SUMMARY_EDITOR_PATCH =
  'Ce?n.jsxs("label",{style:Hn,children:["Summary",n.jsx("textarea",{value:ha(Dt).summary??"",onChange:G=>Xa(Dt,"summary",G.target.value),placeholder:"Short paragraph on why this is a good option",style:ur})]}):null,n.jsxs("label",{style:Hn,children:["Story"';

const DETAILS_EDITOR_NEEDLE =
  'n.jsxs("label",{style:Hn,children:["Details",n.jsx("textarea",{value:Co(Dt),onChange:G=>Xa(Dt,"longDetails",G.target.value),placeholder:bn(Dt)?"Aircraft, amenities, route, connections, layover, fare notes":Mi(Dt)?"JFK pickup/counter logistics, NYC driving/parking tradeoffs, car class fit, concise review summary":"What makes it special, recommended dishes/experience, logistics, rating/review-source notes",style:{...ur,minHeight:120}})]}),((()=>{const raw=String(ha(Dt).happyHourDetails';

const DETAILS_EDITOR_PATCH =
  'Ce?n.jsxs("label",{style:Hn,children:["Details",n.jsx("textarea",{value:Co(Dt),onChange:G=>Xa(Dt,"longDetails",G.target.value),placeholder:bn(Dt)?"Aircraft, amenities, route, connections, layover, fare notes":Mi(Dt)?"JFK pickup/counter logistics, NYC driving/parking tradeoffs, car class fit, concise review summary":"What makes it special, recommended dishes/experience, logistics, rating/review-source notes",style:{...ur,minHeight:120}})]}):null,((()=>{const raw=String(ha(Dt).happyHourDetails';

const REST_TAG_DROPDOWN_NEEDLE = REST_CHIP_PATCH;
const REST_TAG_DROPDOWN_PATCH =
  '(zi(Dt)&&(Ce||or(Dt).length))&&n.jsxs("label",{style:Hn,children:["Restaurant tags / chips",Ce?n.jsxs("details",{"data-ts-tag-picker":"1",style:{marginTop:4},children:[n.jsx("summary",{style:{cursor:"pointer",fontSize:12,fontWeight:800,color:"#374151",listStyle:"none"},children:"Tags ▾"}),n.jsx("div",{style:{display:"grid",gap:4,marginTop:6,maxHeight:180,overflowY:"auto",paddingRight:4},children:ot.map(G=>{const Re=or(Dt).includes(G);return n.jsxs("label",{style:{display:"flex",alignItems:"center",gap:6,fontSize:11,cursor:"pointer"},children:[n.jsx("input",{type:"checkbox",readOnly:!0,checked:Re,onClick:()=>jn(Dt,G),style:{pointerEvents:"auto"}}),G]},G)})})]}):null,!Ce&&or(Dt).length?n.jsx("div",{"data-ts-cuisine-chips":"1",style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:or(Dt).map(G=>n.jsx("span",{style:{border:"1px solid #e5e7eb",background:"#111827",color:"white",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800},children:G},G))}):null,Ce&&or(Dt).length?n.jsx("div",{"data-ts-cuisine-chips-selected":"1",style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:or(Dt).map(G=>n.jsx("span",{style:{border:"1px solid #111827",background:"#111827",color:"white",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800},children:G},G))}):null]})';

const STORE_TAG_DROPDOWN_NEEDLE = STORE_CHIP_PATCH;
const STORE_TAG_DROPDOWN_PATCH =
  '(ro(Dt)&&(Ce||vn(Dt).length))&&n.jsxs("label",{style:Hn,children:["Store tags / chips",Ce?n.jsxs("details",{"data-ts-tag-picker":"1",style:{marginTop:4},children:[n.jsx("summary",{style:{cursor:"pointer",fontSize:12,fontWeight:800,color:"#374151",listStyle:"none"},children:"Tags ▾"}),n.jsx("div",{style:{display:"grid",gap:4,marginTop:6,maxHeight:180,overflowY:"auto",paddingRight:4},children:gt.map(G=>{const Re=vn(Dt).includes(G);return n.jsxs("label",{style:{display:"flex",alignItems:"center",gap:6,fontSize:11,cursor:"pointer"},children:[n.jsx("input",{type:"checkbox",readOnly:!0,checked:Re,onClick:()=>rn(Dt,G),style:{pointerEvents:"auto"}}),G]},G)})})]}):null,!Ce&&vn(Dt).length?n.jsx("div",{"data-ts-store-chips":"1",style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:vn(Dt).map(G=>n.jsx("span",{style:{border:"1px solid #e5e7eb",background:"#111827",color:"white",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800},children:G},G))}):null,Ce&&vn(Dt).length?n.jsx("div",{"data-ts-store-chips-selected":"1",style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:vn(Dt).map(G=>n.jsx("span",{style:{border:"1px solid #111827",background:"#111827",color:"white",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800},children:G},G))}):null]})';

export function patchUi734Round2(source = '') {
  let js = String(source || '');
  if (js.includes(EN_AREA_NEEDLE)) {
    js = js.replace(EN_AREA_NEEDLE, EN_AREA_PATCH);
  } else if (!js.includes('En=G=>Sn("",G),Mn=G=>')) {
    throw new Error('ui #734 round2 area chip En() patch did not apply');
  }
  if (js.includes(RR_HOTEL_LIST_NEEDLE)) {
    js = js.replace(RR_HOTEL_LIST_NEEDLE, RR_HOTEL_LIST_PATCH);
  } else if (!js.includes('const hotel=It(G)==="hotel"||Zi(G)')) {
    throw new Error('ui #734 round2 hotel list summary rr() patch did not apply');
  }
  if (js.includes(WEBSITE_INSERT_NEEDLE)) {
    js = js.replace(WEBSITE_INSERT_NEEDLE, WEBSITE_INSERT_PATCH);
  } else if (!js.includes('data-ts-detail-info-box":"website"')) {
    throw new Error('ui #734 round2 detail website/summary/reviews order patch did not apply');
  }
  if (js.includes(SUMMARY_EDITOR_NEEDLE)) {
    js = js.replace(SUMMARY_EDITOR_NEEDLE, SUMMARY_EDITOR_PATCH);
  } else if (!js.includes('Ce?n.jsxs("label",{style:Hn,children:["Summary",n.jsx("textarea"')) {
    throw new Error('ui #734 round2 viewer-only summary editor patch did not apply');
  }
  if (js.includes(DETAILS_EDITOR_NEEDLE)) {
    js = js.replace(DETAILS_EDITOR_NEEDLE, DETAILS_EDITOR_PATCH);
  } else if (!js.includes('Ce?n.jsxs("label",{style:Hn,children:["Details",n.jsx("textarea"')) {
    throw new Error('ui #734 round2 viewer-only details editor patch did not apply');
  }
  if (js.includes(REST_TAG_DROPDOWN_NEEDLE)) {
    js = js.replace(REST_TAG_DROPDOWN_NEEDLE, REST_TAG_DROPDOWN_PATCH);
  } else if (!js.includes('"data-ts-tag-picker":"1"')) {
    throw new Error('ui #734 round2 restaurant tag picker patch did not apply');
  }
  if (js.includes(STORE_TAG_DROPDOWN_NEEDLE)) {
    js = js.replace(STORE_TAG_DROPDOWN_NEEDLE, STORE_TAG_DROPDOWN_PATCH);
  }
  if (!js.includes('data-ts-detail-summary-readonly":"1"')) {
    throw new Error('ui #734 round2 summary readonly box missing');
  }
  if (!js.includes('data-ts-detail-reviews-readonly":"1"')) {
    throw new Error('ui #734 round2 reviews readonly box missing');
  }
  return js;
}
