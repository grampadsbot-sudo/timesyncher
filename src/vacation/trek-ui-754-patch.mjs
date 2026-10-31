const CI_RETURN_NEEDLE = '}return js},cr=""';
const CI_RETURN_PATCH =
  '}return js.filter(wn=>{const tp=String(wn.type||"");if(!xn("flights")&&(tp==="flight"||(tp==="travel"&&/airport/i.test(String(wn.title||"")))))return!1;if(!xn("hotels")&&/^hotel-/.test(tp))return!1;if(!xn("cars")&&(Mi(wn.item)||/^(Pickup|Drop-off):/i.test(String(wn.title||""))))return!1;return!0})},cr=""';

export function patchUi754(source = '') {
  let js = String(source || '');
  if (js.includes(CI_RETURN_NEEDLE)) {
    js = js.replace(CI_RETURN_NEEDLE, CI_RETURN_PATCH);
  } else if (!js.includes('return js.filter(wn=>{const tp=String(wn.type||"");if(!xn("flights")')) {
    throw new Error('ui #754 day-by-day Ci() section visibility filter did not apply');
  }
  if (!js.includes('!xn("cars")&&(Mi(wn.item)||/^(Pickup|Drop-off):/i.test(String(wn.title||"")))')) {
    throw new Error('ui #754 cars timeline visibility filter missing');
  }
  return js;
}
