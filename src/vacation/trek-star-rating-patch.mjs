import { TREK_STAR_RATING_CSS, trekStarRatingBundleInject } from './star-rating-model.mjs';

const HA_SCOPE_NEEDLE = 'ha=G=>tsFillOv(le[Qt(G)]||{},G),tsDetailCapturePayload=Dt=>{';
const HA_SCOPE_NEEDLE_BEFORE_CAPTURE = 'ha=G=>tsFillOv(le[Qt(G)]||{},G),Sn=';

const LR_NEEDLE =
  'Lr=G=>[1,2,3].map(Re=>Ps(G,Re)).filter(Boolean).map(Re=>{const ua=String(Re||"").trim().replace(/^[⭐★☆️\\s]+/,"").replace(/^\\(?\\s*5\\s*stars?\\s*\\)?[:\\-–—]?\\s*/i,"").replace(/^[⭐★☆️\\s]+/,"").trim();return`<div class="review"><span class="review-stars-inline">★★★★★</span> ${an(ua)}</div>`}).join("")';

const LR_PATCH =
  'Lr=G=>[1,2,3,4].map(Re=>{const body=String(Ps(G,Re)||"").trim();if(!body)return "";let rv=No(G,`review${Re}Rating`);if(!tsParseStarRating(rv)){const m=body.match(/^\\(?\\s*(\\d+(?:\\.\\d+)?)\\s*stars?\\s*\\)?[:\\-–—]?\\s*/i);if(m)rv=m[1];}const stars=tsRenderStarRatingHtml(rv);if(!stars)return "";const ua=body.replace(/^[⭐★☆️\\s]+/,"").replace(/^\\(?\\s*\\d+(?:\\.\\d+)?\\s*stars?\\s*\\)?[:\\-–—]?\\s*/i,"").replace(/^[⭐★☆️\\s]+/,"").trim();return`<div class="review">${stars} ${an(ua)}</div>`}).filter(Boolean).join("")';

const LR_V2_NEEDLE =
  'Lr=G=>[1,2,3,4].map(Re=>{const body=String(Ps(G,Re)||"").trim();if(!body)return "";const stars=tsRenderStarRatingHtml(No(G,`review${Re}Rating`));if(!stars)return "";const ua=body.replace(/^[⭐★☆️\\s]+/,"").replace(/^\\(?\\s*\\d+(?:\\.\\d+)?\\s*stars?\\s*\\)?[:\\-–—]?\\s*/i,"").replace(/^[⭐★☆️\\s]+/,"").trim();return`<div class="review">${stars} ${an(ua)}</div>`}).filter(Boolean).join("")';

const OE_ROW_VARS_NEEDLE = 'Pn=(Mi(G),Rn),Zn=';
const OE_ROW_VARS_PATCH =
  'Pn=(Mi(G),Rn),tsRowRating=tsPrimaryPlaceStarRating(ha(G)),tsRowStars=tsRenderStarRatingHtml(tsRowRating),Zn=';

const OE_ROW_PREP_BROKEN_NEEDLE =
  'Xr=fo(G);const tsRowLogo=_l(G),tsRowHasLogo=tsRowLogo?"1":"0",tsRowRating=tsPrimaryPlaceStarRating(ha(G)),tsRowStars=tsRenderStarRatingHtml(tsRowRating);return Sa?';

const OE_ROW_PREP_BROKEN_PATCH = 'Xr=fo(G);const tsRowLogo=_l(G),tsRowHasLogo=tsRowLogo?"1":"0";return Sa?';

const OE_ROW_TITLE_NEEDLE =
  'sr=n.jsxs("span",{style:{display:"grid",gridTemplateColumns:"28px minmax(0, 1fr)",gap:9,alignItems:"center",width:"100%",minWidth:0},children:[n.jsx(dc,{item:G}),n.jsx("span",{"data-ts-list-row-name":"1",style:{minWidth:0,maxWidth:"100%",width:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:Zn})]})';

const OE_ROW_TITLE_PATCH =
  'sr=n.jsxs("span",{style:{display:"grid",gridTemplateColumns:"28px minmax(0, 1fr)",gap:9,alignItems:"center",width:"100%",minWidth:0},children:[n.jsx(dc,{item:G}),n.jsxs("span",{style:{minWidth:0,maxWidth:"100%",width:"100%",display:"flex",flexDirection:"column",gap:2},children:[n.jsx("span",{"data-ts-list-row-name":"1",style:{minWidth:0,maxWidth:"100%",width:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"},children:Zn}),tsRowStars?n.jsx("span",{"data-ts-list-row-rating":"1",dangerouslySetInnerHTML:{__html:tsRowStars},role:"img","aria-label":tsStarRatingAria(tsRowRating)}):null]})]})';

const DETAIL_RATING_GRID_NEEDLE =
  '[["googleRating","Google rating"],["yelpRating","Yelp rating"],["thirdPartyRating","Other rating"]].map(([k,label])=>n.jsxs("label",{style:Hn,children:[label,n.jsx("input",{value:No(Dt,k),onChange:G=>Xa(Dt,k,G.target.value),placeholder:"",style:De})]},k))';

