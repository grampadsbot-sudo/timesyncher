import { useMemo, useState } from 'react';
import type { SharedDay, SharedTripPayload } from '../types/sharedTrip';
import { SharedAudioButton } from './SharedAudioButton';

type Props = {
  shareToken: string;
  trip: SharedTripPayload;
  canEdit: boolean;
  editChecked: boolean;
  saveStatus: 'idle' | 'checking' | 'saving' | 'saved' | 'error';
  onSectionVisibilityChange: (key: 'flights' | 'hotels' | 'cars', visible: boolean) => void;
  onActiveTabHidden?: () => void;
  activeTab?: string;
};

function sortedDays(trip: SharedTripPayload): SharedDay[] {
  return [...(trip.days || [])].sort(
    (a, b) => Number(a.day_number || 0) - Number(b.day_number || 0),
  );
}

function sectionVisible(trip: SharedTripPayload, key: 'flights' | 'hotels' | 'cars') {
  const map = trip.thingOverrides?.__sectionVisibility;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return true;
  return (map as Record<string, unknown>)[key] !== false;
}

export function TripHeaderActions({
  shareToken,
  trip,
  canEdit,
  editChecked,
  saveStatus,
  onSectionVisibilityChange,
  onActiveTabHidden,
  activeTab,
}: Props) {
  const [configOpen, setConfigOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [keepsakesOpen, setKeepsakesOpen] = useState(false);

  const days = useMemo(() => sortedDays(trip), [trip]);

  const journeyHref = (() => {
    const path = window.location.pathname || '';
    if (path.includes('vacation-app-next.html') || path === '/') {
      const params = new URLSearchParams(window.location.search);
      params.set('journey', '1');
      params.set('style', '1');
      params.set('printMode', 'report');
      params.set('pdfReport', 'keepsake');
      if (!params.get('token') && !params.get('slug')) {
        params.set('token', shareToken);
      }
      return `${path.includes('.html') ? path : '/vacation-app-next.html'}?${params.toString()}`;
    }
    return `/shared/${encodeURIComponent(shareToken)}/journey?style=1&printMode=report&pdfReport=keepsake`;
  })();

  const pdfBase = `/api/pdf/shared/${encodeURIComponent(shareToken)}`;
  const printKeepsakeHref = `${pdfBase}/report/keepsake.pdf`;
  const printStyleTwoHref = `${pdfBase}/report/style-2`;
  const printRestaurantsHref = `${pdfBase}/report/restaurants.pdf`;
  const printStoresHref = `${pdfBase}/report/stores.pdf`;
  const printRestHref = `${pdfBase}/report/rest.pdf`;
  const printCompleteHref = `${pdfBase}/report/complete-list.pdf`;

  const editStatusLine = !editChecked
    ? 'Checking edit access…'
    : saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'error'
        ? 'Could not save — check your connection and try again'
        : '';

  function toggleSection(key: 'flights' | 'hotels' | 'cars', next: boolean) {
    onSectionVisibilityChange(key, next);
    if (!next && activeTab === key) onActiveTabHidden?.();
  }

  return (
    <div className="tsv-header-actions" data-print-menu-root="1">
      {editStatusLine ? (
        <span className="tsv-header-edit-status" aria-live="polite">
          {editStatusLine}
        </span>
      ) : null}
      <div className="tsv-header-menu">
        <button
          type="button"
          className="tsv-header-btn"
          aria-label="PDFs"
          aria-expanded={printOpen}
          onClick={() => {
            setPrintOpen((open) => !open);
            setConfigOpen(false);
            setDailyOpen(false);
            setKeepsakesOpen(false);
          }}
        >
          Print
        </button>
        {printOpen ? (
          <div className="tsv-header-popover tsv-header-popover-wide" role="menu">
            <p className="tsv-header-popover-title" role="presentation">
              Print / PDF
            </p>
            <div className="tsv-header-submenu">
              <button
                type="button"
                className="tsv-header-popover-item"
                role="menuitem"
                aria-expanded={dailyOpen}
                onClick={() => setDailyOpen((open) => !open)}
              >
                Daily printout ▸
              </button>
              {dailyOpen ? (
                <div className="tsv-header-submenu-nested" role="group">
                  {days.map((day) => (
                    <a
                      key={String(day.id)}
                      role="menuitem"
                      className="tsv-header-popover-item"
                      href={`${pdfBase}/daily/${encodeURIComponent(String(day.day_number || day.id))}.pdf`}
                    >
                      Day {day.day_number}
                      {day.date ? ` · ${day.date}` : ''}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="tsv-header-submenu">
              <button
                type="button"
                className="tsv-header-popover-item"
                role="menuitem"
                aria-expanded={keepsakesOpen}
                onClick={() => setKeepsakesOpen((open) => !open)}
              >
                Keepsakes ▸
              </button>
              {keepsakesOpen ? (
                <div className="tsv-header-submenu-nested" role="group">
                  <a role="menuitem" className="tsv-header-popover-item" href={printKeepsakeHref}>
                    Style one
                  </a>
                  <a role="menuitem" className="tsv-header-popover-item" href={printStyleTwoHref}>
                    Style two
                  </a>
                  <a role="menuitem" className="tsv-header-popover-item" href={journeyHref}>
                    Admin ▸
                  </a>
                </div>
              ) : null}
            </div>
            <a role="menuitem" className="tsv-header-popover-item" href={printRestaurantsHref}>
              Restaurants
            </a>
            <a role="menuitem" className="tsv-header-popover-item" href={printStoresHref}>
              Stores
            </a>
            <a role="menuitem" className="tsv-header-popover-item" href={printRestHref}>
              The Rest
            </a>
            <a role="menuitem" className="tsv-header-popover-item" href={printCompleteHref}>
              Complete List
            </a>
          </div>
        ) : null}
      </div>
      <div className="tsv-header-menu">
        <button
          type="button"
          className="tsv-header-btn"
          aria-label="Config Options"
          aria-expanded={configOpen}
          onClick={() => {
            setConfigOpen((open) => !open);
            setPrintOpen(false);
          }}
        >
          Config
        </button>
        {configOpen ? (
          <div className="tsv-header-popover tsv-header-popover-wide" role="menu">
            <p className="tsv-header-popover-title" role="presentation">
              Trip View
            </p>
            {(['flights', 'hotels', 'cars'] as const).map((key) => (
              <label key={key} className="tsv-header-config-row" role="menuitemcheckbox">
                <input
                  type="checkbox"
                  checked={sectionVisible(trip, key)}
                  disabled={!canEdit}
                  onChange={(event) => toggleSection(key, event.target.checked)}
                />
                <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
              </label>
            ))}
          </div>
        ) : null}
      </div>
      <SharedAudioButton shareToken={shareToken} />
    </div>
  );
}
