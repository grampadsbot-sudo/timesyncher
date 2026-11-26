const MAP_WO_LATLNG_NEEDLE = 'Wo=([G,Re])=>G>=-90&&G<=90&&Re>=-180&&Re<=180&&!(G===0&&Re===0)';

const MAP_WO_LATLNG_PATCH = 'Wo=([G,Re])=>tsUsableMapLatLng(G,Re)';

const MAP_XA_PLACEHOLDER_NEEDLE = 'if(!ua.length)return\'<div class="map-placeholder">Map appears when the day has mapped itinerary stops.</div>\'';

const MAP_XA_PLACEHOLDER_PATCH = 'if(!ua.length)return""';

const MAP_GDE_EMPTY_NEEDLE = 'if(e.length===0){i.setView(t,11);return}';

const MAP_GDE_EMPTY_PATCH = 'if(e.length===0){if(t&&Array.isArray(t)&&t.length>=2&&tsUsableMapLatLng(t[0],t[1]))i.setView(t,11);return}';

const DAY_MAP_RENDER_OPEN_NEEDLE = '})(),n.jsx("div",{"data-ts-day-map":"1",style:{borderRadius:16,overflow:"hidden",height:dn?420:300,marginBottom:12,boxShadow:"0 2px 12px rgba(0,0,0,0.08)"},children:n.jsxs(gpe,{center:Ia';

const DAY_MAP_RENDER_OPEN_PATCH = '})(),La.length?n.jsx("div",{"data-ts-day-map":"1",style:{borderRadius:16,overflow:"hidden",height:dn?420:300,marginBottom:12,boxShadow:"0 2px 12px rgba(0,0,0,0.08)"},children:n.jsxs(gpe,{center:Ia';

const DAY_MAP_RENDER_CLOSE_NEEDLE = '})})]}),dn&&(q==="hotels"||q==="restaurants"||q==="stores"||q==="events")';

const DAY_MAP_RENDER_CLOSE_PATCH = '})}):null]}),dn&&(q==="hotels"||q==="restaurants"||q==="stores"||q==="events")';

const MAPBOX_PLACE_LATLNG_NEEDLE = 'if(!Pt.lat||!Pt.lng)return';

const MAPBOX_PLACE_LATLNG_PATCH = 'if(!tsUsableMapLatLng(Pt.lat,Pt.lng))return';

const LEAF_PLACE_LATLNG_NEEDLE = 'g!=null&&g.lat&&(g!=null&&g.lng)&&h.panTo([g.lat,g.lng]';

const LEAF_PLACE_LATLNG_PATCH = 'g!=null&&tsUsableMapLatLng(g.lat,g.lng)&&h.panTo([g.lat,g.lng]';

const STYLE2_DAY_MAP_NEEDLE = '${so(nr)?`<section class="page daily-page daily-map-page" data-style2-map="1" data-day-map-page="1" data-config-map="1"><h2>${an(nr.title||("Day "+nr.day_number))} map</h2><div class="map-box" data-day-map-fill="1">${xa((Ci(nr)||[]).map(row=>row.item).filter(Boolean),1100,1500)}</div></section>`:""}';

const STYLE2_DAY_MAP_AE_INLINE = 'so(nr)?((tsDm)=>tsDm?`<section class="page daily-page daily-map-page" data-style2-map="1" data-day-map-page="1" data-config-map="1"><h2>${an(nr.title||("Day "+nr.day_number))} map</h2><div class="map-box" data-day-map-fill="1">${tsDm}</div></section>`:"")(xa((Ci(nr)||[]).map(row=>row.item).filter(Boolean),1100,1500)):""';

const STYLE2_DAY_MAP_PATCH = `\${${STYLE2_DAY_MAP_AE_INLINE}}`;

const STYLE2_DAY_MAP_FN_LEGACY = 'function tsStyle2DayMapSection(nr,mapOn){if(!mapOn)return"";const tsStyle2DayMap=xa((Ci(nr)||[]).map(row=>row.item).filter(Boolean),1100,1500);if(!tsStyle2DayMap)return"";const dayTitle=an(nr.title||"Day "+nr.day_number);return"<section class=\\"page daily-page daily-map-page\\" data-style2-map=\\"1\\" data-day-map-page=\\"1\\" data-config-map=\\"1\\"><h2>"+dayTitle+" map</h2><div class=\\"map-box\\" data-day-map-fill=\\"1\\">"+tsStyle2DayMap+"</div></section>";}';

