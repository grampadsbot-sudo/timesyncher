import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';

export const DEFAULT_SORT: { key: string; dir: 'asc' | 'desc' };

export function parsePrice(value: unknown): number | null;
export function formatUsd(amount: number, currency?: string): string;
export function tabCategoryKey(place: SharedPlace, trip: SharedTripPayload): string;
export function placesForCategoryTab(trip: SharedTripPayload, tab: string): SharedPlace[];
export function placeName(place: SharedPlace): string;
export function catalogRowDisplayName(place: SharedPlace, trip: SharedTripPayload): string;
export function areaChipsForTab(places: SharedPlace[], trip: SharedTripPayload, tab: string): string[];
export function typeChipsForTab(places: SharedPlace[], trip: SharedTripPayload, tab: string): string[];
export function filterPlaces(
  places: SharedPlace[],
  trip: SharedTripPayload,
  tab: string,
  filters?: Record<string, unknown>,
): SharedPlace[];
export function numericPrice(place: SharedPlace, trip: SharedTripPayload): number | null;
export function eventListPriceDisplay(place: SharedPlace, trip: SharedTripPayload): string;
export function categoryLogoGlyph(place: SharedPlace, trip: SharedTripPayload): string;
export function opaqueCarPricelineLogoUrl(place: SharedPlace, trip: SharedTripPayload): string;
export function sortPlaces(
  places: SharedPlace[],
  trip: SharedTripPayload,
  sort?: { key: string; dir: string },
): SharedPlace[];
export function emptyStateMessage(
  tab: string,
  ctx: { categoryCount: number; filterActive: boolean },
): string;
export function fareDirectionLabel(override?: Record<string, unknown>): string;
export function flightPriceDisplay(place: SharedPlace, trip: SharedTripPayload): string;
export function flightSchedule(
  place: SharedPlace,
  trip: SharedTripPayload,
): { depart?: string; arrive?: string; duration?: string };
export function hotelPriceDisplay(place: SharedPlace, trip: SharedTripPayload): string;
export function carPriceDisplay(place: SharedPlace, trip: SharedTripPayload): string;
export function carSubtitle(place: SharedPlace, trip: SharedTripPayload): string;
export function rowSummary(place: SharedPlace, trip: SharedTripPayload): string;
export function logoUrlForPlace(place: SharedPlace, trip: SharedTripPayload): string;
export function hotelFirstRowNote(
  place: SharedPlace,
  trip: SharedTripPayload,
  isFirstHotel: boolean,
): string;
export function sortIndicator(activeKey: string, activeDir: string, key: string): string;
