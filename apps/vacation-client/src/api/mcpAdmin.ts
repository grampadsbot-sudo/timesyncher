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

export type McpPreviewExifMatch = {
  captured_at?: string | null;
  local_date?: string | null;
  timezone?: string;
  time_matched?: boolean;
  matched_day_date?: string | null;
  matched_day_number?: number | null;
  lat?: number | null;
  lng?: number | null;
  gps_matched?: boolean;
  gps_distance_meters?: number | null;
  gps_matched_thing_ref?: string | null;
  gps_matched_thing_title?: string | null;
  match_reason?: string;
};

export type McpPreviewMedia = {
  media_id: string;
  filename?: string;
  media_kind?: string;
  mime_type?: string;
  url?: string;
  preview_url?: string;
  poster_url?: string | null;
  thumbnail_url?: string | null;
  bytes?: number;
  upload_status?: string;
  assignment_bucket?: string;
  assigned_day_date?: string | null;
  assigned_day_number?: number | null;
  attached_day_date?: string | null;
  attached_day_number?: number | null;
  target_thing_ref?: string | null;
  attached_thing_ref?: string | null;
  attached_thing_title?: string | null;
  attached_thing_scheduled?: boolean | null;
  caption?: string | null;
  exif_match?: McpPreviewExifMatch;
};

export type McpPreviewLandingItem = {
  id?: string;
  ref?: string | null;
  category?: string;
  title?: string;
  source?: string;
  description?: string | null;
  scheduled?: boolean;
  day_date?: string | null;
  starts_at?: string | null;
  start_time?: string | null;
  total_price_cents?: number | null;
  currency?: string;
  media?: McpPreviewMedia[];
};

export type McpPreviewDay = {
  day_number?: number;
  date?: string;
  title?: string;
  notes?: string;
  items?: McpPreviewLandingItem[];
  media?: McpPreviewMedia[];
  day_media?: McpPreviewMedia[];
};

export type McpChangeRequest = {
  id?: string;
  note: string;
  author_email?: string | null;
  author_role?: string;
  created_at?: string;
  preview_version?: number;
  preview_hash?: string | null;
};

export type McpChangePreview = {
  kind?: string;
  preview_version?: number;
  preview_hash?: string;
  summary_text?: string;
  counts?: Record<string, number>;
  days?: McpPreviewDay[];
  unscheduled_things?: McpPreviewLandingItem[];
  media?: McpPreviewMedia[];
  skipped_media?: McpPreviewMedia[];
  skipped_media_note?: string;
  last_changes?: string[];
  change_requests?: McpChangeRequest[];
  latest_change_request?: McpChangeRequest | null;
  media_count?: number;
  total_bytes?: number;
  will_create?: {
    vacation?: {
      title?: string;
      destination?: string;
      start_date?: string | null;
      end_date?: string | null;
      timezone?: string;
      summary?: string;
    };
    days?: McpPreviewDay[];
    flights?: Array<{ title?: string; day_date?: string | null }>;
    hotels?: Array<{ title?: string; check_in?: string | null; check_out?: string | null }>;
    cars?: Array<{ title?: string }>;
    restaurants?: Array<{ title?: string; day_date?: string | null }>;
    stores?: Array<{ title?: string; day_date?: string | null }>;
    things_to_do?: Array<{ title?: string; day_date?: string | null }>;
    notes?: Array<{ title?: string; day_date?: string | null }>;
    unscheduled_things?: McpPreviewLandingItem[];
    media?: McpPreviewMedia[];
  };
  will_add?: Array<{ category?: string; title?: string; day_date?: string | null; scheduled?: boolean }>;
  will_update?: Array<{ item_id?: string; current_title?: string; changed_fields?: string[] }>;
  will_remove?: Array<{ item_id?: string; title?: string; category?: string }>;
  day_updates?: Array<{ day_date?: string; changed_fields?: string[] }>;
  will_attach_media?: McpPreviewMedia[];
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
  previewVersion?: number;
  previewHash?: string | null;
  changeRequests?: McpChangeRequest[];
  latestChangeRequest?: McpChangeRequest | null;
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

export async function approveMcpChange(
  shareToken: string,
  changeSetId: string,
  previewHash?: string,
): Promise<{ publishedVacationId?: string; shareSlug?: string }> {
  const response = await fetch(`/api/mcp/changes/${encodeURIComponent(changeSetId)}/approve`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      shareToken,
      ...(previewHash ? { preview_hash: previewHash } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to approve this AI change set.'));
  }
  return (await response.json()) as { publishedVacationId?: string; shareSlug?: string };
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

export async function requestMcpChanges(
  shareToken: string,
  changeSetId: string,
  note: string,
  previewHash?: string,
): Promise<{ changeRequest: McpChangeRequest; changeRequests: McpChangeRequest[] }> {
  const response = await fetch(`/api/mcp/changes/${encodeURIComponent(changeSetId)}/request-changes`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      shareToken,
      note,
      ...(previewHash ? { preview_hash: previewHash } : {}),
    }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to save change request.'));
  }
  return (await response.json()) as { changeRequest: McpChangeRequest; changeRequests: McpChangeRequest[] };
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

export type McpReservationConnection = {
  id: string;
  accountCustomerId: string;
  accountEmail: string | null;
  label: string;
  scope: 'reservations';
  tokenPrefix: string;
  status: 'pending_handshake' | 'active' | 'revoked';
  mode: 'webhook' | 'polling' | 'manual' | null;
  modeLabel?: string;
  webhookUrl: string | null;
  pollIntervalMinutes: number | null;
  aiClientName: string | null;
  handshakeCompletedAt: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  expiresAt: string | null;
};

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

export async function fetchReservationConnections(
  shareToken: string,
): Promise<{ isAdmin: boolean; connections: McpReservationConnection[] }> {
  const response = await fetch(`/api/mcp/reservations/connections?shareToken=${encodeURIComponent(shareToken)}&admin=1`, {
    credentials: 'include',
    headers: { accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  if (response.status === 403) {
    return { isAdmin: false, connections: [] };
  }
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to load reservations AI connections.'));
  }
  const data = (await response.json()) as { isAdmin?: boolean; connections?: McpReservationConnection[] };
  return {
    isAdmin: data.isAdmin !== false,
    connections: Array.isArray(data.connections) ? data.connections : [],
  };
}

export async function revokeReservationConnectionApi(
  shareToken: string,
  connectionId: string,
): Promise<McpReservationConnection> {
  const response = await fetch(`/api/mcp/reservations/connections/${encodeURIComponent(connectionId)}/revoke`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ shareToken }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, 'Unable to revoke this reservations AI connection.'));
  }
  const data = (await response.json()) as { record: McpReservationConnection };
  return data.record;
}
