import { useEffect, useState } from 'react';
import { loadSharedTrip, shareTokenFromLocation } from '../api/loadSharedTrip';
import type { SharedTripPayload } from '../types/sharedTrip';

type State =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; data: SharedTripPayload; token: string }
  | { status: 'error'; message: string; token: string };

export function useSharedTrip(): State {
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    const token = shareTokenFromLocation();
    if (!token) {
      setState({
        status: 'error',
        token: '',
        message: 'Add ?token=<share-slug> to load a trip from the API.',
      });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
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
