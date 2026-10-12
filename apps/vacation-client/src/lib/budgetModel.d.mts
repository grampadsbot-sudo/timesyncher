import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';

export const OTHER_THINGS_BUCKET: string;
export const BUDGET_BUCKET_ORDER: readonly string[];

export function budgetBucketForPlace(place: SharedPlace, trip: SharedTripPayload): string;
export function budgetLineAmount(
  place: SharedPlace,
  trip: SharedTripPayload,
): { amount: number; hasPrice: boolean; nightly: number | null };
export function bucketTargetAmount(trip: SharedTripPayload, bucket: string): number | null;
export function tripBudgetTargetTotal(trip: SharedTripPayload): number | null;
export function placesForBudget(trip: SharedTripPayload): SharedPlace[];
export function canonicalBudgetPlace(trip: SharedTripPayload, placeOrId: SharedPlace | string | number): SharedPlace | null;
export function bucketDisplayLabel(bucket: string): string;
export function bucketIcon(bucket: string): string;
export function formatUsd(amount: number, currency?: string): string;
export function varianceLabel(planned: number, target: number | null): string;

export type BudgetRow = {
  place: SharedPlace;
  bucket: string;
  name: string;
  amount: number;
  hasPrice: boolean;
  nightly?: number | null;
  note?: string;
};

export type BudgetBucketModel = {
  label: string;
  displayLabel: string;
  icon: string;
  rows: BudgetRow[];
  planned: number;
  timelinePlanned: number;
  target: number | null;
  variance: string;
  omit: boolean;
};

export type BudgetViewModel = {
  currency: string;
  rows: BudgetRow[];
  buckets: BudgetBucketModel[];
  tripPlanned: number;
  tripTimelinePlanned: number;
  tripTarget: number | null;
  tripVariance: string;
  isEmpty: boolean;
};

export function buildBudgetModel(trip: SharedTripPayload): BudgetViewModel;
export function budgetCompletenessChecks(trip: SharedTripPayload): Array<{ name: string; pass: boolean }>;
export function budgetCompletenessScore(trip: SharedTripPayload): { pass: number; total: number };
