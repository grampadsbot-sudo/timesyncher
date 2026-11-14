export const GET_SHARED_TRIP_NEEDLE =
  'getSharedTrip:e=>Rt.get(`/shared/${e}`,{params:{_ts:Date.now()},headers:{"Cache-Control":"no-cache"}}).then(t=>t.data)';

export const GET_SHARED_TRIP_PATCH =
  'getSharedTrip:e=>{const tok=String(e||"").trim();const boot=typeof window<"u"?window.__TS_SHARED_BOOT_TRIP__:null;const bootTok=typeof window<"u"?String(window.__TS_SHARED_BOOT_SLUG__||"").trim():"";if(boot&&tok&&(!bootTok||bootTok===tok)&&Array.isArray(boot.places))return Promise.resolve(boot);return Rt.get(`/shared/${e}/`).then(t=>t.data)}';

export function patchSharedTripBootFetch(source = '') {
  let js = String(source || '');
  if (!js.includes('getSharedTrip:')) return js;
  if (js.includes(GET_SHARED_TRIP_NEEDLE)) {
    js = js.replace(GET_SHARED_TRIP_NEEDLE, GET_SHARED_TRIP_PATCH);
  } else if (!js.includes('window.__TS_SHARED_BOOT_TRIP__') || !js.includes('`/shared/${e}/`')) {
    throw new Error('shared trip getSharedTrip boot-fetch patch did not apply');
  }
  return js;
}
