import { useMemo, useState } from 'react';
import { ThingDetailPanel } from './components/ThingDetailPanel';
import { TripShell } from './components/TripShell';
import { useSharedTrip } from './hooks/useSharedTrip';
import { useTabFromUrl } from './hooks/useTabFromUrl';
import { isKeepsakeJourneyLocation } from './lib/keepsakeModel.mjs';
import { BudgetScreen } from './screens/BudgetScreen';
import { CategoryTabScreen } from './screens/CategoryTabScreen';
import { DayByDayScreen } from './screens/DayByDayScreen';
import { KeepsakeJourneyScreen } from './screens/KeepsakeJourneyScreen';
import type { SharedPlace } from './types/sharedTrip';

export default function App() {
  const tripState = useSharedTrip();
  const [tab, setTab] = useTabFromUrl();
  const [detail, setDetail] = useState<SharedPlace | null>(null);

  const title = useMemo(() => {
    if (tripState.status !== 'ready') return 'TimeSyncher Vacation';
    return tripState.data.trip?.title || 'Vacation';
  }, [tripState]);

  if (tripState.status === 'loading' || tripState.status === 'idle') {
    return (
      <div className="tsv-loading" role="status" aria-live="polite">
        Loading trip…
      </div>
    );
  }

  if (tripState.status === 'error') {
    return (
      <div className="tsv-error" role="alert">
        <h1>Preview load failed</h1>
        <p>{tripState.message}</p>
        <p className="tsv-muted">
          Example: <code>vacation-app-next.html?token=YOUR_PUBLIC_SLUG</code>
        </p>
      </div>
    );
  }

  const trip = tripState.data;
  const token = tripState.token;

  const journeyView = isKeepsakeJourneyLocation(
    window.location.pathname,
    new URLSearchParams(window.location.search),
  );
  if (journeyView) {
    return <KeepsakeJourneyScreen trip={trip} shareToken={token} />;
  }

  let body = null;
  if (tab === 'day-by-day') {
    body = <DayByDayScreen trip={trip} onOpen={setDetail} />;
  } else if (tab === 'budget') {
    body = <BudgetScreen trip={trip} onOpen={setDetail} />;
  } else {
    body = <CategoryTabScreen trip={trip} tab={tab} onOpen={setDetail} />;
  }

  return (
    <>
      <TripShell
        title={title}
        shareToken={token}
        trip={trip}
        permissions={trip.permissions}
        activeTab={tab}
        onTabChange={setTab}
      >
        {body}
      </TripShell>
      {detail ? (
        <ThingDetailPanel place={detail} trip={trip} onClose={() => setDetail(null)} />
      ) : null}
    </>
  );
}
