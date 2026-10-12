import type { SharedDay, SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import type { TimelineEntry } from './dayTimelineModel';

export type KeepsakePrintFlags = {
  logo: boolean;
  summary: boolean;
  eventSummary: boolean;
  stories: boolean;
  restaurants: boolean;
  rest: boolean;
  stores: boolean;
  dayMapEnabled: (dayNumber: number) => boolean;
};

export function resolveKeepsakePrintFlags(
  trip: SharedTripPayload,
  searchParams?: URLSearchParams,
): KeepsakePrintFlags;
export function keepsakeStyleFromSearch(searchParams?: URLSearchParams): 1 | 2;
export function isKeepsakeJourneyLocation(pathname?: string, searchParams?: URLSearchParams): boolean;
export function tripSummaryText(trip: SharedTripPayload): string;
export function savedStories(trip: SharedTripPayload): Array<{
  id?: string | number;
  title: string;
  story?: string;
  media: Array<Record<string, unknown>>;
  photos: Array<Record<string, unknown>>;
  videos: Array<Record<string, unknown>>;
  logoUrl: string;
}>;
export function eventExperienceCount(trip: SharedTripPayload): number;
export function directorySection(
  trip: SharedTripPayload,
  tab: string,
  label: string,
): { tab: string; label: string; items: Array<{ id: string | number; title: string }> } | null;
export function itineraryStatBuckets(
  trip: SharedTripPayload,
): Array<{ label: string; count: number }>;
export function buildKeepsakeDayPages(trip: SharedTripPayload): Array<{
  day: SharedDay;
  timeline: TimelineEntry[];
  mapPlaces: SharedPlace[];
}>;

export type KeepsakeSection =
  | { kind: 'summary'; summary: string }
  | { kind: 'event-summary'; count: number; label: string }
  | { kind: 'stats'; stats: Array<{ label: string; count: number }> }
  | {
      kind: 'stories';
      stories: Array<{
        id?: string | number;
        title: string;
        story?: string;
        media: Array<Record<string, unknown>>;
        photos: Array<Record<string, unknown>>;
        videos: Array<Record<string, unknown>>;
        logoUrl: string;
      }>;
    }
  | {
      kind: 'directory';
      tab: string;
      label: string;
      items: Array<{
        id: string | number;
        title: string;
        summary?: string;
        price?: string;
        happyHour?: string;
      }>;
    }
  | {
      kind: 'daily-maps';
      maps: Array<{ dayNumber: number; dayTitle: string; places: SharedPlace[] }>;
    }
  | {
      kind: 'daily-itinerary';
      days: Array<{ day: SharedDay; timeline: TimelineEntry[]; mapPlaces: SharedPlace[] }>;
    };

export type KeepsakeViewModel = {
  style: 1 | 2;
  flags: KeepsakePrintFlags;
  tripTitle: string;
  sections: KeepsakeSection[];
  logoSection: boolean;
  placeCount: number;
};

export function buildKeepsakeViewModel(
  trip: SharedTripPayload,
  searchParams?: URLSearchParams,
): KeepsakeViewModel;
