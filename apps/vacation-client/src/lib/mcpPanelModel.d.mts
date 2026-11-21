import type { McpChangeRequest, McpChangeSet, McpPreviewDay, McpPreviewLandingItem, McpPreviewMedia, McpReservationConnection } from '../api/mcpAdmin';

export type NormalizedPreviewChange = {
  text: string;
  media: McpPreviewMedia | null;
};

export type ApprovalPreviewView = {
  previewVersion: number;
  previewHash: string;
  days: McpPreviewDay[];
  unscheduledThings: McpPreviewLandingItem[];
  media: McpPreviewMedia[];
  skippedMedia: McpPreviewMedia[];
  skippedMediaNote: string;
  lastChanges: NormalizedPreviewChange[];
  changeRequests: McpChangeRequest[];
  totalBytes: number;
};

export function changeSetStatusLabel(status: string): string;
export function changeSetKindLabel(kind: string): string;
export function formatMediaBytes(bytes: number): string;
export function formatMediaMatchLabel(media: McpPreviewMedia): string;
export function previewCategoryIcon(category?: string): string;
export function formatPreviewDayDate(iso?: string | null): string;
export function formatPreviewClock(value?: string | null): string;
export function extractApprovalPreviewView(changeSet: McpChangeSet | null): ApprovalPreviewView;
export function previewSummaryChips(changeSet: McpChangeSet): string[];
export function previewSummaryBullets(changeSet: McpChangeSet): string[];
export function sortChangeSetsForReview(changes: McpChangeSet[]): McpChangeSet[];
export function reservationConnectionModeLabel(connection: Partial<McpReservationConnection> | null | undefined): string;
export function formatReservationCreatedDate(iso?: string | null): string;
