const FIELDSET_NEEDLE =
  '}),n.jsxs("fieldset",{"data-shared-readonly":Ce?void 0:"true",disabled:!Ce,style:{border:0,padding:0,margin:0,minInlineSize:0,opacity:1},children:[n.jsx(Nr,{items:fo(Dt),scopeKey:Qt(Dt)}),';

const FIELDSET_PATCH =
  '}),(()=>{const d=ha(Dt)||{},addr=String(d.address||"").replace(/\\s+/g," ").trim(),hours=String(d.hours||"").replace(/\\s+/g," ").trim(),phone=String(d.phone||"").replace(/\\s+/g," ").trim(),hh=String(d.happyHourDetails||"").replace(/\\s+/g," ").trim(),hhFlag=d.happyHour,hhShow=hh&&hh!=="false"&&String(hhFlag||"").toLowerCase()!=="false"&&hh.toLowerCase()!=="no happy hour found";const rev=[1,2,3,4].map(i=>({i,t:String(d["review"+i]||"").replace(/\\s+/g," ").trim(),r:String(d["review"+i+"Rating"]||"").trim()})).filter(x=>x.t);return n.jsxs(n.Fragment,{children:[(addr||hours)?n.jsxs("div",{"data-ts-detail-info-box":"address-hours",style:{border:"1px solid #e5e7eb",borderRadius:10,padding:"10px 12px",marginBottom:10,background:"#f9fafb"},children:[addr?n.jsxs("p",{"data-ts-detail-field":"address",style:{margin:"0 0 6px",fontSize:13,lineHeight:1.45},children:[n.jsx("strong",{children:"Address:"})," ",addr]}):null,hours?n.jsxs("p",{"data-ts-detail-field":"hours",style:{margin:0,fontSize:13,lineHeight:1.45},children:[n.jsx("strong",{children:"Hours:"})," ",hours]}):null]}):null,phone?n.jsxs("a",{"data-ts-detail-info-box":"phone",href:"tel:"+phone.replace(/\\s+/g,""),style:{display:"block",border:"1px solid #e5e7eb",borderRadius:10,padding:"10px 12px",marginBottom:10,background:"#f0fdf4",color:"#0f766e",textDecoration:"none",fontSize:13},children:[n.jsx("strong",{children:"Phone:"})," ",phone]}):null,hhShow?n.jsxs("p",{"data-ts-detail-field":"happyHourDetails",style:{fontSize:13,marginBottom:10,lineHeight:1.45},children:[n.jsx("strong",{children:"Happy hour:"})," ",hh]}):null,rev.length?n.jsxs("div",{"data-ts-detail-reviews":"1",style:{marginBottom:12},children:[n.jsx("div",{style:{fontSize:10,fontWeight:900,letterSpacing:1.2,color:"#0f766e",textTransform:"uppercase",marginBottom:6},children:"Reviews"}),rev.map(x=>n.jsxs("div",{key:x.i,style:{marginBottom:8,fontSize:13,lineHeight:1.45},children:[x.r?n.jsxs("span",{style:{fontWeight:700,marginRight:6},children:[x.r,"★"]}):null,x.t]},x.i))]}):null]});})(),n.jsxs("fieldset",{"data-shared-readonly":Ce?void 0:"true",disabled:!Ce,style:{border:0,padding:0,margin:0,minInlineSize:0,opacity:1},children:[n.jsx(Nr,{items:fo(Dt),scopeKey:Qt(Dt)}),';

export function patchThingDetailReadonlyBoxes(source = '') {
  let js = String(source || '');
  if (js.includes('data-ts-detail-info-box":"address-hours"')) return js;
  if (js.includes(FIELDSET_NEEDLE)) {
    js = js.replace(FIELDSET_NEEDLE, FIELDSET_PATCH);
  }
  return js;
}
