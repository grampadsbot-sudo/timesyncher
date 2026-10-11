type Props = {
  chips: string[];
  selected: string;
  onSelect: (chip: string) => void;
  label: string;
};

export function FilterChipRow({ chips, selected, onSelect, label }: Props) {
  if (chips.length <= 1) return null;
  return (
    <div className="tsv-chip-row" role="group" aria-label={label}>
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          className={`tsv-chip${selected === chip ? ' is-active' : ''}`}
          aria-pressed={selected === chip}
          onClick={() => onSelect(chip)}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
