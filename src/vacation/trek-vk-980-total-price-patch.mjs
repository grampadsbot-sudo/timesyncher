import { travelTotalPriceBundleFn } from './thing-travel-total-price.mjs';

const IE_NEEDLE = 'ie=G=>{var ua,Rn;const Re=bi(G);if(typeof Re=="number"&&Number.isFinite(Re))return`$${Math.round(Re).toLocaleString()}`;const zt=String(Re||"");return((Rn=(ua=zt.match(/\\$\\s?\\d[\\d,]*/))==null?void 0:ua[0])==null?void 0:Rn.replace(/\\s+/g,""))||(/quote\\s*tbd/i.test(zt)?"":"")}';
const IE_PATCH = 'ie=G=>tsThingTravelTotalLabel(G,la,cn)';

const LIST_PRICE_SUFFIX_NEEDLE = 'children:bn(G)?eu(G)[1]:ie(G)?ie(G)+(Zi(G)?" / night":" total"):""';
const LIST_PRICE_SUFFIX_PATCH = 'children:bn(G)?eu(G)[1]:(Zi(G)||Mi(G))?tsThingTravelTotalLabel(G,la,cn):ie(G)?ie(G):""';

const BUDGET_ZT_NEEDLE = 'zt=di=>{const Xi=String(bi(di)||""),go=Array.from(Xi.matchAll(/\\$?([0-9][0-9,]*(?:\\.\\d+)?)/g)).map(au=>Number(au[1].replace(/,/g,""))).filter(au=>Number.isFinite(au));if(!go.length)return 0;let fr=go.length>=2?(go[0]+go[1])/2:go[0];const Ul=Xi.toLowerCase();return(It(di)==="hotel"||/night/.test(Ul))&&(fr=fr*Math.max(1,xi(di))),(/per person|pp|fare|ticket|flight/.test(Ul)||["restaurant","store","event","family_event","tour","transport","music","workout","artist","theatre","sightseeing","other","flight"].includes(It(di)))&&(fr=fr*2),Math.round(fr)}';
const BUDGET_ZT_PATCH = 'zt=di=>{const row=tsThingTravelTotalAmount(di,la,cn);return row?row.amount:(()=>{const Xi=String(bi(di)||""),go=Array.from(Xi.matchAll(/\\$?([0-9][0-9,]*(?:\\.\\d+)?)/g)).map(au=>Number(au[1].replace(/,/g,""))).filter(au=>Number.isFinite(au));if(!go.length)return 0;let fr=go.length>=2?(go[0]+go[1])/2:go[0];const Ul=Xi.toLowerCase();return(/per person|pp|fare|ticket|flight/.test(Ul)||["restaurant","store","event","family_event","tour","transport","music","workout","artist","theatre","sightseeing","other","flight"].includes(It(di)))&&(fr=fr*2),Math.round(fr)})()}';

const RATING_ROW_964_PRICE_NEEDLE =
  'const tsHeadStars=tsRenderStarRatingHtml(tsPrimaryPlaceStarRating(ha(Dt)));const d=ha(Dt)||{};const raw=String(d.price??"").trim();const unit=typeof d.price==="number"?d.price:Number(raw.replace(/[^0-9.]/g,""));const tsPriceHas=Number.isFinite(unit)&&unit>0;return tsHeadStars||tsPriceHas?n.jsxs("div",{"data-ts-detail-rating-row":"1",style:{display:"flex",flexDirection:"row",flexWrap:"nowrap"';
const RATING_ROW_964_PRICE_PATCH =
  'const tsHeadStars=tsRenderStarRatingHtml(tsPrimaryPlaceStarRating(ha(Dt)));const d=ha(Dt)||{};const tsTot=typeof tsThingTravelTotalAmount!="undefined"?tsThingTravelTotalAmount(Dt,la,cn):null;const raw=String(d.price??"").trim();const rawUnit=typeof d.price==="number"?d.price:Number(raw.replace(/[^0-9.]/g,""));const unit=tsTot?tsTot.amount:(Number.isFinite(rawUnit)&&rawUnit>0?rawUnit:NaN);const tsPriceHas=Number.isFinite(unit)&&unit>0;return tsHeadStars||tsPriceHas?n.jsxs("div",{"data-ts-detail-rating-row":"1",style:{display:"flex",flexDirection:"row",flexWrap:"nowrap"';

const PRICE_EDIT_NEEDLE = 'onChange:G=>Xa(Dt,"price",G.target.value)';
const PRICE_EDIT_PATCH = 'onChange:G=>{Xa(Dt,"price",G.target.value);Xa(Dt,"priceIsTotal",true)}';

const INJECT_BEFORE = 'ie=G=>{var ua,Rn;const Re=bi(G)';

export function patchVk980TotalPrice(source = '') {
  let js = String(source || '');
  const helpers = travelTotalPriceBundleFn();
  if (!js.includes('tsThingTravelTotalAmount=function')) {
    if (!js.includes(INJECT_BEFORE)) throw new Error('vk980 total price inject anchor missing');
    js = js.replace(INJECT_BEFORE, `${helpers},${INJECT_BEFORE}`);
  }
  if (js.includes(IE_NEEDLE)) {
    js = js.replace(IE_NEEDLE, IE_PATCH);
  } else if (!js.includes('ie=G=>tsThingTravelTotalLabel(G,la,cn)')) {
    throw new Error('vk980 ie() patch did not apply');
  }
  if (js.includes(LIST_PRICE_SUFFIX_NEEDLE)) {
    js = js.replaceAll(LIST_PRICE_SUFFIX_NEEDLE, LIST_PRICE_SUFFIX_PATCH);
  } else if (!js.includes(LIST_PRICE_SUFFIX_PATCH)) {
    throw new Error('vk980 list price suffix patch did not apply');
  }
  if (js.includes(BUDGET_ZT_NEEDLE)) {
    js = js.replace(BUDGET_ZT_NEEDLE, BUDGET_ZT_PATCH);
  } else if (!js.includes(BUDGET_ZT_PATCH.slice(0, 40))) {
    throw new Error('vk980 budget zt patch did not apply');
  }
  if (js.includes(RATING_ROW_964_PRICE_NEEDLE)) {
    js = js.replace(RATING_ROW_964_PRICE_NEEDLE, RATING_ROW_964_PRICE_PATCH);
  } else if (!js.includes('const tsTot=typeof tsThingTravelTotalAmount')) {
    throw new Error('vk980 detail rating row patch did not apply');
  }
  if (js.includes(PRICE_EDIT_NEEDLE)) {
    js = js.replaceAll(PRICE_EDIT_NEEDLE, PRICE_EDIT_PATCH);
  }
  return js;
}
