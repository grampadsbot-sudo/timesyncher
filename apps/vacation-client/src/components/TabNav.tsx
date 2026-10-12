import type { TabId } from '../types/sharedTrip';
import type { SharedTripPayload } from '../types/sharedTrip';
import { TAB_ICONS, TAB_LABELS, visibleTabsForTrip } from '../lib/tabNavModel.mjs';
import { TabEmojiIcon } from './TabEmojiIcon';

type Props = {
  active: TabId;
  trip: SharedTripPayload;
  permissions?: SharedTripPayload['permissions'];
  onChange: (tab: TabId) => void;
};

export function TabNav({ active, trip, permissions, onChange }: Props) {
  const tabs = visibleTabsForTrip(trip, permissions);

  return (
    <nav className="tsv-tabs" aria-label="Itinerary sections">
      {tabs.map((tab) => {
        const label = TAB_LABELS[tab];
        const isActive = tab === active;
        return (
          <button
            key={tab}
            type="button"
            className={isActive ? 'tsv-tab is-active' : 'tsv-tab'}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(tab)}
          >
            <TabEmojiIcon emoji={TAB_ICONS[tab]} tabId={tab} isActive={isActive} />
            <span className="tsv-tab-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export { visibleTabsForTrip as TAB_ORDER };
