import { ITINERARY_LINE_BUNDLE } from './itinerary-line.mjs';

const HA_NEEDLE = 'ha=G=>tsFillOv(le[Qt(G)]||{},G),';
const HA_PATCH = `ha=G=>tsFillOv(le[Qt(G)]||{},G),tsItinLine=${ITINERARY_LINE_BUNDLE},`;

export function patchTimelineItineraryNote(source = '') {
  const js = String(source || '');
  if (js.includes(`tsItinLine=${ITINERARY_LINE_BUNDLE}`)) return js;
  if (!js.includes(HA_NEEDLE)) {
    throw new Error('timeline itinerary note patch missed ha()');
  }
  return js.replace(HA_NEEDLE, HA_PATCH);
}
