import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SharedTripPayload, TabId } from '../types/sharedTrip';
import { TAB_LABELS } from '../types/sharedTrip';
import { BuildStampFooter } from './BuildStampFooter';
import { TabNav } from './TabNav';
import { TripHeaderActions } from './TripHeaderActions';

type Props = {
  title: string;
  shareToken: string;
  trip: SharedTripPayload;
  permissions?: SharedTripPayload['permissions'];
  activeTab: TabId;
  canEdit: boolean;
  isOwner?: boolean;
  editChecked: boolean;
  saveStatus: 'idle' | 'checking' | 'saving' | 'saved' | 'error';
  onTabChange: (tab: TabId) => void;
  onSectionVisibilityChange: (key: 'flights' | 'hotels' | 'cars', visible: boolean) => void;
  onActiveTabHidden: () => void;
  onOpenMcpPanel?: (mode: 'approvals' | 'tokens' | 'reservations') => void;
  children: ReactNode;
};

function gridSectionVisible(trip: SharedTripPayload, key: 'flights' | 'hotels' | 'cars') {
  const map = trip.thingOverrides?.__sectionVisibility;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return true;
  return (map as Record<string, unknown>)[key] !== false;
}

export function TripShell({
  title,
  shareToken,
  trip,
  permissions,
  activeTab,
  canEdit,
  isOwner = false,
  editChecked,
  saveStatus,
  onTabChange,
  onSectionVisibilityChange,
  onActiveTabHidden,
  onOpenMcpPanel,
  children,
}: Props) {
  const [gridOpen, setGridOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gridOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (gridRef.current && !gridRef.current.contains(event.target as Node)) setGridOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGridOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [gridOpen]);

  function toggleGridSection(key: 'flights' | 'hotels' | 'cars', next: boolean) {
    onSectionVisibilityChange(key, next);
    if (!next && activeTab === key) onActiveTabHidden();
  }

  return (
    <div className="tsv-shell" data-trip-view-root="1">
      <header className="tsv-header">
        <h1 className="tsv-title" title={title}>
          {title}
        </h1>
        <TripHeaderActions
          shareToken={shareToken}
          trip={trip}
          canEdit={canEdit}
          editChecked={editChecked}
          saveStatus={saveStatus}
          activeTab={activeTab}
          onSectionVisibilityChange={onSectionVisibilityChange}
          onActiveTabHidden={onActiveTabHidden}
        />
      </header>
      <TabNav active={activeTab} trip={trip} permissions={permissions} onChange={onTabChange} />
      <main className="tsv-main" aria-label={TAB_LABELS[activeTab]}>
        {children}
      </main>
      <div className="tsv-bottom-grid-wrap no-print" ref={gridRef} data-ts-vacation-grid-root="1">
        <button
          type="button"
          className="tsv-bottom-grid-btn"
          data-ts-vacation-grid-btn="1"
          aria-label="Vacation Admin"
          aria-expanded={gridOpen}
          onClick={() => setGridOpen((open) => !open)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </button>
        {gridOpen ? (
          <div className="tsv-bottom-grid-menu" data-ts-vacation-grid-menu="1" role="menu">
            <p className="tsv-header-popover-title" role="presentation">
              Show / Hide
            </p>
            {(['flights', 'cars', 'hotels'] as const).map((key) => (
              <label key={key} className="tsv-header-config-row" role="menuitemcheckbox">
                <input
                  type="checkbox"
                  checked={gridSectionVisible(trip, key)}
                  disabled={!canEdit}
                  onChange={(event) => toggleGridSection(key, event.target.checked)}
                />
                <span>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
              </label>
            ))}
            {canEdit && isOwner && onOpenMcpPanel ? (
              <div className="tsv-bottom-grid-section">
                <p className="tsv-header-popover-title" role="presentation">
                  AI Access &amp; Approvals
                </p>
                <button
                  type="button"
                  role="menuitem"
                  className="tsv-header-popover-item"
                  data-ts-mcp-open="approvals"
                  onClick={() => {
                    setGridOpen(false);
                    onOpenMcpPanel('approvals');
                  }}
                >
                  Pending AI approvals
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="tsv-header-popover-item"
                  data-ts-mcp-open="tokens"
                  onClick={() => {
                    setGridOpen(false);
                    onOpenMcpPanel('tokens');
                  }}
                >
                  AI access tokens
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="tsv-header-popover-item"
                  data-ts-mcp-open="reservations"
                  onClick={() => {
                    setGridOpen(false);
                    onOpenMcpPanel('reservations');
                  }}
                >
                  Reservations AI
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <BuildStampFooter />
    </div>
  );
}
