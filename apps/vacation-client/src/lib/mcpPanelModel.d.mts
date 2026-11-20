import type { McpChangeSet, McpPreviewDay, McpPreviewLandingItem, McpPreviewMedia } from '../api/mcpAdmin';

export type ApprovalPreviewView = {
  previewHash: string;
  days: McpPreviewDay[];
  unscheduledThings: McpPreviewLandingItem[];
  media: McpPreviewMedia[];
  totalBytes: number;
};

export function changeSetStatusLabel(status: string): string;
export function changeSetKindLabel(kind: string): string;
export function formatMediaBytes(bytes: number): string;
export function formatMediaMatchLabel(media: McpPreviewMedia): string;
export function extractApprovalPreviewView(changeSet: McpChangeSet | null): ApprovalPreviewView;
export function previewSummaryBullets(changeSet: McpChangeSet): string[];
export function sortChangeSetsForReview(changes: McpChangeSet[]): McpChangeSet[];
