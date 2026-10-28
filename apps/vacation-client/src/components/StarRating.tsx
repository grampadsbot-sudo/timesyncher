import { useId } from 'react';
import {
  buildStarRatingStates,
  roundStarRatingToHalf,
  starRatingAccessibilityLabel,
} from '../lib/starRatingModel.mjs';

type Props = {
  value: number | null | undefined;
  className?: string;
};

const STAR_PATH =
  'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

function StarGlyph({ state, halfClipId }: { state: 'full' | 'half' | 'empty'; halfClipId: string }) {
  if (state === 'full') {
    return (
      <svg className="tsv-star tsv-star-full" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d={STAR_PATH} fill="currentColor" />
      </svg>
    );
  }
  if (state === 'empty') {
    return (
      <svg className="tsv-star tsv-star-empty" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d={STAR_PATH} fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className="tsv-star tsv-star-half" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <defs>
        <clipPath id={halfClipId}>
          <rect x="0" y="0" width="12" height="24" />
        </clipPath>
      </defs>
      <path className="tsv-star-half-empty" d={STAR_PATH} fill="currentColor" />
      <path
        className="tsv-star-half-full"
        d={STAR_PATH}
        fill="currentColor"
        clipPath={`url(#${halfClipId})`}
      />
    </svg>
  );
}

export function StarRating({ value, className }: Props) {
  const halfClipId = useId().replace(/:/g, '');
  const rounded = roundStarRatingToHalf(value);
  const states = buildStarRatingStates(rounded);
  if (!states) return null;
  const label = starRatingAccessibilityLabel(rounded);
  const classes = ['tsv-star-rating', className].filter(Boolean).join(' ');
  return (
    <span className={classes} role="img" aria-label={label} title={label}>
      {states.map((state: 'full' | 'half' | 'empty', index: number) => (
        <StarGlyph key={`${state}-${index}`} state={state} halfClipId={`${halfClipId}-${index}`} />
      ))}
    </span>
  );
}
