export function parseStarRating(raw: unknown): number | null;
export function roundStarRatingToHalf(value: unknown): number | null;
export function starRatingAccessibilityLabel(value: unknown): string;
export function buildStarRatingStates(value: unknown): Array<'full' | 'half' | 'empty'> | null;
export function primaryPlaceStarRating(override?: Record<string, unknown>): number | null;
