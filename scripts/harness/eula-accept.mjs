export function eulaAcceptRequest({ origin, token, acceptedByName }) {
  const sessionId = `vacation-${token}`;
  const url = new URL('/api/eula', origin);
  url.searchParams.set('action', 'accept');
  url.searchParams.set('sessionId', sessionId);
  return {
    url: url.href,
    sessionId,
    body: { acceptedByName, checkboxConfirmed: true },
  };
}

export function eulaAccepted(appBody) {
  return appBody?.eula?.accepted === true;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    return { ok: false, error: 'unreadable response' };
  }
}

async function acceptLiveEula({ origin, token, acceptedByName, fetchImpl }) {
  const request = eulaAcceptRequest({ origin, token, acceptedByName });
  const response = await fetchImpl(request.url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(request.body),
  });
  const body = await readJson(response);
  if (response.status !== 201 || body.ok === false) {
    const error = new Error(`eula accept failed (${response.status})`);
    error.code = 'eula_not_accepted';
    throw error;
  }
  return { sessionId: request.sessionId, status: response.status };
}

async function confirmEulaAccepted({ origin, token, tripId, fetchImpl }) {
  const url = new URL('/api/vacation-itinerary', origin);
  url.searchParams.set('app', '1');
  url.searchParams.set('session', token);
  if (tripId) url.searchParams.set('tripId', tripId);
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
  const body = await readJson(response);
  if (!eulaAccepted(body)) {
    const error = new Error('eula.accepted was not true after accept');
    error.code = 'eula_not_accepted';
    throw error;
  }
  return body;
}

export async function acceptAndConfirmEula(options) {
  await acceptLiveEula(options);
  return confirmEulaAccepted(options);
}
