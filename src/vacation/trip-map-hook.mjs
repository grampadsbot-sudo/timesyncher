
function publishTsTripMapHook(map, engine) {
  const container = map && typeof map.getContainer === 'function' ? map.getContainer() : null;
  if (!container) return false;
  const center = map.getCenter();
  const zoom = map.getZoom();
  const bounds = map.getBounds();
  const payload = {
    engine,
    center: { lat: center.lat, lng: center.lng },
    zoom,
    bounds: {
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    },
  };
  container.setAttribute('data-ts-map-engine', engine);
  container.setAttribute('data-ts-map-center', `${center.lat},${center.lng}`);
  container.setAttribute('data-ts-map-zoom', String(zoom));
  container.setAttribute(
    'data-ts-map-bounds',
    `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`,
  );
  window.__tsTripMap = payload;
  return true;
}

function bindTsTripMapHookLeaflet(map) {
  if (!map || map.__tsTripMapHookBound) return;
  map.__tsTripMapHookBound = true;
  const sync = () => {
    tsPublishTripMapHook(map, 'leaflet');
  };
  sync();
  map.on('moveend', sync);
  map.on('zoomend', sync);
}

export function tripMapHookBundleSnippet() {
  const publish = publishTsTripMapHook.toString().replace(/\s+/g, ' ').trim();
  const bind = bindTsTripMapHookLeaflet.toString().replace(/\s+/g, ' ').trim();
  return `const tsPublishTripMapHook=(${publish});const tsBindTripMapHookLeaflet=(${bind});`;
}
