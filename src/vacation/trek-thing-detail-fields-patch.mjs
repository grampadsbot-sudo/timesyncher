import { STORED_SUMMARY_LIST_ROW_PICK_BUNDLE } from './flight-list-row-summary.mjs';

const RR_NEEDLE = 'rr=G=>ha(G).summary??""';
const RR_ITINERARY_CHAIN = 'rr=G=>ha(G).itineraryNote??ha(G).itinerary_note??ha(G).summary??""';
const RR_LIST_PATCH_BROKEN =
  'rr=G=>{const pick=t=>{const s=String(t||"").replace(/\\s+/g," ").trim();if(!s)return"";const w=s.split(" ").filter(Boolean);if(w.length<=20)return s;if(/^Documented .+ option/i.test(s))return s;return""};return pick(ha(G).itineraryNote??ha(G).itinerary_note)||pick(ha(G).summary??"")||""}';
const RR_LIST_PATCH = `rr=G=>{const pick=${STORED_SUMMARY_LIST_ROW_PICK_BUNDLE};return pick(ha(G).itineraryNote??ha(G).itinerary_note)||pick(ha(G).summary??"")||""}`;

const ZI_NEEDLE = 'zi=G=>It(G)==="restaurant"';
const ZI_PATCH = 'zi=G=>{const c=It(G);return c==="restaurant"||c==="bar"}';

const FN_NEEDLE = 'Fn=G=>{const Re=Ot(G);return/\\bflight\\b|southwest|jetblue|united|delta|american/i.test(Re)||/\\b(LAS|JFK|LGA|EWR)\\b/.test(Re)?"flight":';
const FN_PATCH_V1 = 'Fn=G=>{const cat=String(ha(G).category||(typeof G.category==="string"?G.category:G.category&&G.category.name)||G.category_name||"").toLowerCase();if(cat&&!(cat==="flight"||cat==="car"||cat.includes("transport"))){if(cat.includes("attraction"))return"attraction";if(cat.includes("tour"))return"tour";if(cat.includes("activity")||cat.includes("sightseeing")||cat.includes("event"))return cat.includes("tour")?"tour":"activity"}const Re=Ot(G);return/\\bflight\\b|southwest|jetblue|united|delta|american/i.test(Re)||/\\b(LAS|JFK|LGA|EWR)\\b/.test(Re)?"flight":';
const FN_NEEDLE_V2 = 'Fn=G=>{const cat=String(ha(G).category||(typeof G.category==="string"?G.category:G.category&&G.category.name)||G.category_name||"").toLowerCase();if(cat&&!(cat==="flight"||cat==="car"||cat.includes("transport"))){if(cat.includes("attraction"))return"attraction";if(cat.includes("tour"))return"tour";if(cat.includes("activity")||cat.includes("sightseeing")||cat.includes("event"))return cat.includes("tour")?"tour":"activity"}const Re=Ot(G);return/\\bflight\\b|southwest|jetblue|united|delta|american/i.test(Re)||/\\b(LAS|JFK|LGA|EWR)\\b/.test(Re)?"flight":';
const FN_PATCH = 'Fn=G=>{const placeCat=String((typeof G.category==="string"?G.category:G.category&&G.category.name)||G.category_name||"").toLowerCase();if(placeCat&&placeCat!=="flight"&&placeCat!=="car"&&!placeCat.includes("transport")){if(placeCat.includes("attraction"))return"attraction";if(placeCat.includes("tour"))return"tour";if(placeCat.includes("activity")||placeCat.includes("sightseeing")||placeCat.includes("event")||placeCat.includes("theatre"))return placeCat.includes("tour")?"tour":(placeCat.includes("theatre")?"theatre":"activity")}const cat=String(ha(G).category||"").toLowerCase();if(cat&&!(cat==="flight"||cat==="car"||cat.includes("transport"))){if(cat.includes("attraction"))return"attraction";if(cat.includes("tour"))return"tour";if(cat.includes("activity")||cat.includes("sightseeing")||cat.includes("event"))return cat.includes("tour")?"tour":"activity"}const Re=Ot(G);return/\\bflight\\b|\\b(?:southwest|jetblue|united|delta)\\s+air(?:lines)?\\b|\\bamerican\\s+air(?:lines)?\\b/i.test(Re)||/\\b(?:LAS|JFK|LGA|EWR)\\s*(?:→|->|-|to)\\s*(?:LAS|JFK|LGA|EWR)\\b/i.test(Re)?"flight":';

