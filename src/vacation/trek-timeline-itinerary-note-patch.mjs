import { ITINERARY_LINE_BUNDLE } from './itinerary-line.mjs';

const HA_NEEDLE = 'ha=G=>tsFillOv(le[Qt(G)]||{},G),';
const PHOTO_ROWS = 'G=>{const logo=_l(G);return fo(G).filter(row=>row&&row.kind!=="video"&&[row.url,row.thumbnailUrl].filter(Boolean).every(src=>src!==logo&&!/favicon|\\.ico(?:[?#]|$)/i.test(src)))}';
const HA_PATCH = `ha=G=>tsFillOv(le[Qt(G)]||{},G),tsItinLine=${ITINERARY_LINE_BUNDLE},tsThingPhotos=${PHOTO_ROWS},`;

export function patchTimelineItineraryNote(source = '') {
  const js = String(source || '');
  if (js.includes(`tsItinLine=${ITINERARY_LINE_BUNDLE}`)) return js;
  if (!js.includes(HA_NEEDLE)) {
    throw new Error('timeline itinerary note patch missed ha()');
  }
  return js.replace(HA_NEEDLE, HA_PATCH).replace(':fo(ua.item);return n.jsxs', ':tsThingPhotos(ua.item);return n.jsxs').replace(
    'return cDe.has(wn.type)&&',
    'const place=wn.place_id&&(Ft.get(wn.place_id)||(Gt||[]).find(row=>String(row.id)===String(wn.place_id)));return (!place||Ds(place))&&cDe.has(wn.type)&&',
  );
}
