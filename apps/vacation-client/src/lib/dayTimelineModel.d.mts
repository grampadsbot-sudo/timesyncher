import type { SharedDay, SharedPlace, SharedTripPayload } from '../types/sharedTrip';

export function sortedDays(trip: SharedTripPayload): SharedDay[];
export function dayChipLabel(day: SharedDay): string;
export function dayItineraryHeading(day: SharedDay): string;
export function parseDurationMinutes(raw: unknown): number | null;
export function parseClockToMinutes(clock: string): number | null;
export function formatClockMinutes(totalMinutes: number): string;
export function estimateTravelMinutes(fromPlace: SharedPlace, toPlace: SharedPlace): number;
export function itineraryNoteFor(
  place: SharedPlace,
  trip: SharedTripPayload,
  assignmentNotes: string,
): string;

export type TimelineEntry = {
  kind: string;
  id: string;
  title: string;
  place?: SharedPlace;
  startMin?: number | null;
  startLabel?: string;
  durationMin?: number | null;
  assignmentNotes?: string;
  category?: string;
  summary?: string;
  itineraryNote?: string;
  conflictWith?: string;
};

export function buildDayTimeline(trip: SharedTripPayload, day: SharedDay): TimelineEntry[];
export function mapPlacesForTimeline(
  trip: SharedTripPayload,
  entries: TimelineEntry[],
): SharedPlace[];
export function shiftDayIndex(trip: SharedTripPayload, currentIndex: number, delta: number): number;
export function timeRangeLabel(entry: TimelineEntry): string;
