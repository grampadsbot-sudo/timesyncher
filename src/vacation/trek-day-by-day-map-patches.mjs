import { TREK_STATIC_MAP_TILE_HOST } from './trek-default-map-tiles.mjs';

export const XA_STATIC_MAP_TILE_NEEDLE = 'static-map-tile" src="https://tile.openstreetmap.org/';
export const XA_STATIC_MAP_TILE_PATCH = `static-map-tile" src="${TREK_STATIC_MAP_TILE_HOST}/`;

const DAY_MAP_LEAFLET_TILE_NEEDLE =
  'gpe,{center:Ia,zoom:11,zoomControl:!1,attributionControl:!1,style:{width:"100%",height:"100%"},children:[n.jsx(fpe,{url:"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"';

const DAY_MAP_LEAFLET_TILE_PATCH =
  'gpe,{center:Ia,zoom:11,zoomControl:!1,attributionControl:!1,style:{width:"100%",height:"100%"},children:[n.jsx(fpe,{url:"https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"';

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

/** OpenTopo on keepsake `xa()` + live day Leaflet (issue #283); keep Leaflet DOM for Gate B vs base. */
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

  if (js.includes(DAY_MAP_LEAFLET_TILE_NEEDLE)) {
    js = js.split(DAY_MAP_LEAFLET_TILE_NEEDLE).join(DAY_MAP_LEAFLET_TILE_PATCH);
  } else if (served && js.includes('gpe,{center:Ia,zoom:11') && !js.includes('tile.opentopomap.org')) {
    throw new Error('day-by-day map patch missed Leaflet OpenTopo tile layer');
  }

  if (served) {
    const planIdx = js.indexOf('q==="plan"&&n.jsxs(n.Fragment');
    const mapIdx = js.indexOf('{"data-ts-day-map":"1"', planIdx);
    const timelineIdx = js.indexOf('data-ts-day-timeline":"1"', planIdx);
    if (planIdx < 0 || mapIdx < 0 || timelineIdx < 0 || mapIdx < timelineIdx) {
      throw new Error('day-by-day map must render below the day itinerary card');
    }
    if (!js.includes('gpe,{center:Ia,zoom:11') || !js.includes('tile.opentopomap.org')) {
      throw new Error('day-by-day map must use Leaflet with OpenTopo tiles');
    }
    if (!js.includes('})(),n.jsx("div",{"data-ts-day-map":"1"')) {
      throw new Error('day-by-day map must follow the selected-day timeline IIFE');
    }
  }

  return js;
}
