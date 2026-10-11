import { useCallback, useEffect, useState } from 'react';
import type { TabId } from '../types/sharedTrip';
import { readTabFromLocation, writeTabToLocation } from '../lib/tabNavModel.mjs';

export function useTabFromUrl(): [TabId, (tab: TabId) => void] {
  const [tab, setTabState] = useState<TabId>(() =>
    readTabFromLocation(window.location.hash, window.location.search),
  );

  useEffect(() => {
    const onHashChange = () => {
      setTabState(readTabFromLocation(window.location.hash, window.location.search));
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const setTab = useCallback((next: TabId) => {
    setTabState(next);
    writeTabToLocation(next, window.location);
  }, []);

  return [tab, setTab];
}
