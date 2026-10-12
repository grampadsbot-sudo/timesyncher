import type { TabId } from '../types/sharedTrip';

export const TAB_ORDER: readonly TabId[];
export const TAB_LABELS: Record<TabId, string>;
export const TAB_ICONS: Record<TabId, string>;

export function isTabId(value: unknown): value is TabId;
export function readTabFromLocation(hash: string, search: string): TabId;
export function tabLocationHash(tab: TabId): string;
export function writeTabToLocation(tab: TabId, location: Location): void;
export function sectionVisibilityMap(
  trip: import('../types/sharedTrip.ts').SharedTripPayload | undefined,
): Record<string, unknown>;
export function isConfigSectionVisible(
  trip: import('../types/sharedTrip.ts').SharedTripPayload | undefined,
  key: 'flights' | 'hotels' | 'cars',
): boolean;
export function visibleTabsForTrip(
  trip: import('../types/sharedTrip.ts').SharedTripPayload | undefined,
  permissions: Record<string, boolean> | undefined,
): TabId[];
