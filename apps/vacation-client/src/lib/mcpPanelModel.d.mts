import type { McpChangeSet } from '../api/mcpAdmin';

export function changeSetStatusLabel(status: string): string;
export function changeSetKindLabel(kind: string): string;
export function formatMediaBytes(bytes: number): string;
export function previewSummaryBullets(changeSet: McpChangeSet): string[];
export function sortChangeSetsForReview(changes: McpChangeSet[]): McpChangeSet[];
