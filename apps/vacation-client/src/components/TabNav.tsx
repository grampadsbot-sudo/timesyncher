import type { TabId } from '../types/sharedTrip';
import { TAB_LABELS } from '../types/sharedTrip';

type Props = {
  active: TabId;
  onChange: (tab: TabId) => void;
};

const ORDER: TabId[] = [
  'day-by-day',
  'flights',
  'hotels',
  'cars',
  'restaurants',
  'stores',
  'events',
  'budget',
];

export function TabNav({ active, onChange }: Props) {
  return (
    <nav className="tsv-tabs" aria-label="Itinerary sections">
      {ORDER.map((tab) => (
        <button
          key={tab}
          type="button"
          className={tab === active ? 'tsv-tab is-active' : 'tsv-tab'}
          aria-current={tab === active ? 'page' : undefined}
          onClick={() => onChange(tab)}
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
    </nav>
  );
}
