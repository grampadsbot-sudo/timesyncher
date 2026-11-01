const CI_RETURN_NEEDLE = '}return js},cr=""';
const CI_RETURN_PATCH =
  '}return js.filter(wn=>{const tp=String(wn.type||"");if(!xn("flights")&&(tp==="flight"||bn(wn.item)||(tp==="travel"&&/airport/i.test(String(wn.title||"")))))return!1;if(!xn("hotels")&&/^hotel-/.test(tp))return!1;if(!xn("cars")&&(Mi(wn.item)||/^(Pickup|Drop-off):/i.test(String(wn.title||""))))return!1;return!0})},cr=""';

const NT_NEEDLE =
  'Nt=(G,Re)=>{Ce&&(ge(!0),pe(zt=>({...zt,[Pi]:{...zt[Pi]||{},[G]:Re}})),!Re&&q===G&&W("plan"))}';
const NT_PATCH =
  'Nt=(G,Re)=>{Ce&&ge(!0);const tsVis={...le[Pi]||{},[G]:Re};pe(zt=>({...zt,[Pi]:tsVis}));try{if(r&&!Ce)window.localStorage.setItem(`timesyncher-section-visibility:${r}`,JSON.stringify(tsVis))}catch{}!Re&&q===G&&W("plan")}';

const VIEWER_SECTION_LOAD_NEEDLE =
  'I.useEffect(()=>{if(!(!r||Ce||He))try{window.localStorage.removeItem(`timesyncher-travel-overrides:${r}`)}catch{}},[r,Ce,He]),I.useEffect(()=>{if(!r||!te||!xe||!Ce)return;';
const VIEWER_SECTION_LOAD_PATCH =
  'I.useEffect(()=>{if(!(!r||Ce||He))try{window.localStorage.removeItem(`timesyncher-travel-overrides:${r}`)}catch{}},[r,Ce,He]),I.useEffect(()=>{if(!r||!te||Ce||He)return;try{const raw=window.localStorage.getItem(`timesyncher-section-visibility:${r}`);if(!raw)return;const sv=JSON.parse(raw);if(!sv||typeof sv!=="object")return;pe(G=>({...G,__sectionVisibility:{...G.__sectionVisibility||{},...sv}}))}catch{}},[r,te,Ce,He]),I.useEffect(()=>{if(!r||!te||!xe||!Ce)return;';

import { patchUi691RestaurantTags } from './trek-ui-691-restaurant-tags-patch.mjs';

export function patchUi754(source = '') {
  let js = String(source || '');
  if (js.includes(CI_RETURN_NEEDLE)) {
    js = js.replace(CI_RETURN_NEEDLE, CI_RETURN_PATCH);
  } else if (!js.includes('return js.filter(wn=>{const tp=String(wn.type||"");if(!xn("flights")&&(tp==="flight"||bn(wn.item)')) {
    throw new Error('ui #754 day-by-day Ci() section visibility filter did not apply');
  }
  if (!js.includes('!xn("cars")&&(Mi(wn.item)||/^(Pickup|Drop-off):/i.test(String(wn.title||"")))')) {
    throw new Error('ui #754 cars timeline visibility filter missing');
  }
  if (js.includes(NT_NEEDLE)) {
    js = js.replace(NT_NEEDLE, NT_PATCH);
  } else if (!js.includes('timesyncher-section-visibility:${r}')) {
    throw new Error('ui #754 shared trip-view Nt() viewer toggle patch did not apply');
  }
  if (js.includes(VIEWER_SECTION_LOAD_NEEDLE)) {
    js = js.replace(VIEWER_SECTION_LOAD_NEEDLE, VIEWER_SECTION_LOAD_PATCH);
  } else if (!js.includes('getItem(`timesyncher-section-visibility:${r}`)')) {
    throw new Error('ui #754 shared trip-view localStorage hydrate patch did not apply');
  }
  return patchUi691RestaurantTags(js);
}
