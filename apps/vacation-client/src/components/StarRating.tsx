import { useId } from 'react';
import {
  parseRatingNumber,
  ratingStarFillStates,
  ratingStarsAriaLabel,
} from '../lib/ratingStars.mjs';

type Props = {
  value: number | string | null | undefined;
  className?: string;
};

function StarIcon({
  state,
  halfFillId,
}: {
  state: 'full' | 'half' | 'empty';
  halfFillId: string;
}) {
  const fill = state === 'full' ? '#f59e0b' : state === 'half' ? `url(#${halfFillId})` : 'transparent';
  return (
    <svg
      className={`tsv-star tsv-star--${state}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 2.5l2.86 5.8 6.39.93-4.62 4.5 1.09 6.35L12 17.77l-5.72 3.01 1.09-6.35-4.62-4.5 6.39-.93L12 2.5z"
        fill={fill}
        stroke="#f59e0b"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StarRating({ value, className = '' }: Props) {
  const halfFillId = useId().replace(/:/g, '');
  const numeric = typeof value === 'number' ? value : parseRatingNumber(value);
  if (numeric == null) return null;
  const label = ratingStarsAriaLabel(numeric);
  const states = ratingStarFillStates(numeric);
  const classes = ['tsv-star-rating', className].filter(Boolean).join(' ');
  return (
    <span className={classes} role="img" aria-label={label} title={label}>
      <svg width="0" height="0" className="tsv-star-defs" aria-hidden="true">
        <defs>
          <linearGradient id={halfFillId}>
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="transparent" />
          </linearGradient>
        </defs>
      </svg>
      {states.map((state, index) => (
        <StarIcon key={index} state={state} halfFillId={halfFillId} />
      ))}
    </span>
  );
}
