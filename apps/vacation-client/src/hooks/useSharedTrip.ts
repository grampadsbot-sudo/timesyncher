import { useEffect, useState } from 'react';
import { loadSharedTrip, shareTokenFromLocation } from '../api/loadSharedTrip';
import type { SharedTripPayload } from '../types/sharedTrip';

type State =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; data: SharedTripPayload; token: string }
  | { status: 'error'; message: string; token: string };

function initialTripState(): State {
  const token = shareTokenFromLocation();
  if (!token) {
    return {
      status: 'error',
      token: '',
      message: 'Add ?token=<share-slug> to load a trip from the API.',
    };
  }
  return { status: 'loading' };
}

export function useSharedTrip(): State {
  const [state, setState] = useState<State>(initialTripState);

  useEffect(() => {
    const token = shareTokenFromLocation();
    if (!token) return;
    let cancelled = false;
    loadSharedTrip(token)
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, token });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            token,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