const STYLE2_DAY_MAP_CALL_LEGACY = 'tsStyle2DayMapSection(nr,so(nr))';

export function patchMapUsableCoords(source = '', options = {}) {
  const served = options.served === true;
  let js = String(source || '');
  if (!js.includes('tsTripMapInitialView=')) {
    return js;
  }
  if (js.includes(MAP_WO_LATLNG_NEEDLE)) {
    js = js.replace(MAP_WO_LATLNG_NEEDLE, MAP_WO_LATLNG_PATCH);
  } else if (served && js.includes('tsUsableMapLatLng') && !js.includes(MAP_WO_LATLNG_PATCH)) {
    throw new Error('map usable coords patch missed Wo lat/lng guard');
  }
  if (js.includes(MAP_XA_PLACEHOLDER_NEEDLE)) {
    js = js.replace(MAP_XA_PLACEHOLDER_NEEDLE, MAP_XA_PLACEHOLDER_PATCH);
  } else if (served && js.includes('Map appears when the day has mapped itinerary stops.')) {
    throw new Error('map usable coords patch missed xa() keepsake placeholder');
  }
  if (js.includes(MAP_GDE_EMPTY_NEEDLE)) {
    js = js.replace(MAP_GDE_EMPTY_NEEDLE, MAP_GDE_EMPTY_PATCH);
  }
  if (js.includes(MAPBOX_PLACE_LATLNG_NEEDLE)) {
    js = js.replaceAll(MAPBOX_PLACE_LATLNG_NEEDLE, MAPBOX_PLACE_LATLNG_PATCH);
  }
  if (js.includes(LEAF_PLACE_LATLNG_NEEDLE)) {
    js = js.replace(LEAF_PLACE_LATLNG_NEEDLE, LEAF_PLACE_LATLNG_PATCH);
  }
  if (js.includes(STYLE2_DAY_MAP_NEEDLE)) {
    js = js.replace(STYLE2_DAY_MAP_NEEDLE, STYLE2_DAY_MAP_PATCH);
  } else if (served && js.includes('data-style2-map="1"') && !js.includes('(tsDm)=>')) {
    throw new Error('map usable coords patch missed style2 day map conditional');
  }
  if (js.includes(STYLE2_DAY_MAP_CALL_LEGACY)) {
    js = js.replaceAll(STYLE2_DAY_MAP_CALL_LEGACY, STYLE2_DAY_MAP_AE_INLINE);
  }
  if (js.includes(STYLE2_DAY_MAP_FN_LEGACY)) {
    js = js.replace(STYLE2_DAY_MAP_FN_LEGACY, '');
  }
  if (served) {
    if (!js.includes('tsUsableMapLatLng')) {
      throw new Error('map usable coords patch missing tsUsableMapLatLng export');
    }
    if (js.includes('Map appears when the day has mapped itinerary stops.')) {
      throw new Error('served bundle still contains keepsake day map placeholder');
    }
    if (js.includes('function tsStyle2DayMapSection')) {
      throw new Error('served bundle must not hoist tsStyle2DayMapSection outside Ae()');
    }
  }
  return js;
}

export function patchDayMapConditionalRender(source = '', options = {}) {
  const served = options.served === true;
  let js = String(source || '');
  if (!js.includes('tsUsableMapLatLng')) {
    return js;
  }
  if (!js.includes(DAY_MAP_RENDER_OPEN_NEEDLE)) {
    if (served && js.includes('data-ts-day-map":"1"') && !js.includes('La.length?n.jsx("div",{"data-ts-day-map"')) {
      throw new Error('map usable coords patch missed day map conditional render');
    }
    return js;
  }
  if (!js.includes(DAY_MAP_RENDER_CLOSE_NEEDLE)) {
    throw new Error('map usable coords patch missed day map close anchor');
  }
  js = js.replace(DAY_MAP_RENDER_OPEN_NEEDLE, DAY_MAP_RENDER_OPEN_PATCH);
  js = js.replace(DAY_MAP_RENDER_CLOSE_NEEDLE, DAY_MAP_RENDER_CLOSE_PATCH);
  return js;
}