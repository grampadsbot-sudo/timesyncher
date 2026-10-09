import { TREK_STATIC_MAP_TILE_HOST } from './trek-default-map-tiles.mjs';

export const XA_STATIC_MAP_TILE_NEEDLE = 'static-map-tile" src="https://tile.openstreetmap.org/';
export const XA_STATIC_MAP_TILE_PATCH = `static-map-tile" src="${TREK_STATIC_MAP_TILE_HOST}/`;

const STATIC_DAY_MAP_PATCH =
  'n.jsx("div",{className:"static-day-map-host",style:{width:"100%",height:"100%",position:"relative",overflow:"hidden"},dangerouslySetInnerHTML:{__html:xa((La||[]).filter(function(G){return G!=null&&G.lat!=null&&G.lng!=null}),dn?Math.max(280,(typeof window!=="undefined"?window.innerWidth:390)-32):1100,dn?420:300)}})';

const LEAFLET_DAY_MAP_RE =
  /n\.jsxs\(gpe,\{center:Ia,zoom:\d+,zoomControl:!1,attributionControl:!1,style:\{width:"100%",height:"100%"\},children:\[n\.jsx\(fpe,\{url:"https:\/\/[^"]+"[^]*?\),n\.jsx\(gDe,\{places:La,fallbackCenter:ba\}\),La\.map\(G=>n\.jsx\(zx,\{position:\[G\.lat,G\.lng\],icon:mDe\(G\),eventHandlers:\{click:\(\)=>Ne\(Qt\(G\)\)\},children:n\.jsx\(eZ,\{children:mr\(G\)\|\|G\.name\}\)\},G\.id\)\)\]\}\)/;

const MAP_OPEN_MARKERS = [
  [
    'n.jsx("div",{style:{borderRadius:16,overflow:"hidden",height:dn?420:300,marginBottom:12',
    'n.jsx("div",{"data-ts-day-map":"1",style:{borderRadius:16,overflow:"hidden",height:dn?420:300,marginBottom:12',
  ],
  [
    'n.jsx("div",{style:{borderRadius:16,overflow:"hidden",height:dn?900:300,marginBottom:12',
    'n.jsx("div",{"data-ts-day-map":"1",style:{borderRadius:16,overflow:"hidden",height:dn?900:300,marginBottom:12',
  ],
];

/** Keepsake `xa()` tiles + static day map below the day itinerary (issue #283). */
export function patchDayByDayKeepsakeMap(source = '', options = {}) {
  const served = options.served === true;
  let js = String(source || '');

  if (js.includes(XA_STATIC_MAP_TILE_NEEDLE)) {
    js = js.replaceAll(XA_STATIC_MAP_TILE_NEEDLE, XA_STATIC_MAP_TILE_PATCH);
  } else if (served && js.includes('static-map-tile" src="https://tile.openstreetmap.org/')) {
    throw new Error('day-by-day map patch missed xa() OpenTopo tile host');
  }

  if (!js.includes('data-ts-day-map":"1"')) {
    let marked = false;
    for (const [needle, patch] of MAP_OPEN_MARKERS) {
      if (js.includes(needle)) {
        js = js.split(needle).join(patch);
        marked = true;
        break;
      }
    }
    if (served && !marked && !js.includes('data-ts-day-map":"1"')) {
      throw new Error('day-by-day map patch missed data-ts-day-map marker');
    }
  }

  if (LEAFLET_DAY_MAP_RE.test(js)) {
    js = js.replace(LEAFLET_DAY_MAP_RE, STATIC_DAY_MAP_PATCH);
  } else if (served && !js.includes('static-day-map-host')) {
    throw new Error('day-by-day map patch missed Leaflet day map block');
  }

  if (served) {
    const planIdx = js.indexOf('q==="plan"&&n.jsxs(n.Fragment');
    const mapIdx = js.indexOf('{"data-ts-day-map":"1"', planIdx);
    const timelineIdx = js.indexOf('data-ts-day-timeline":"1"', planIdx);
    if (planIdx < 0 || mapIdx < 0 || timelineIdx < 0 || mapIdx < timelineIdx) {
      throw new Error('day-by-day map must render below the day itinerary card');
    }
    if (!js.includes('static-day-map-host') || !js.includes(TREK_STATIC_MAP_TILE_HOST)) {
      throw new Error('day-by-day map must use keepsake xa() static OpenTopo tiles');
    }
    if (!js.includes('})(),n.jsx("div",{"data-ts-day-map":"1"')) {
      throw new Error('day-by-day map must follow the selected-day timeline IIFE');
    }
  }

  return js;
}
