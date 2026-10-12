import { useMemo, useState } from 'react';
import { FilterChipRow } from '../components/FilterChipRow';
import { ListRow } from '../components/ListRow';
import { ListSortBar } from '../components/ListSortBar';
import {
  areaChipsForTab,
  emptyStateMessage,
  filterPlaces,
  placesForCategoryTab,
  sortPlaces,
  typeChipsForTab,
} from '../lib/listTabModel.mjs';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';

type Props = {
  trip: SharedTripPayload;
  tab: 'flights' | 'hotels' | 'cars' | 'restaurants' | 'stores' | 'events';
  onOpen: (place: SharedPlace) => void;
  canEdit: boolean;
  timelineChecked: (place: SharedPlace) => boolean;
  onTimelineChange: (place: SharedPlace, checked: boolean) => void;
};

type SortKey = 'name' | 'price';

export function CategoryTabScreen({
  trip,
  tab,
  onOpen,
  canEdit,
  timelineChecked,
  onTimelineChange,
}: Props) {
  const categoryPlaces = useMemo(() => placesForCategoryTab(trip, tab), [trip, tab]);
  const areaChips = useMemo(() => areaChipsForTab(categoryPlaces, trip, tab), [categoryPlaces, trip, tab]);
  const typeChips = useMemo(() => typeChipsForTab(categoryPlaces, trip, tab), [categoryPlaces, trip, tab]);

  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedArea, setSelectedArea] = useState('All areas');
  const [selectedType, setSelectedType] = useState('All types');

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

  const firstHotelId = useMemo(() => {
    if (tab !== 'hotels' || rows.length === 0) return null;
    return String(rows[0].id);
  }, [tab, rows]);

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

  const showTimelineToggle =
    tab === 'flights' || tab === 'hotels' || tab === 'cars';

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
      <ListSortBar sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
      {rows.length === 0 ? (
        <p className="tsv-empty" data-ts-list-empty="1">
          {emptyCopy}
        </p>
      ) : (
        <ul className="tsv-list">
          {rows.map((place) => {
            const isFirstHotel = firstHotelId !== null && String(place.id) === firstHotelId;
            const timelineOn = timelineChecked(place);
            return (
              <ListRow
                key={String(place.id)}
                place={place}
                trip={trip}
                tab={tab}
                onOpen={onOpen}
                isFirstHotel={isFirstHotel}
                showTimelineToggle={showTimelineToggle}
                timelineChecked={timelineOn}
                timelineDisabled={!canEdit}
                onTimelineChange={onTimelineChange}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}
