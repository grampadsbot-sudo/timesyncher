import { useMemo, useState } from 'react';
import type { SharedTripPayload } from '../types/sharedTrip';
import { SharedAudioButton } from './SharedAudioButton';

type Props = {
  shareToken: string;
  permissions?: SharedTripPayload['permissions'];
};

export function TripHeaderActions({ shareToken, permissions }: Props) {
  const [configOpen, setConfigOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const showConfig = useMemo(() => {
    if (!permissions) return true;
    return Boolean(
      permissions.share_bookings ||
        permissions.share_map ||
        permissions.share_budget ||
        permissions.share_collab,
    );
  }, [permissions]);

  const journeyHref = `/shared/${encodeURIComponent(shareToken)}/journey`;
  const printKeepsakeHref = `/api/pdf/shared/${encodeURIComponent(shareToken)}/report/keepsake.pdf`;
  const printStyleTwoHref = `/api/pdf/shared/${encodeURIComponent(shareToken)}/report/style-2`;

  return (
    <div className="tsv-header-actions" data-print-menu-root="1">
      <a className="tsv-header-link" href={journeyHref}>
        Keepsakes
      </a>
      <div className="tsv-header-menu">
        <button
          type="button"
          className="tsv-header-btn"
          aria-label="Print"
          aria-expanded={printOpen}
          onClick={() => {
            setPrintOpen((open) => !open);
            setConfigOpen(false);
          }}
        >
          Print
        </button>
        {printOpen ? (
          <div className="tsv-header-popover" role="menu">
            <a role="menuitem" href={printKeepsakeHref}>
              Style one PDF
            </a>
            <a role="menuitem" href={printStyleTwoHref}>
              Style two PDF
            </a>
          </div>
        ) : null}
      </div>
      {showConfig ? (
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
            <div className="tsv-header-popover" role="menu">
              <span className="tsv-header-popover-note" role="menuitem">
                Sharing options follow trip permissions.
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
      <SharedAudioButton shareToken={shareToken} />
    </div>
  );
}
