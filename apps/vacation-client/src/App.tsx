import { useCallback, useEffect, useMemo, useState } from 'react';
import { ThingDetailPanel } from './components/ThingDetailPanel';
import { TripShell } from './components/TripShell';
import { useSharedTrip } from './hooks/useSharedTrip';
import { useTabFromUrl } from './hooks/useTabFromUrl';
import { isKeepsakeJourneyLocation } from './lib/keepsakeModel.mjs';
import { visibleTabsForTrip } from './lib/tabNavModel.mjs';
import { overrideFor } from './lib/placeHelpers';
import { BudgetScreen } from './screens/BudgetScreen';
import { CategoryTabScreen } from './screens/CategoryTabScreen';
import { DayByDayScreen } from './screens/DayByDayScreen';
import { KeepsakeJourneyScreen } from './screens/KeepsakeJourneyScreen';
import type { SharedPlace } from './types/sharedTrip';

function FlagTabScreen({ message }: { message: string }) {
  return (
    <section className="tsv-screen">
      <p className="tsv-empty">{message}</p>
    </section>
  );
}

export default function App() {
  const tripState = useSharedTrip();
  const [tab, setTab] = useTabFromUrl();
  const [detail, setDetail] = useState<SharedPlace | null>(null);

  const title = useMemo(() => {
    if (tripState.status !== 'ready') return 'TimeSyncher Vacation';
    return tripState.data.trip?.title || 'Vacation';
  }, [tripState]);

  const visibleTabs = useMemo(() => {
    if (tripState.status !== 'ready') return [];
    return visibleTabsForTrip(tripState.data, tripState.data.permissions);
  }, [tripState]);

  useEffect(() => {
    if (tripState.status !== 'ready') return;
    if (!visibleTabs.includes(tab)) {
      setTab('day-by-day');
    }
  }, [tab, tripState, visibleTabs, setTab]);

  const setTimeline = useCallback(
    (place: SharedPlace, checked: boolean) => {
      if (tripState.status !== 'ready' || !tripState.patchThingOverrides) return;
      const key = `place:${place.id}`;
      tripState.patchThingOverrides((prev) => ({
        ...prev,
        [key]: { ...(prev[key] || {}), timeline: checked },
      }));
    },
    [tripState],
  );

  const setSectionVisibility = useCallback(
    (section: 'flights' | 'hotels' | 'cars', visible: boolean) => {
      if (tripState.status !== 'ready' || !tripState.patchThingOverrides) return;
      tripState.patchThingOverrides((prev) => ({
        ...prev,
        __sectionVisibility: {
          ...(typeof prev.__sectionVisibility === 'object' && prev.__sectionVisibility
            ? prev.__sectionVisibility
            : {}),
          [section]: visible,
        },
      }));
    },
    [tripState],
  );

  if (tripState.status !== 'ready') {
    if (tripState.status === 'error') {
      return (
        <div className="tsv-error" role="alert">
          <h1>Could not load this trip</h1>
          <p>{tripState.message}</p>
          {import.meta.env.DEV ? (
            <p className="tsv-muted">
              Dev: open <code>vacation-app-next.html?token=YOUR_PUBLIC_SLUG</code>
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <div className="tsv-loading" role="status" aria-live="polite">
        Loading trip…
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
  } else if (tab === 'packing') {
    body = <FlagTabScreen message="Packing list opens when the trip owner enables packing on the share link." />;
  } else if (tab === 'chat') {
    body = <FlagTabScreen message="Collaborator chat opens when the trip owner enables collaboration on the share link." />;
  } else {
    body = (
      <CategoryTabScreen
        key={tab}
        trip={trip}
        tab={tab}
        onOpen={setDetail}
        canEdit={tripState.canEdit}
        timelineChecked={(place) => Boolean(overrideFor(trip, place).timeline)}
        onTimelineChange={setTimeline}
      />
    );
  }

  return (
    <>
      <TripShell
        title={title}
        shareToken={token}
        trip={trip}
        permissions={trip.permissions}
        activeTab={tab}
        canEdit={tripState.canEdit}
        editChecked={tripState.editChecked}
        saveStatus={tripState.saveStatus}
        onTabChange={setTab}
        onSectionVisibilityChange={setSectionVisibility}
        onActiveTabHidden={() => setTab('day-by-day')}
      >
        {body}
      </TripShell>
      {detail ? (
        <ThingDetailPanel place={detail} trip={trip} onClose={() => setDetail(null)} />
      ) : null}
    </>
  );
}
