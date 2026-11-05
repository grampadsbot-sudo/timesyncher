export function itineraryLineText(bag = {}, place = {}) {
  return String(bag.description ?? place.description ?? '');
}

export const ITINERARY_LINE_BUNDLE =
  'G=>{const bag=ha(G)||{};return String(bag.description??(G&&G.description)??"")}';
