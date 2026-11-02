import type { SyntheticEvent } from 'react';

export function logoChipFallbackEmoji(raw: string | null | undefined, fallback?: string): string;
export function onLogoImgError(event: SyntheticEvent<HTMLImageElement>, fallbackEmoji?: string): void;
export function onLogoImgLoad(event: SyntheticEvent<HTMLImageElement>, fallbackEmoji?: string): void;
