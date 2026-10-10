const RR_NEEDLE = 'rr=G=>ha(G).summary??""';
const RR_PATCH = 'rr=G=>ha(G).itineraryNote??ha(G).itinerary_note??ha(G).summary??""';

const ZI_NEEDLE = 'zi=G=>It(G)==="restaurant"';
const ZI_PATCH = 'zi=G=>{const c=It(G);return c==="restaurant"||c==="bar"}';

const FN_NEEDLE = 'Fn=G=>{const Re=Ot(G);return/\\bflight\\b|southwest|jetblue|united|delta|american/i.test(Re)||/\\b(LAS|JFK|LGA|EWR)\\b/.test(Re)?"flight":';
const FN_PATCH = 'Fn=G=>{const cat=String(ha(G).category||(typeof G.category==="string"?G.category:G.category&&G.category.name)||G.category_name||"").toLowerCase();if(cat&&!(cat==="flight"||cat==="car"||cat.includes("transport"))){if(cat.includes("attraction"))return"attraction";if(cat.includes("tour"))return"tour";if(cat.includes("activity")||cat.includes("sightseeing")||cat.includes("event"))return cat.includes("tour")?"tour":"activity"}const Re=Ot(G);return/\\bflight\\b|southwest|jetblue|united|delta|american/i.test(Re)||/\\b(LAS|JFK|LGA|EWR)\\b/.test(Re)?"flight":';

const ITINERARY_NOTE_NEEDLE = 'children:[n.jsxs("label",{style:Hn,children:["Summary",n.jsx("textarea",{value:rr(Dt),onChange:G=>Xa(Dt,"summary",G.target.value),placeholder:"Short paragraph on why this is a good option",style:ur})]}),n.jsxs("label",{style:Hn,children:["Story"';
const ITINERARY_NOTE_PATCH = 'children:[n.jsxs("label",{style:Hn,children:["Itinerary note",n.jsx("textarea",{value:ha(Dt).itineraryNote??ha(Dt).itinerary_note??"",onChange:G=>Xa(Dt,"itineraryNote",G.target.value),placeholder:"Short line printed on the itinerary row",style:ur})]}),n.jsxs("label",{style:Hn,children:["Summary",n.jsx("textarea",{value:rr(Dt),onChange:G=>Xa(Dt,"summary",G.target.value),placeholder:"Short paragraph on why this is a good option",style:ur})]}),n.jsxs("label",{style:Hn,children:["Story"';

const HH_CHECK_NEEDLE = '}),zi(Dt)&&n.jsxs("label",{style:{...Hn,flexDirection:"row",alignItems:"center",gap:8,textTransform:"none",fontSize:12,paddingBottom:8},children:[n.jsx("input",{type:"checkbox",checked:!!(ha(Dt).happyHour||tsPf.some(row=>row.happyHour===true&&row.match.test(String(Dt.name||Dt.title||"")))),onChange:G=>Xa(Dt,"happyHour",G.target.checked)})," Happy hour"]})]})]}):n.jsxs(n.Fragment';
const HH_CHECK_PATCH = '}),(zi(Dt)||It(Dt)==="bar")&&n.jsxs("label",{style:{...Hn,flexDirection:"row",alignItems:"center",gap:8,textTransform:"none",fontSize:12,paddingBottom:8},children:[n.jsx("input",{type:"checkbox",checked:!!(ha(Dt).happyHour||tsPf.some(row=>row.happyHour===true&&row.match.test(String(Dt.name||Dt.title||"")))),onChange:G=>Xa(Dt,"happyHour",G.target.checked)})," Happy hour"]})]})]}):n.jsxs(n.Fragment';

const HH_DETAILS_NEEDLE = '}),zi(Dt)&&n.jsxs("label",{style:Hn,children:["Happy hour details",n.jsx("textarea",{value:(ha(Dt).happyHourDetails||(tsPf.find(row=>row.match.test(String(Dt.name||Dt.title||"")))||{}).happyHourDetails||""),onChange:G=>Xa(Dt,"happyHourDetails",G.target.value),placeholder:"Recent/current happy-hour offer, menu items, discount, days/times, caveats, and source note",style:{...ur,minHeight:84}})]}),Zi(Dt)&&n.jsxs("div"';
const HH_DETAILS_PATCH = '}),(zi(Dt)||It(Dt)==="bar")&&n.jsxs("label",{style:Hn,children:["Happy hour details",n.jsx("textarea",{value:(ha(Dt).happyHourDetails||(tsPf.find(row=>row.match.test(String(Dt.name||Dt.title||"")))||{}).happyHourDetails||""),onChange:G=>Xa(Dt,"happyHourDetails",G.target.value),placeholder:"Recent/current happy-hour offer, menu items, discount, days/times, caveats, and source note",style:{...ur,minHeight:84}})]}),Zi(Dt)&&n.jsxs("div"';

export function patchThingDetailFields(source = '') {
  let js = String(source || '');
  if (js.includes(RR_NEEDLE)) js = js.replace(RR_NEEDLE, RR_PATCH);
  if (js.includes(ZI_NEEDLE)) js = js.replace(ZI_NEEDLE, ZI_PATCH);
  if (js.includes(FN_NEEDLE)) js = js.replace(FN_NEEDLE, FN_PATCH);
  if (js.includes(ITINERARY_NOTE_NEEDLE)) js = js.replace(ITINERARY_NOTE_NEEDLE, ITINERARY_NOTE_PATCH);
  if (js.includes(HH_CHECK_NEEDLE)) js = js.replace(HH_CHECK_NEEDLE, HH_CHECK_PATCH);
  if (js.includes(HH_DETAILS_NEEDLE)) js = js.replace(HH_DETAILS_NEEDLE, HH_DETAILS_PATCH);
  return js;
}
