import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, Map as LeafletMap, TileLayer as LeafletTileLayer } from 'leaflet';
import type { SharedPlace } from '../types/sharedTrip';
import { placeName } from '../lib/placeHelpers';

type Props = {
  places: SharedPlace[];
  hideHeading?: boolean;
};

function findTileLayer(map: LeafletMap): LeafletTileLayer | null {
  let layer: LeafletTileLayer | null = null;
  map.eachLayer((candidate) => {
    if (layer) return;
    if (typeof (candidate as LeafletTileLayer).getTileUrl === 'function') {
      layer = candidate as LeafletTileLayer;
    }
  });
  return layer;
}

function FitBounds({ boundsKey, places }: { boundsKey: string; places: SharedPlace[] }) {
  const map = useMap();
  useEffect(() => {
    if (places.length < 2) return;
    const bounds: LatLngBoundsExpression = places.map(
      (place) => [place.lat as number, place.lng as number] as [number, number],
    );
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14, animate: false });
    };
    const tileLayer = findTileLayer(map);
    map.whenReady(fit);
    if (!tileLayer) return undefined;
    tileLayer.on('load', fit);
    return () => {
      tileLayer.off('load', fit);
    };
  }, [map, boundsKey, places]);
  return null;
}

export function DayMap({ places, hideHeading = false }: Props) {
  const withCoords = useMemo(
    () => places.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number'),
    [places],
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
        zoomAnimation={false}
        fadeAnimation={false}
        markerZoomAnimation={false}
        className="tsv-map-box"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          updateWhenZooming={false}
        />
        {withCoords.length > 1 ? <FitBounds boundsKey={boundsKey} places={withCoords} /> : null}
        {withCoords.map((place) => (
          <Marker key={String(place.id)} position={[place.lat as number, place.lng as number]}>
            <Popup>{placeName(place)}</Popup>
          </Marker>
        ))}
      </MapContainer>
    </section>
  );
}
