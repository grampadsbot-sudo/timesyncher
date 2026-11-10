const HEADER_STARS_NEEDLE =
  '(()=>{const tsHeadStars=tsRenderStarRatingHtml(tsPrimaryPlaceStarRating(ha(Dt)));return tsHeadStars?n.jsx("span",{"data-ts-detail-header-stars":"1",style:{display:"flex",flexDirection:"row",flexWrap:"nowrap",alignItems:"center",justifyContent:"center",width:"100%"},dangerouslySetInnerHTML:{__html:tsHeadStars}}):null})()';

const RATING_PRICE_ROW_PATCH =
  '(()=>{const tsHeadStars=tsRenderStarRatingHtml(tsPrimaryPlaceStarRating(ha(Dt)));const d=ha(Dt)||{};const raw=String(d.price??"").trim();const unit=typeof d.price==="number"?d.price:Number(raw.replace(/[^0-9.]/g,""));const tsPriceHas=Number.isFinite(unit)&&unit>0;return tsHeadStars||tsPriceHas?n.jsxs("div",{"data-ts-detail-rating-row":"1",style:{display:"flex",flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"center",columnGap:12,rowGap:4,width:"100%",minWidth:0},children:[tsHeadStars?n.jsx("span",{"data-ts-detail-header-stars":"1",style:{display:"flex",flexDirection:"row",flexWrap:"nowrap",alignItems:"center",justifyContent:"center",flex:"0 0 auto"},dangerouslySetInnerHTML:{__html:tsHeadStars}}):null,tsPriceHas?n.jsxs("span",{"data-ts-detail-field":"price",style:{fontSize:13,lineHeight:1.45,whiteSpace:"nowrap",color:"#111827",flex:"0 0 auto"},children:[n.jsx("strong",{children:"Price:"})," ","$"+Math.round(unit).toLocaleString("en-US")]}):null]}):null})()';

const CLOSE_BTN_NEEDLE =
  'n.jsx("button",{onClick:()=>Ne(null),style:{border:"1px solid #e5e7eb",background:"#f9fafb",borderRadius:999,width:34,height:34,cursor:"pointer",fontWeight:900},children:"×"})';

const CLOSE_BTN_PATCH =
  'n.jsxs("span",{"data-ts-detail-title-row":"1",style:{display:"inline-flex",alignItems:"center",gap:8,flexShrink:0},children:[Ce&&!Sa?n.jsx("button",{"data-ts-detail-edit":"1",type:"button","aria-label":"Edit thing",onClick:()=>Kt(!0),style:{border:"1px solid #e5e7eb",background:"#f9fafb",borderRadius:999,width:34,height:34,cursor:"pointer",fontWeight:900,color:"#111827",fontSize:16,lineHeight:1},children:"✎"}):null,n.jsx("button",{type:"button",className:"tsv-detail-close","data-ts-detail-close":"1","aria-label":"Close",onClick:()=>{Kt(!1),Ne(null)},style:{border:"1px solid #e5e7eb",background:"#f9fafb",borderRadius:999,width:34,height:34,cursor:"pointer",fontWeight:900},children:"×"})]})';

const FIELDSET_EDIT_NEEDLE =
  'Ce&&n.jsxs("fieldset",{"data-shared-readonly":void 0,disabled:!1,style:{border:0,padding:0,margin:0,minInlineSize:0,opacity:1},children:[n.jsx(Nr,{items:fo(Dt),scopeKey:Qt(Dt)}),';

const FIELDSET_EDIT_PATCH =
  'Ce&&Sa&&n.jsxs("fieldset",{"data-shared-readonly":void 0,disabled:!1,style:{border:0,padding:0,margin:0,minInlineSize:0,opacity:1},children:[n.jsx(Nr,{items:fo(Dt),scopeKey:Qt(Dt)}),';

const DETAIL_NAME_EDIT_NEEDLE =
  'Ce?n.jsx("input",{"aria-label":"Detail name","data-ts-detail-name":"1",disabled:!1,value:mr(Dt),onChange:G=>kd(Dt,G.target.value)';
const DETAIL_NAME_EDIT_PATCH =
  'Ce&&Sa?n.jsx("input",{"aria-label":"Detail name","data-ts-detail-name":"1",disabled:!1,value:mr(Dt),onChange:G=>kd(Dt,G.target.value)';

export function patchThingDetail951(source = '') {
  let js = String(source || '');
  if (js.includes(HEADER_STARS_NEEDLE)) {
    js = js.replace(HEADER_STARS_NEEDLE, () => RATING_PRICE_ROW_PATCH);
  } else if (!js.includes('"data-ts-detail-rating-row":"1"')) {
    throw new Error('thing detail #959 rating + price row patch did not apply');
  }
  if (js.includes(CLOSE_BTN_NEEDLE)) {
    js = js.replace(CLOSE_BTN_NEEDLE, CLOSE_BTN_PATCH);
  } else if (!js.includes('"data-ts-detail-edit":"1"')) {
    throw new Error('thing detail #951 pencil + close patch did not apply');
  }
  if (js.includes(FIELDSET_EDIT_NEEDLE)) {
    js = js.replace(FIELDSET_EDIT_NEEDLE, FIELDSET_EDIT_PATCH);
  } else if (!js.includes('Ce&&Sa&&n.jsxs("fieldset",{"data-shared-readonly":void 0')) {
    throw new Error('thing detail #951 edit fieldset gate patch did not apply');
  }
  if (js.includes(DETAIL_NAME_EDIT_NEEDLE)) {
    js = js.replace(DETAIL_NAME_EDIT_NEEDLE, DETAIL_NAME_EDIT_PATCH);
  } else if (!js.includes('Ce&&Sa?n.jsx("input",{"aria-label":"Detail name"')) {
    throw new Error('thing detail #951 name edit gate patch did not apply');
  }
  return js;
}
