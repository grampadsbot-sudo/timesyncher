export type McpTokenRecord = {
  id: string;
  vacationId: string;
  label: string;
  role: 'owner' | 'collaborator';
  tokenPrefix: string;
  status: 'active' | 'revoked';
  createdByEmail: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
};

export type McpPreviewMedia = {
  media_id: string;
  filename: string;
  media_kind?: string;
  bytes?: number;
  upload_status?: string;
  assignment_bucket?: string;
  assigned_day_date?: string | null;
  assigned_day_number?: number | null;
  caption?: string | null;
};

export type McpChangePreview = {
  kind?: string;
  summary_text?: string;
  counts?: Record<string, number>;
  will_create?: {
    vacation?: {
      title?: string;
      destination?: string;
      start_date?: string | null;
      end_date?: string | null;
      timezone?: string;
      summary?: string;
    };
    days?: Array<{ day_number?: number; date?: string; title?: string }>;
    flights?: Array<{ title?: string; day_date?: string | null }>;
    hotels?: Array<{ title?: string; check_in?: string | null; check_out?: string | null }>;
    cars?: Array<{ title?: string }>;
    restaurants?: Array<{ title?: string; day_date?: string | null }>;
    things_to_do?: Array<{ title?: string; day_date?: string | null }>;
    notes?: Array<{ title?: string; day_date?: string | null }>;
    media?: McpPreviewMedia[];
  };
  will_add?: Array<{ category?: string; title?: string; day_date?: string | null }>;
  will_update?: Array<{ item_id?: string; current_title?: string; changed_fields?: string[] }>;
  will_remove?: Array<{ item_id?: string; title?: string; category?: string }>;
  day_updates?: Array<{ day_date?: string; changed_fields?: string[] }>;
  will_attach_media?: Array<{ media_id?: string; filename?: string; day_date?: string | null }>;
  missing?: string[];
  conflicts?: string[];
};

export type McpChangeSet = {
  id: string;
  vacationId: string;
  publishedVacationId: string | null;
  kind: 'draft_import' | 'targeted_edit';
  applyMode: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'declined';
  summary: string;
  preview: McpChangePreview;
  committedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string | null;
};

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch (error) {
    void error;
  }
  return fallback;
}

export async function fetchMcpChanges(shareToken: string): Promise<McpChangeSet[]> {
  const response = await fetch(`/api/mcp/changes?shareToken=${encodeURIComponent(shareToken)}`, {
    credentials: 'include',
    headers: { accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to load pending AI changes for this vacation.'));
  }
  const data = (await response.json()) as { changes?: McpChangeSet[] };
  return Array.isArray(data.changes) ? data.changes : [];
}

export async function approveMcpChange(shareToken: string, changeSetId: string): Promise<{ publishedVacationId?: string }> {
  const response = await fetch(`/api/mcp/changes/${encodeURIComponent(changeSetId)}/approve`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ shareToken }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to approve this AI change set.'));
  }
  return (await response.json()) as { publishedVacationId?: string };
}

export async function declineMcpChange(shareToken: string, changeSetId: string): Promise<void> {
  const response = await fetch(`/api/mcp/changes/${encodeURIComponent(changeSetId)}/decline`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ shareToken }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to decline this AI change set.'));
  }
}

export async function fetchMcpTokens(shareToken: string): Promise<{ mcpEndpoint: string; tokens: McpTokenRecord[] }> {
  const response = await fetch(`/api/mcp/tokens?shareToken=${encodeURIComponent(shareToken)}`, {
    credentials: 'include',
    headers: { accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to load AI access tokens for this vacation.'));
  }
  const data = (await response.json()) as { mcpEndpoint?: string; tokens?: McpTokenRecord[] };
  return {
    mcpEndpoint: data.mcpEndpoint || `${window.location.origin}/api/mcp`,
    tokens: Array.isArray(data.tokens) ? data.tokens : [],
  };
}

export async function createVacationMcpToken(
  shareToken: string,
  input: { label: string; role: 'owner' | 'collaborator' },
): Promise<{ token: string; record: McpTokenRecord; mcpEndpoint: string }> {
  const response = await fetch('/api/mcp/tokens', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ shareToken, label: input.label, role: input.role }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to create an AI access token.'));
  }
  return (await response.json()) as { token: string; record: McpTokenRecord; mcpEndpoint: string };
}

export async function revokeVacationMcpToken(shareToken: string, tokenId: string): Promise<McpTokenRecord> {
  const response = await fetch(`/api/mcp/tokens/${encodeURIComponent(tokenId)}/revoke`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ shareToken }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to revoke this AI access token.'));
  }
  const data = (await response.json()) as { record: McpTokenRecord };
  return data.record;
}
