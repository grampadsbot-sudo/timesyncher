import { useMemo, useState } from 'react';
import { FilterChipRow } from '../components/FilterChipRow';
import { ListRow } from '../components/ListRow';
import { ListSortBar } from '../components/ListSortBar';
import {
  areaChipsForTab,
  emptyStateMessage,
  filterPlaces,
  placesForCategoryTab,
  DEFAULT_SORT,
  sortPlaces,
  typeChipsForTab,
} from '../lib/listTabModel.mjs';
import { overrideFor } from '../lib/placeHelpers';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';

type Props = {
  trip: SharedTripPayload;
  tab: 'flights' | 'hotels' | 'cars' | 'restaurants' | 'stores' | 'events';
  onOpen: (place: SharedPlace) => void;
};

type SortKey = 'name' | 'price';

const LIST_SORT_TABS = new Set(['flights', 'hotels', 'cars']);

export function CategoryTabScreen({ trip, tab, onOpen }: Props) {
  const categoryPlaces = useMemo(() => placesForCategoryTab(trip, tab), [trip, tab]);
  const areaChips = useMemo(() => areaChipsForTab(categoryPlaces, trip, tab), [categoryPlaces, trip, tab]);
  const typeChips = useMemo(() => typeChipsForTab(categoryPlaces, trip, tab), [categoryPlaces, trip, tab]);

  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT.key);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(DEFAULT_SORT.dir);
  const [selectedArea, setSelectedArea] = useState('All areas');
  const [selectedType, setSelectedType] = useState('All types');
  const [timeline, setTimeline] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const place of categoryPlaces) {
      const override = overrideFor(trip, place);
      initial[String(place.id)] = Boolean(override.timeline);
    }
    return initial;
  });

  const filtered = useMemo(
    () =>
      filterPlaces(categoryPlaces, trip, tab, {
        area: selectedArea,
        type: selectedType,
      }),
    [categoryPlaces, trip, tab, selectedArea, selectedType],
  );

  const rows = useMemo(
    () => sortPlaces(filtered, trip, { key: sortKey, dir: sortDir }),
    [filtered, trip, sortKey, sortDir],
  );

  const filterActive =
    (areaChips.length > 1 && selectedArea !== 'All areas') ||
    (typeChips.length > 1 && selectedType !== 'All types');

  const emptyCopy = emptyStateMessage(tab, {
    categoryCount: categoryPlaces.length,
    filterActive,
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'price' ? 'asc' : 'asc');
    }
  }

  let firstHotelMarked = false;

  return (
    <section className="tsv-screen tsv-list-screen" data-shared-live-tab={tab}>
      <FilterChipRow
        chips={areaChips}
        selected={selectedArea}
        onSelect={setSelectedArea}
        label="Area filters"
      />
      <FilterChipRow
        chips={typeChips}
        selected={selectedType}
        onSelect={setSelectedType}
        label="Type filters"
      />
      {LIST_SORT_TABS.has(tab) ? (
        <ListSortBar sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
      ) : null}
      {rows.length === 0 ? (
        <p className="tsv-empty" data-ts-list-empty="1">
          {emptyCopy}
        </p>
      ) : (
        <ul className="tsv-list">
          {rows.map((place) => {
            const isFirstHotel = tab === 'hotels' && !firstHotelMarked;
            if (isFirstHotel) firstHotelMarked = true;
            return (
              <ListRow
                key={String(place.id)}
                place={place}
                trip={trip}
                tab={tab}
                onOpen={onOpen}
                isFirstHotel={isFirstHotel}
                timelineChecked={Boolean(timeline[String(place.id)])}
                onTimelineChange={(p, checked) =>
                  setTimeline((prev) => ({ ...prev, [String(p.id)]: checked }))
                }
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
