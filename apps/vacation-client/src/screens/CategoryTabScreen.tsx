import { ListRow } from '../components/ListRow';
import { placesForTab } from '../lib/placeHelpers';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';

type Props = {
  trip: SharedTripPayload;
  tab: 'flights' | 'hotels' | 'cars' | 'restaurants' | 'stores' | 'events';
  onOpen: (place: SharedPlace) => void;
};

export function CategoryTabScreen({ trip, tab, onOpen }: Props) {
  const rows = placesForTab(trip, tab);
  return (
    <section className="tsv-screen" data-shared-live-tab={tab}>
      <header className="tsv-screen-head">
        <p className="tsv-muted">Area and type chips — P1 skeleton (filters wired in P2).</p>
      </header>
      {rows.length === 0 ? (
        <p className="tsv-empty">No items in this category yet.</p>
      ) : (
        <ul className="tsv-list">
          {rows.map((place) => (
            <ListRow key={String(place.id)} place={place} trip={trip} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  );
}
