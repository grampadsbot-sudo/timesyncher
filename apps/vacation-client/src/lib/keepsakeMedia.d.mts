export function isKeepsakeJunkMedia(row?: Record<string, unknown>): boolean;
export function isPhotoMedia(row?: Record<string, unknown>): boolean;
export function isVideoMedia(row?: Record<string, unknown>): boolean;
export function mediaPrintSrc(row?: Record<string, unknown>): string;
export function normalizeMediaRows(rows: unknown): Array<Record<string, unknown>>;
export function boundMediaForPlace(place: Record<string, unknown>): Array<Record<string, unknown>>;
export function savedStoryFlagActive(
  place?: Record<string, unknown>,
  override?: Record<string, unknown>,
): boolean;
export function qrSvgUrl(payload: string): string;
