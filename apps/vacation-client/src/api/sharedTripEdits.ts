export async function fetchSharedTripEditAccess(token: string): Promise<boolean> {
  const slug = token.replace(/^\/+|\/+$/g, '');
  if (!slug) return false;
  const response = await fetch(`/api/shared/${encodeURIComponent(slug)}/edit-access`, {
    credentials: 'include',
    headers: { accept: 'application/json', 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) return false;
  try {
    const body = (await response.json()) as { canEdit?: boolean };
    return Boolean(body?.canEdit);
  } catch {
    return false;
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
