import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import type { SharedPlace } from '../types/sharedTrip';
import { placeName } from '../lib/placeHelpers';

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
        zoom={12}
        scrollWheelZoom={false}
        className="tsv-map-box"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {withCoords.length > 1 ? <FitBounds places={withCoords} /> : null}
        {withCoords.map((place) => (
          <Marker key={String(place.id)} position={[place.lat as number, place.lng as number]}>
            <Popup>{placeName(place)}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </section>
  );
}
