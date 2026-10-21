import { useState } from 'react';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import { logoS2FallbackUrlForPlace, logoUrlForPlace } from '../lib/listTabModel.mjs';

type Props = {
  place: SharedPlace;
  trip: SharedTripPayload;
  className: string;
  loading?: 'lazy' | 'eager';
  onGiveUp?: () => void;
};

export function PlaceLogoImg({ place, trip, className, loading, onGiveUp }: Props) {
  const primary = logoUrlForPlace(place, trip);
  const s2 = logoS2FallbackUrlForPlace(place, trip);
  const initial = primary || s2;
  const [src, setSrc] = useState(initial);
  const [hide, setHide] = useState(!initial);

  if (hide) return null;

  return (
    <img
      className={className}
      src={src}
      alt=""
      loading={loading}
      onError={() => {
        if (s2 && src !== s2) {
          setSrc(s2);
          return;
        }
        setHide(true);
        onGiveUp?.();
      }}
    />
  );
}
