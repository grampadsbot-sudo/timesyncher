export async function fetchSharedTripEditAccessInfo(token: string): Promise<{ canEdit: boolean; role: string }> {
  const slug = token.replace(/^\/+|\/+$/g, '');
  if (!slug) return { canEdit: false, role: '' };
  const response = await fetch(`/api/shared/${encodeURIComponent(slug)}/edit-access`, {
    credentials: 'include',
    headers: { accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) return { canEdit: false, role: '' };
  try {
    const body = (await response.json()) as { canEdit?: boolean; role?: string };
    return { canEdit: Boolean(body?.canEdit), role: String(body?.role || '') };
  } catch (error) {
    void error;
    return { canEdit: false, role: '' };
  }
}

export async function saveSharedTripOverrides(
  token: string,
  overrides: Record<string, Record<string, unknown>>,
): Promise<void> {
  const slug = token.replace(/^\/+|\/+$/g, '');
  if (!slug) throw new Error('Missing share token');
  const response = await fetch(`/api/shared/${encodeURIComponent(slug)}/overrides`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ overrides }),
  });
  if (!response.ok) {
    let message = 'Could not save — check your connection and try again';
    try {
      const body = (await response.json()) as { error?: string; customerMessage?: string };
      if (body.customerMessage) message = body.customerMessage;
      else if (body.error) message = body.error;
    } catch {
      void 0;
    }
    throw new Error(message);
  }
}