const ITINERARY_NOTE_NEEDLE = 'children:[n.jsxs("label",{style:Hn,children:["Summary",n.jsx("textarea",{value:rr(Dt),onChange:G=>Xa(Dt,"summary",G.target.value),placeholder:"Short paragraph on why this is a good option",style:ur})]}),n.jsxs("label",{style:Hn,children:["Story"';
const ITINERARY_NOTE_PATCH = 'children:[n.jsxs("label",{style:Hn,children:["Itinerary note",n.jsx("textarea",{value:ha(Dt).itineraryNote??ha(Dt).itinerary_note??"",onChange:G=>Xa(Dt,"itineraryNote",G.target.value),placeholder:"Short line printed on the itinerary row",style:ur})]}),n.jsxs("label",{style:Hn,children:["Summary",n.jsx("textarea",{value:ha(Dt).summary??"",onChange:G=>Xa(Dt,"summary",G.target.value),placeholder:"Short paragraph on why this is a good option",style:ur})]}),n.jsxs("label",{style:Hn,children:["Story"';
const ITINERARY_NOTE_SUMMARY_RR = 'children:[n.jsxs("label",{style:Hn,children:["Summary",n.jsx("textarea",{value:rr(Dt),onChange:G=>Xa(Dt,"summary",G.target.value),placeholder:"Short paragraph on why this is a good option",style:ur})]}),n.jsxs("label",{style:Hn,children:["Story"';
const ITINERARY_NOTE_SUMMARY_HA = 'children:[n.jsxs("label",{style:Hn,children:["Summary",n.jsx("textarea",{value:ha(Dt).summary??"",onChange:G=>Xa(Dt,"summary",G.target.value),placeholder:"Short paragraph on why this is a good option",style:ur})]}),n.jsxs("label",{style:Hn,children:["Story"';

const HH_CHECK_NEEDLE = '}),zi(Dt)&&n.jsxs("label",{style:{...Hn,flexDirection:"row",alignItems:"center",gap:8,textTransform:"none",fontSize:12,paddingBottom:8},children:[n.jsx("input",{type:"checkbox",checked:!!(ha(Dt).happyHour||tsPf.some(row=>row.happyHour===true&&row.match.test(String(Dt.name||Dt.title||"")))),onChange:G=>Xa(Dt,"happyHour",G.target.checked)})," Happy hour"]})]})]}):n.jsxs(n.Fragment';
const HH_CHECK_PATCH = '}),(zi(Dt)||It(Dt)==="bar")&&n.jsxs("label",{style:{...Hn,flexDirection:"row",alignItems:"center",gap:8,textTransform:"none",fontSize:12,paddingBottom:8},children:[n.jsx("input",{type:"checkbox",checked:!!(ha(Dt).happyHour||tsPf.some(row=>row.happyHour===true&&row.match.test(String(Dt.name||Dt.title||"")))),onChange:G=>Xa(Dt,"happyHour",G.target.checked)})," Happy hour"]})]})]}):n.jsxs(n.Fragment';

const HH_DETAILS_NEEDLE = '}),zi(Dt)&&n.jsxs("label",{style:Hn,children:["Happy hour details",n.jsx("textarea",{value:(ha(Dt).happyHourDetails||(tsPf.find(row=>row.match.test(String(Dt.name||Dt.title||"")))||{}).happyHourDetails||""),onChange:G=>Xa(Dt,"happyHourDetails",G.target.value),placeholder:"Recent/current happy-hour offer, menu items, discount, days/times, caveats, and source note",style:{...ur,minHeight:84}})]}),Zi(Dt)&&n.jsxs("div"';
const HH_DETAILS_PATCH = '}),((()=>{const raw=String(ha(Dt).happyHourDetails||"").replace(/\\s+/g," ").trim();return !!raw&&raw!=="false"&&!/^no happy hour\\b/i.test(raw)})())&&n.jsxs("label",{style:Hn,children:["Happy hour details",n.jsx("textarea",{value:String(ha(Dt).happyHourDetails||""),onChange:G=>Xa(Dt,"happyHourDetails",G.target.value),placeholder:"Recent/current happy-hour offer, menu items, discount, days/times, caveats, and source note",style:{...ur,minHeight:84}})]}),Zi(Dt)&&n.jsxs("div"';

