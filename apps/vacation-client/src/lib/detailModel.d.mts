import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';

export function detailCategoryKey(place: SharedPlace, trip: SharedTripPayload): string;
export function detailCategoryLabel(category: string): string;
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
): Array<{ index: number; text: string; rating?: string; source?: string }>;
export function detailSummarySourceUrls(override: Record<string, unknown>): string[];
export function detailFieldRows(
  place: SharedPlace,
  trip: SharedTripPayload,
): Array<{ key: string; label: string; value: string; href?: string }>;

export type DetailViewModel = {
  name: string;
  category: string;
  categoryLabel: string;
  source: string;
  logoUrl: string;
  logoFallback: string;
  summary: string;
  itineraryNote: string;
  happyHourDetails: string;
  priceLabel: string;
  ratingLines: Array<{ id: string; text: string; label?: string }>;
  reviews: Array<{ index: number; text: string; rating?: string; source?: string }>;
  summarySourceUrls: string[];
  fieldRows: Array<{ key: string; label: string; value: string; href?: string }>;
};

export function buildDetailViewModel(place: SharedPlace, trip: SharedTripPayload): DetailViewModel;
