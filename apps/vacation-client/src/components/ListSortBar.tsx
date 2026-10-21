import { sortIndicator } from '../lib/listTabModel.mjs';

type SortKey = 'name' | 'price' | 'catalog';

type Props = {
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
};

const SORT_KEYS: Array<'name' | 'price'> = ['name', 'price'];

export function ListSortBar({ sortKey, sortDir, onSort }: Props) {
  const activeIndex = SORT_KEYS.findIndex((key) => key === sortKey);

  return (
    <div
      className="tsv-list-sort"
      data-ts-list-sort-header="1"
      role="group"
      aria-label="Sort list"
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        const next = (activeIndex + delta + SORT_KEYS.length) % SORT_KEYS.length;
        onSort(SORT_KEYS[next]);
      }}
    >
      {SORT_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className={`tsv-sort-btn${sortKey === key ? ' is-active' : ''}`}
          aria-pressed={sortKey === key}
          onClick={() => onSort(key)}
        >
          {key === 'name' ? 'Name' : 'Price'}
          {sortIndicator(sortKey, sortDir, key)}
        </button>
      ))}
    </div>
  );
}