const REST_CHIP_NEEDLE = 'zi(Dt)&&n.jsxs("label",{style:Hn,children:["Restaurant tags / chips",n.jsx("input",{value:_t(Dt),onChange:G=>Ua(Dt,G.target.value),placeholder:"Italian, Michelin-starred, Romantic / Date Night",style:De}),n.jsx("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:ot.map(G=>{const Re=or(Dt).includes(G);return n.jsx("button",{type:"button",onClick:()=>jn(Dt,G),style:{border:"1px solid #e5e7eb",background:Re?"#111827":"white",color:Re?"white":"#6b7280",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800,cursor:"pointer"},children:G},G)})})]})';
const REST_CHIP_PATCH = '(zi(Dt)&&(Ce||or(Dt).length))&&n.jsxs("label",{style:Hn,children:["Restaurant tags / chips",Ce?n.jsx("input",{value:_t(Dt),onChange:G=>Ua(Dt,G.target.value),placeholder:"Italian, Michelin-starred, Romantic / Date Night",style:De}):null,n.jsx("div",{"data-ts-cuisine-chips":"1",style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:or(Dt).map(G=>n.jsx("button",{type:"button",onClick:()=>jn(Dt,G),style:{border:"1px solid #e5e7eb",background:"#111827",color:"white",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800,cursor:"pointer"},children:G},G))})]})';

const STORE_CHIP_NEEDLE = 'ro(Dt)&&n.jsxs("label",{style:Hn,children:["Store tags / chips",n.jsx("input",{value:lt(Dt),onChange:G=>va(Dt,G.target.value),placeholder:"Grocery / Market, Juice / Smoothie, High-end Retail",style:De}),n.jsx("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:gt.map(G=>{const Re=vn(Dt).includes(G);return n.jsx("button",{type:"button",onClick:()=>rn(Dt,G),style:{border:"1px solid #e5e7eb",background:Re?"#111827":"white",color:Re?"white":"#6b7280",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800,cursor:"pointer"},children:G},G)})})]})';
const STORE_CHIP_PATCH = '(ro(Dt)&&(Ce||vn(Dt).length))&&n.jsxs("label",{style:Hn,children:["Store tags / chips",Ce?n.jsx("input",{value:lt(Dt),onChange:G=>va(Dt,G.target.value),placeholder:"Grocery / Market, Juice / Smoothie, High-end Retail",style:De}):null,n.jsx("div",{"data-ts-store-chips":"1",style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:vn(Dt).map(G=>n.jsx("button",{type:"button",onClick:()=>rn(Dt,G),style:{border:"1px solid #e5e7eb",background:"#111827",color:"white",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800,cursor:"pointer"},children:G},G))})]})';

export function patchThingDetailFields(source = '') {
  let js = String(source || '');
  if (js.includes(RR_LIST_PATCH_BROKEN)) js = js.replace(RR_LIST_PATCH_BROKEN, RR_LIST_PATCH);
  else if (js.includes(RR_ITINERARY_CHAIN)) js = js.replace(RR_ITINERARY_CHAIN, RR_LIST_PATCH);
  else if (js.includes(RR_NEEDLE)) js = js.replace(RR_NEEDLE, RR_LIST_PATCH);
  if (js.includes(ZI_NEEDLE)) js = js.replace(ZI_NEEDLE, ZI_PATCH);
  if (js.includes(FN_NEEDLE_V2)) js = js.replace(FN_NEEDLE_V2, FN_PATCH);
  else if (js.includes(FN_NEEDLE)) js = js.replace(FN_NEEDLE, FN_PATCH_V1);
  if (js.includes('Itinerary note') && js.includes(ITINERARY_NOTE_SUMMARY_RR)) {
    js = js.replace(ITINERARY_NOTE_SUMMARY_RR, ITINERARY_NOTE_SUMMARY_HA);
  } else if (js.includes(ITINERARY_NOTE_NEEDLE)) {
    js = js.replace(ITINERARY_NOTE_NEEDLE, ITINERARY_NOTE_PATCH);
  }
  if (js.includes(HH_CHECK_NEEDLE)) js = js.replace(HH_CHECK_NEEDLE, HH_CHECK_PATCH);
  if (js.includes(HH_DETAILS_NEEDLE)) js = js.replace(HH_DETAILS_NEEDLE, HH_DETAILS_PATCH);
  if (js.includes(REST_CHIP_NEEDLE)) js = js.replace(REST_CHIP_NEEDLE, REST_CHIP_PATCH);
  if (js.includes(STORE_CHIP_NEEDLE)) js = js.replace(STORE_CHIP_NEEDLE, STORE_CHIP_PATCH);
  return js;
}
