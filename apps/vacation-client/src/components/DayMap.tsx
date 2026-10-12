import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import type { SharedPlace } from '../types/sharedTrip';
import { placeName } from '../lib/placeHelpers';

const defaultMarkerIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

type Props = {
  places: SharedPlace[];
};

function FitBounds({ places }: { places: SharedPlace[] }) {
  const map = useMap();
  useEffect(() => {
    if (places.length < 2) return;
    const bounds: LatLngBoundsExpression = places.map(
      (place) => [place.lat as number, place.lng as number] as [number, number],
    );
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  }, [map, places]);
  return null;
}

function MapReady() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const timers = [120, 400, 900].map((ms) => window.setTimeout(() => map.invalidateSize(), ms));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [map]);
  return null;
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