const DETAIL_RATING_GRID_PATCH =
  '[["googleRating","Google rating"],["yelpRating","Yelp rating"],["thirdPartyRating","Other rating"]].map(([k,label])=>{const rv=No(Dt,k),stars=tsRenderStarRatingHtml(rv);if(!stars)return null;return n.jsxs("label",{style:Hn,children:[label,n.jsx("div",{"data-ts-detail-rating-stars":"1",style:{display:"flex",alignItems:"center",minHeight:28},dangerouslySetInnerHTML:{__html:stars},role:"img","aria-label":tsStarRatingAria(rv)}),n.jsx("input",{value:rv,onChange:G=>Xa(Dt,k,G.target.value),placeholder:"",style:{...De,position:"absolute",opacity:0,width:1,height:1,padding:0,border:0,pointerEvents:Ce?"auto":"none"},tabIndex:Ce?0:-1,"aria-hidden":Ce?void 0:"true"})]},k)}).filter(Boolean)';

const REVIEW_INPUT_NEEDLE =
  'children:[n.jsx("input",{value:No(Dt,`review${G}Rating`),onChange:Re=>Xa(Dt,`review${G}Rating`,Re.target.value),placeholder:"Star rating",style:De}),n.jsx("textarea"';

const REVIEW_INPUT_PATCH =
  'children:[n.jsx("div",{"data-ts-review-stars":"1",style:{display:"flex",alignItems:"center",minHeight:36},dangerouslySetInnerHTML:{__html:tsRenderStarRatingHtml(No(Dt,`review${G}Rating`))},role:"img","aria-label":tsStarRatingAria(No(Dt,`review${G}Rating`))}),n.jsx("input",{value:No(Dt,`review${G}Rating`),onChange:Re=>Xa(Dt,`review${G}Rating`,Re.target.value),placeholder:"Star rating",style:{...De,position:"absolute",opacity:0,width:1,height:1,padding:0,border:0,pointerEvents:Ce?"auto":"none"},tabIndex:Ce?0:-1,"aria-hidden":Ce?void 0:"true"}),n.jsx("textarea"';

const REVIEW_CSS_NEEDLE = '.review-stars-inline{font-size:10px;letter-spacing:.2px;color:#f59e0b;font-weight:900;white-space:nowrap}';

function injectStarHelpers(js) {
  if (js.includes('tsRenderStarRatingHtml=v=>')) return js;
  const inject = trekStarRatingBundleInject();
  if (js.includes(HA_SCOPE_NEEDLE)) {
    return js.replace(HA_SCOPE_NEEDLE, `ha=G=>tsFillOv(le[Qt(G)]||{},G),${inject},tsDetailCapturePayload=Dt=>{`);
  }
  if (js.includes(HA_SCOPE_NEEDLE_BEFORE_CAPTURE)) {
    return js.replace(HA_SCOPE_NEEDLE_BEFORE_CAPTURE, `ha=G=>tsFillOv(le[Qt(G)]||{},G),${inject},Sn=`);
  }
  throw new Error('trek bundle missing ha= scope for star rating inject');
}

export function patchStarRatings(source = '') {
  let js = String(source || '');
  js = injectStarHelpers(js);
  if (js.includes(LR_NEEDLE)) {
    js = js.replace(LR_NEEDLE, LR_PATCH);
  } else if (js.includes(LR_V2_NEEDLE)) {
    js = js.replace(LR_V2_NEEDLE, LR_PATCH);
  }
  if (js.includes(OE_ROW_PREP_BROKEN_NEEDLE)) {
    js = js.replace(OE_ROW_PREP_BROKEN_NEEDLE, OE_ROW_PREP_BROKEN_PATCH);
  }
  if (js.includes(OE_ROW_VARS_NEEDLE)) {
    js = js.replace(OE_ROW_VARS_NEEDLE, OE_ROW_VARS_PATCH);
  }
  if (js.includes(OE_ROW_TITLE_NEEDLE)) {
    js = js.replace(OE_ROW_TITLE_NEEDLE, OE_ROW_TITLE_PATCH);
  }
  if (js.includes(DETAIL_RATING_GRID_NEEDLE)) {
    js = js.replace(DETAIL_RATING_GRID_NEEDLE, DETAIL_RATING_GRID_PATCH);
  }
  if (js.includes(REVIEW_INPUT_NEEDLE)) {
    js = js.replaceAll(REVIEW_INPUT_NEEDLE, REVIEW_INPUT_PATCH);
  }
  if (js.includes(REVIEW_CSS_NEEDLE)) {
    js = js.replace(REVIEW_CSS_NEEDLE, `${TREK_STAR_RATING_CSS}.review-stars-inline{display:none!important}`);
  } else if (!js.includes('.ts-star-rating{display:inline-flex')) {
    js = js.replace(
      '.reviews{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}',
      `.reviews{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}${TREK_STAR_RATING_CSS}`,
    );
  }
  return js;
}
