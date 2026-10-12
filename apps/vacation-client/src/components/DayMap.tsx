import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type { SharedPlace } from '../types/sharedTrip';
import { placeName } from '../lib/placeHelpers';

const defaultMarkerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type Props = {
  places: SharedPlace[];
};

function publishTripMapHarness(map: L.Map) {
  const container = map.getContainer();
  const center = map.getCenter();
  const bounds = map.getBounds();
  container.setAttribute('data-ts-map-engine', 'leaflet');
  container.setAttribute('data-ts-map-center', `${center.lat},${center.lng}`);
  container.setAttribute('data-ts-map-zoom', String(map.getZoom()));
  container.setAttribute(
    'data-ts-map-bounds',
    `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`,
  );
  window.__tsTripMap = {
    engine: 'leaflet',
    center: { lat: center.lat, lng: center.lng },
    zoom: map.getZoom(),
    bounds: {
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    },
  };
}

function FitBounds({ places }: { places: SharedPlace[] }) {
  const map = useMap();
  useEffect(() => {
    if (places.length < 2) return;
    const bounds: LatLngBoundsExpression = places.map(
      (place) => [place.lat as number, place.lng as number] as [number, number],
    );
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
    publishTripMapHarness(map);
  }, [map, places]);
  return null;
}

function MapReady() {
  const map = useMap();
  useEffect(() => {
    const sync = () => {
      map.invalidateSize();
      publishTripMapHarness(map);
    };
    sync();
    map.on('moveend', sync);
    map.on('zoomend', sync);
    map.on('load', sync);
    const timers = [120, 400, 900, 1800].map((ms) => window.setTimeout(sync, ms));
    return () => {
      map.off('moveend', sync);
      map.off('zoomend', sync);
      map.off('load', sync);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [map]);
  return null;
}

declare global {
  interface Window {
    __tsTripMap?: {
      engine: string;
      center: { lat: number; lng: number };
      zoom: number;
      bounds?: { south: number; west: number; north: number; east: number };
    };
  }
}

export function DayMap({ places }: Props) {
  const withCoords = places.filter(
    (p) => typeof p.lat === 'number' && typeof p.lng === 'number',
  );
  if (!withCoords.length) {
    return (
      <section className="tsv-day-map tsv-day-map--empty" data-ts-day-map="1">
        <p className="tsv-muted">Map appears when places include coordinates.</p>
      </section>
    );
  }
  const center = withCoords[0];
  return (
    <section className="tsv-day-map" data-ts-day-map="1">
      <h2 className="tsv-subhead">Day map</h2>
      <MapContainer
        center={[center.lat as number, center.lng as number]}
        zoom={11}
        scrollWheelZoom={false}
        className="tsv-map-box"
      >
        <MapReady />
        <TileLayer
          attribution='Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)'
          url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
        />
        {withCoords.length > 1 ? <FitBounds places={withCoords} /> : null}
        {withCoords.map((place) => (
          <Marker
            key={String(place.id)}
            position={[place.lat as number, place.lng as number]}
            icon={defaultMarkerIcon}
          >
            <Popup>{placeName(place)}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </section>
  );
}
