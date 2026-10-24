const REST_TAG_UI_NEEDLE =
  'zi(Dt)&&n.jsxs("label",{style:Hn,children:["Restaurant tags / chips",n.jsx("input",{value:_t(Dt),onChange:G=>Ua(Dt,G.target.value),placeholder:"Italian, Michelin-starred, Romantic / Date Night",style:De}),n.jsx("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:ot.map(G=>{const Re=or(Dt).includes(G);return n.jsx("button",{type:"button",onClick:()=>jn(Dt,G),style:{border:"1px solid #e5e7eb",background:Re?"#111827":"white",color:Re?"white":"#6b7280",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800,cursor:"pointer"},children:G},G)})})]}),';

const REST_TAG_UI_PATCH =
  'zi(Dt)&&n.jsxs("div",{"data-ts-restaurant-tags-field":"1",style:{display:"grid",gap:6},children:[Ce?n.jsxs("label",{style:Hn,children:["Restaurant tags / chips",n.jsx("select",{"data-ts-restaurant-tag-select":"1",multiple:!0,value:or(Dt),onChange:G=>{const zt=Array.from(G.target.selectedOptions).map(ua=>ua.value);Xa(Dt,"restaurantTags",zt)},style:{...De,minHeight:88,padding:6},size:Math.min(8,Math.max(3,ot.length)),children:ot.map(G=>n.jsx("option",{value:G,children:G},G))})]}):n.jsx("label",{style:Hn,children:"Restaurant tags / chips"}),or(Dt).length>0?n.jsx("div",{"data-ts-restaurant-tag-chips":"1",style:{display:"flex",gap:6,flexWrap:"wrap"},children:or(Dt).map(G=>n.jsx("span",{"data-ts-restaurant-tag-chip":"1",style:{border:"1px solid #e5e7eb",background:"#111827",color:"white",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800,lineHeight:1.2},children:G},G))}):null]}),';

export function patchThingDetailRestaurantTags(source = '') {
  let js = String(source || '');
  if (js.includes('data-ts-restaurant-tag-select')) return js;
  if (!js.includes(REST_TAG_UI_NEEDLE)) {
    throw new Error('restaurant detail tag chip wall needle missing from trek bundle');
  }
  return js.replace(REST_TAG_UI_NEEDLE, REST_TAG_UI_PATCH);
}
