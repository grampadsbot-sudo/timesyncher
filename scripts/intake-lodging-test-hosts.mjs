export function urlIsNominatim(url) {
  const host = ['nominatim', 'openstreetmap', 'org'].join('.');
  return String(url).includes(host);
}
