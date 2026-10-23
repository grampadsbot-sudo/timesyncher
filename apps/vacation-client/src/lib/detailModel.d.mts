import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';

export function detailCategoryKey(place: SharedPlace, trip: SharedTripPayload): string;
export function detailCategoryLabel(category: string): string;
export function detailCoordinates(
  place: SharedPlace,
  trip: SharedTripPayload,
): { lat: number; lng: number } | null;
export function detailReviewTotals(override: Record<string, unknown>): {
  count: number;
  average: number;
  histogram: number[];
  sources: string[];
} | null;
export function detailReviewTotalsLine(override: Record<string, unknown>): string;
export function detailHeaderLabel(categoryLabel: string, source: string): string;
export function detailSummary(place: SharedPlace, trip: SharedTripPayload): string;
export function detailItineraryNote(place: SharedPlace, trip: SharedTripPayload): string;
export function detailHappyHour(override: Record<string, unknown>): string;
export function detailPriceLabel(place: SharedPlace, trip: SharedTripPayload, category: string): string;
export function detailRatingLines(
  override: Record<string, unknown>,
): Array<{ id: string; text: string; label?: string }>;
export function detailReviews(
  override: Record<string, unknown>,
  category: string,
): Array<{
  index: number;
  text: string;
  rating?: string;
  source?: string;
  compositeLabel?: string;
}>;
export function detailSummarySourceUrls(override: Record<string, unknown>): string[];
export function detailFieldRows(
  place: SharedPlace,
  trip: SharedTripPayload,
): Array<{ key: string; label: string; value: string; href?: string }>;

export type DetailViewModel = {
  name: string;
  category: string;
  categoryLabel: string;
  headerLabel: string;
  source: string;
  logoUrl: string;
  showLogo: boolean;
  summary: string;
  itineraryNote: string;
  happyHourDetails: string;
  priceLabel: string;
  priceLine: string;
  priceHeading: string;
  ratingLines: Array<{ id: string; text: string; label?: string }>;
  reviews: Array<{
    index: number;
    text: string;
    rating?: string;
    source?: string;
    compositeLabel?: string;
  }>;
  reviewTotalsLine: string;
  reviewFootnote: string;
  summarySourceUrls: string[];
  fieldRows: Array<{ key: string; label: string; value: string; href?: string }>;
};

export function buildDetailViewModel(place: SharedPlace, trip: SharedTripPayload): DetailViewModel;
