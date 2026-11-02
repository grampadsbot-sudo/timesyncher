const REST_TAG_DETAILS_NEEDLE =
  '(zi(Dt)&&(Ce||or(Dt).length))&&n.jsxs("label",{style:Hn,children:["Restaurant tags / chips",Ce?n.jsxs("details",{"data-ts-tag-picker":"1",style:{marginTop:4},children:[n.jsx("summary",{style:{cursor:"pointer",fontSize:12,fontWeight:800,color:"#374151",listStyle:"none"},children:"Tags ▾"}),n.jsx("div",{"data-ts-tag-picker-options":"1",style:{display:"grid",gap:4,marginTop:6,maxHeight:180,overflowY:"auto",paddingRight:4},children:ot.map(G=>{const sel=or(Dt).includes(G);return n.jsxs("label",{style:{display:"flex",alignItems:"center",gap:6,fontSize:11,cursor:"pointer"},children:[n.jsx("input",{type:"checkbox",readOnly:!0,checked:sel,onClick:()=>jn(Dt,G),style:{pointerEvents:"auto"}}),G]},G)})})]}):null,!Ce&&or(Dt).length?n.jsx("div",{"data-ts-cuisine-chips":"1",style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:or(Dt).map(G=>n.jsx("button",{type:"button",onClick:()=>jn(Dt,G),style:{border:"1px solid #e5e7eb",background:"#111827",color:"white",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800,cursor:"pointer"},children:G},G))}):null,Ce&&or(Dt).length?n.jsx("div",{"data-ts-cuisine-chips-selected":"1",style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:or(Dt).map(G=>n.jsx("span",{style:{border:"1px solid #111827",background:"#111827",color:"white",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800},children:G},G))}):null]})';

const REST_TAG_SELECT_PATCH =
  '(zi(Dt)&&(Ce||or(Dt).length))&&n.jsxs("label",{style:Hn,children:["Restaurant tags / chips",Ce?n.jsx("select",{"data-ts-tag-picker":"1","data-ts-restaurant-tag-multiselect":"1",multiple:!0,value:or(Dt),onChange:G=>Xa(Dt,"restaurantTags",[...G.target.selectedOptions].map(Re=>Re.value)),style:{width:"100%",marginTop:4,minHeight:88,fontSize:12,padding:"6px 8px",borderRadius:8,border:"1px solid #e5e7eb",boxSizing:"border-box"},children:ot.map(G=>n.jsx("option",{value:G,children:G},G))}):null,or(Dt).length?n.jsx("div",{"data-ts-cuisine-chips":"1","data-ts-cuisine-chips-selected":"1",style:{display:"flex",gap:6,flexWrap:"wrap",marginTop:4},children:or(Dt).map(G=>n.jsx("span",{style:{border:"1px solid #111827",background:"#111827",color:"white",borderRadius:999,padding:"5px 8px",fontSize:10,fontWeight:800},children:G},G))}):null]})';

export function patchUi691RestaurantTags(source = '') {
  let js = String(source || '');
  if (js.includes(REST_TAG_DETAILS_NEEDLE)) {
    js = js.replace(REST_TAG_DETAILS_NEEDLE, REST_TAG_SELECT_PATCH);
  } else if (!js.includes('"data-ts-restaurant-tag-multiselect":"1"')) {
    throw new Error('ui #691 restaurant tag multiselect patch did not apply');
  }
  if (!js.includes('Xa(Dt,"restaurantTags",[...G.target.selectedOptions]')) {
    throw new Error('ui #691 restaurant tag multiselect must persist restaurantTags');
  }
  if (js.includes('data-ts-tag-picker-options":"1",style:{display:"grid",gap:4,marginTop:6,maxHeight:180,overflowY:"auto",paddingRight:4},children:ot.map(G=>{const sel=or(Dt).includes(G)')) {
    throw new Error('ui #691 restaurant detail must not render the full chip wall');
  }
  return js;
}
