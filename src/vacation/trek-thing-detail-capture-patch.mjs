const DETAIL_PANEL_NEEDLE = 'onClick:G=>G.stopPropagation(),children:[n.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start",marginBottom:14},children:[n.jsxs("div",{style:{flex:1,minWidth:0},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,letterSpacing:1.4,color:"#0f766e",textTransform:"uppercase"},children:"Detail page"})';

const DETAIL_PANEL_PATCH = 'onClick:G=>G.stopPropagation(),children:[n.jsx("script",{type:"application/json","data-ts-detail-capture":"1",dangerouslySetInnerHTML:{__html:tsDetailCapturePayload(Dt)}}),n.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start",marginBottom:14},children:[n.jsxs("div",{style:{flex:1,minWidth:0},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,letterSpacing:1.4,color:"#0f766e",textTransform:"uppercase"},children:"Detail page"})';

const TS_DETAIL_CAPTURE_FN = 'function tsDetailCapturePayload(Dt){const d=ha(Dt)||{};const cat=String(It(Dt)||"").toLowerCase();const reviews=[];for(let i=1;i<=4;i++){const body=String(d["review"+i]||"").replace(/\\s+/g," ").trim();if(!body)continue;reviews.push({index:i,text:body,rating:String(d["review"+i+"Rating"]||"").trim(),source:String(d["review"+i+"Source"]||"").trim()});}const urls=Array.isArray(d.summarySourceUrls)?d.summarySourceUrls.map(u=>String(u||"").trim()).filter(Boolean):[];return JSON.stringify({category:cat,title:mr(Dt),fields:{address:String(d.address||""),phone:String(d.phone||""),hours:String(d.hours||""),website:String(d.website||d.url||""),price:d.price,priceLevel:String(d.priceLevel||""),itineraryNote:String(d.itineraryNote||d.itinerary_note||""),summary:String(d.summary||""),longDetails:String(d.longDetails||""),googleRating:String(d.googleRating||""),googleReviewCount:String(d.googleReviewCount||""),yelpRating:String(d.yelpRating||""),yelpReviewCount:String(d.yelpReviewCount||""),happyHourDetails:String(d.happyHourDetails||""),lat:d.lat,lng:d.lng,logoUrl:String(d.logoUrl||"")},reviews,summarySourceUrls:urls});}';

export function patchThingDetailCapture(source = '') {
  let js = String(source || '');
  if (!js.includes('function tsDetailCapturePayload(')) {
    const anchor = js.indexOf('function tsPaintTabEmoji(');
    if (anchor >= 0) {
      js = `${js.slice(0, anchor)}${TS_DETAIL_CAPTURE_FN}${js.slice(anchor)}`;
    }
  }
  if (js.includes(DETAIL_PANEL_NEEDLE)) {
    js = js.replace(DETAIL_PANEL_NEEDLE, DETAIL_PANEL_PATCH);
  }
  return js;
}
