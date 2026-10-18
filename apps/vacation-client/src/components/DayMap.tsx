import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { placeCoords } from '../lib/dayTimelineModel.mjs';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
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
  trip?: SharedTripPayload;
  hideHeading?: boolean;
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

function FitBounds({ boundsKey, places }: { boundsKey: string; places: SharedPlace[] }) {
  const map = useMap();
  useEffect(() => {
    if (!places.length) return;
    if (places.length === 1) {
      map.setView([places[0].lat as number, places[0].lng as number], 12);
      publishTripMapHarness(map);
      return;
    }
    const bounds: LatLngBoundsExpression = places.map(
      (place) => [place.lat as number, place.lng as number] as [number, number],
    );
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
    publishTripMapHarness(map);
  }, [map, boundsKey, places]);
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
    const observer = new ResizeObserver(sync);
    observer.observe(map.getContainer());
    return () => {
      map.off('moveend', sync);
      map.off('zoomend', sync);
      map.off('load', sync);
      observer.disconnect();
      delete window.__tsTripMap;
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

export function DayMap({ places, trip, hideHeading = false }: Props) {
  const withCoords = useMemo(
    () => places.flatMap((place) => {
      const coords = placeCoords(place, trip || {});
      return coords ? [{ ...place, ...coords }] : [];
    }),
    [places, trip],
  );
  const boundsKey = useMemo(
    () => withCoords.map((p) => `${p.id}:${p.lat},${p.lng}`).join('|'),
    [withCoords],
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
      {hideHeading ? null : <h2 className="tsv-subhead">Day map</h2>}
      <MapContainer
        center={[center.lat as number, center.lng as number]}
        zoom={12}
        scrollWheelZoom={false}
        className="tsv-map-box"
      >
        <MapReady />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <FitBounds boundsKey={boundsKey} places={withCoords} />
        {withCoords.map((place) => (
          <Marker key={String(place.id)} position={[place.lat as number, place.lng as number]} icon={defaultMarkerIcon}>
            <Popup>{placeName(place)}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </section>
  );
}
