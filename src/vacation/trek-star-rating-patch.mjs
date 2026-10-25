import { TREK_STAR_RATING_CSS, trekStarRatingBundleInject } from './star-rating-model.mjs';

const HA_SCOPE_NEEDLE = 'ha=G=>tsFillOv(le[Qt(G)]||{},G),tsDetailCapturePayload=Dt=>{';
const HA_SCOPE_NEEDLE_BEFORE_CAPTURE = 'ha=G=>tsFillOv(le[Qt(G)]||{},G),Sn=';

const LR_NEEDLE =
  'Lr=G=>[1,2,3].map(Re=>Ps(G,Re)).filter(Boolean).map(Re=>{const ua=String(Re||"").trim().replace(/^[⭐★☆️\\s]+/,"").replace(/^\\(?\\s*5\\s*stars?\\s*\\)?[:\\-–—]?\\s*/i,"").replace(/^[⭐★☆️\\s]+/,"").trim();return`<div class="review"><span class="review-stars-inline">★★★★★</span> ${an(ua)}</div>`}).join("")';

const LR_PATCH =
  'Lr=G=>[1,2,3,4].map(Re=>{const body=String(Ps(G,Re)||"").trim();if(!body)return "";const stars=tsRenderStarRatingHtml(No(G,`review${Re}Rating`));if(!stars)return "";const ua=body.replace(/^[⭐★☆️\\s]+/,"").replace(/^\\(?\\s*\\d+(?:\\.\\d+)?\\s*stars?\\s*\\)?[:\\-–—]?\\s*/i,"").replace(/^[⭐★☆️\\s]+/,"").trim();return`<div class="review">${stars} ${an(ua)}</div>`}).filter(Boolean).join("")';

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
