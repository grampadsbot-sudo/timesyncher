import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSharedTrip, shareTokenFromLocation } from '../api/loadSharedTrip';
import { fetchSharedTripEditAccess, saveSharedTripOverrides } from '../api/sharedTripEdits';
import type { SharedTripPayload } from '../types/sharedTrip';

export type SharedTripSaveStatus = 'idle' | 'checking' | 'saving' | 'saved' | 'error';

type State =
  | { status: 'idle' | 'loading' }
  | {
      status: 'ready';
      data: SharedTripPayload;
      token: string;
      canEdit: boolean;
      editChecked: boolean;
      saveStatus: SharedTripSaveStatus;
      saveError: string;
    }
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

export function useSharedTrip(): State & {
  patchThingOverrides?: (
    updater: (prev: Record<string, Record<string, unknown>>) => Record<string, Record<string, unknown>>,
  ) => void;
} {
  const [state, setState] = useState<State>(initialTripState);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOverrides = useRef<Record<string, Record<string, unknown>> | null>(null);

  useEffect(() => {
    const token = shareTokenFromLocation();
    if (!token) return;
    let cancelled = false;
    loadSharedTrip(token)
      .then((data) => {
        if (!cancelled) {
          setState({
            status: 'ready',
            data,
            token,
            canEdit: false,
            editChecked: false,
            saveStatus: 'checking',
            saveError: '',
          });
        }
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

  const readyToken = state.status === 'ready' ? state.token : '';
  const needsEditProbe = state.status === 'ready' && !state.editChecked;

  useEffect(() => {
    if (!needsEditProbe || !readyToken) return;
    let cancelled = false;
    fetchSharedTripEditAccess(readyToken)
      .then((canEdit) => {
        if (!cancelled) {
          setState((prev) =>
            prev.status === 'ready'
              ? { ...prev, canEdit, editChecked: true, saveStatus: 'idle' }
              : prev,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState((prev) =>
            prev.status === 'ready'
              ? { ...prev, canEdit: false, editChecked: true, saveStatus: 'idle' }
              : prev,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [needsEditProbe, readyToken]);

  const flushSave = useCallback(async (token: string, overrides: Record<string, Record<string, unknown>>) => {
    try {
      await saveSharedTripOverrides(token, overrides);
      setState((prev) =>
        prev.status === 'ready' ? { ...prev, saveStatus: 'saved', saveError: '' } : prev,
      );
    } catch (error: unknown) {
      setState((prev) =>
        prev.status === 'ready'
          ? {
              ...prev,
              saveStatus: 'error',
              saveError: error instanceof Error ? error.message : String(error),
            }
          : prev,
      );
    }
  }, []);

  const patchThingOverrides = useCallback(
    (updater: (prev: Record<string, Record<string, unknown>>) => Record<string, Record<string, unknown>>) => {
      setState((prev) => {
        if (prev.status !== 'ready' || !prev.canEdit) return prev;
        const current = prev.data.thingOverrides || {};
        const nextOverrides = updater({ ...current });
        const nextData = { ...prev.data, thingOverrides: nextOverrides };
        pendingOverrides.current = nextOverrides;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          const payload = pendingOverrides.current;
          pendingOverrides.current = null;
          if (payload) void flushSave(prev.token, payload);
        }, 350);
        return { ...prev, data: nextData, saveStatus: 'saving', saveError: '' };
      });
    },
    [flushSave],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  if (state.status === 'ready') {
    return { ...state, patchThingOverrides };
  }
  return state;
}
