import { sortIndicator } from '../lib/listTabModel.mjs';

type SortKey = 'name' | 'price';

type Props = {
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
};

export function ListSortBar({ sortKey, sortDir, onSort }: Props) {
  return (
    <div className="tsv-list-sort" data-ts-list-sort-header="1" role="toolbar" aria-label="Sort list">
      {(['name', 'price'] as SortKey[]).map((key) => (
        <button
          key={key}
          type="button"
          className={`tsv-sort-btn${sortKey === key ? ' is-active' : ''}`}
          aria-pressed={sortKey === key}
          data-ts-sort-key={key}
          onClick={() => onSort(key)}
        >
          {key === 'name' ? 'Name' : 'Price'}
          {sortIndicator(sortKey, sortDir, key)}
        </button>
      ))}
    </div>
  );
}
