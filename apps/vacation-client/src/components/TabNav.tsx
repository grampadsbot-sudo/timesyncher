import type { TabId } from '../types/sharedTrip';
import { TAB_ICONS, TAB_LABELS, TAB_ORDER } from '../lib/tabNavModel.mjs';
import { TabEmojiIcon } from './TabEmojiIcon';

type Props = {
  active: TabId;
  onChange: (tab: TabId) => void;
};

export function TabNav({ active, onChange }: Props) {
  return (
    <nav className="tsv-tabs" aria-label="Itinerary sections">
      {TAB_ORDER.map((tab) => {
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

export { TAB_ORDER };
