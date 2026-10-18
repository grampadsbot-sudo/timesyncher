import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import { logoUrlForPlace, tabCategoryKey } from '../lib/listTabModel.mjs';
import { formatClockMinutes } from '../lib/dayTimelineModel.mjs';
import { overrideFor, placeName } from '../lib/placeHelpers';

type TimelineMedia = {
  publicUrl?: string;
  url?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  mime_type?: string;
  mediaKind?: string;
  kind?: string;
  caption?: string;
  originalName?: string;
};

type TimelineEntry = {
  id: string;
  kind: string;
  title: string;
  place?: SharedPlace;
  startLabel?: string;
  endLabel?: string;
  durationMin?: number | null;
  summary?: string;
  itineraryNote?: string;
  conflictWith?: string;
  fare?: string;
  media?: TimelineMedia[];
  category?: string;
  startMin?: number | null;
};

type Props = {
  trip: SharedTripPayload;
  entries: TimelineEntry[];
  onOpen: (place: SharedPlace) => void;
};

function isVideoMedia(row: TimelineMedia) {
  const mime = String(row.mimeType || row.mime_type || '').toLowerCase();
  const kind = String(row.mediaKind || row.kind || '').toLowerCase();
  const url = String(row.publicUrl || row.url || '');
  return kind === 'video' || mime.startsWith('video/') || /\.mp4(\?|#|$)/i.test(url);
}

function mediaUrl(row: TimelineMedia) {
  return String(row.publicUrl || row.url || row.thumbnail_url || row.thumbnailUrl || '').trim();
}

function summarySuppressedKind(kind: string) {
  return /^(travel|flight|hotel-wake|hotel-event|hotel-sleep|hotel-checkout|car-pickup|car-dropoff)$/.test(
    kind,
  );
}

function TimelineIcon({
  entry,
  trip,
}: {
  entry: TimelineEntry;
  trip: SharedTripPayload;
}) {
  if (entry.kind === 'travel') {
    return (
      <span className="tsv-timeline-icon tsv-timeline-icon--travel" data-ts-timeline-icon="1">
        🚗
      </span>
    );
  }
  if (entry.kind === 'hotel-wake' || entry.kind === 'hotel-sleep') {
    return (
      <span className="tsv-timeline-icon" data-ts-timeline-icon="1" aria-hidden="true">
        <span className="tsv-timeline-emoji">🛏️</span>
      </span>
    );
  }
  const place = entry.place;
  if (!place) return null;
  const logo = logoUrlForPlace(place, trip);
  const override = overrideFor(trip, place);
  const category = tabCategoryKey(place, trip);
  const fallback =
    entry.kind === 'hotel-event' || entry.kind === 'hotel-checkout' || category === 'hotel'
      ? '🧳'
      : String(override.icon || place.category?.icon || place.category_icon || '📍');
  return (
    <span className="tsv-timeline-icon" data-ts-timeline-icon="1" aria-hidden="true">
      {logo ? (
        <img className="tsv-timeline-logo" src={logo} alt="" loading="lazy" />
      ) : (
        <span className="tsv-timeline-emoji">{fallback}</span>
      )}
    </span>
  );
}

function TimelineMediaThumb({
  media,
  expanded,
  onToggle,
}: {
  media: TimelineMedia[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!expanded) return;
    const position = () => {
      const button = buttonRef.current;
      const popup = popupRef.current;
      if (!button || !popup) return;
      const rect = button.getBoundingClientRect();
      const box = popup.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.right - box.width, window.innerWidth - box.width - 8));
      const top = Math.max(8, Math.min(rect.top - box.height - 16, window.innerHeight - box.height - 16));
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [expanded]);
  const primary = media.find((row) => mediaUrl(row)) || media[0];
  const url = primary ? mediaUrl(primary) : '';
  if (!url) return null;
  const video = isVideoMedia(primary);
  return (
    <div className="tsv-timeline-media-wrap">
      <button
        type="button"
        ref={buttonRef}
        className="tsv-timeline-media-thumb"
        aria-expanded={expanded}
        aria-label="Show photo"
        onClick={onToggle}
      >
        {video ? (
          <span className="tsv-timeline-media-play" aria-hidden="true">
            ▶
          </span>
        ) : null}
        <img src={url} alt="" loading="lazy" />
      </button>
      {expanded ? createPortal(
        <div
          ref={popupRef}
          data-ts-pic-popup="1"
          className="tsv-timeline-pic-popup"
          role="dialog"
          aria-label="Photo"
          style={{ position: 'fixed', right: 'auto', bottom: 'auto', maxWidth: 'calc(100vw - 16px)' }}
        >
          <span className="tsv-timeline-pic-popup-tip" data-ts-pic-popup-tip="1" aria-hidden="true" />
          <div className="tsv-timeline-pic-popup-body">
            {video ? (
              <video src={url} controls playsInline className="tsv-timeline-pic-popup-media" />
            ) : (
              <img src={url} alt="" className="tsv-timeline-pic-popup-media" />
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export function DayTimeline({ trip, entries, onOpen }: Props) {
  const [openMediaId, setOpenMediaId] = useState<string | null>(null);

  if (!entries.length) {
    return <p className="tsv-empty">No timeline-tagged things yet for this day.</p>;
  }

  return (
    <ol className="tsv-timeline-list">
      {entries.map((entry) => {
        const isTravel = entry.kind === 'travel';
        const place = entry.place;
        const category = place ? tabCategoryKey(place, trip) : entry.category;
        const showSummary =
          !isTravel &&
          !summarySuppressedKind(entry.kind) &&
          entry.kind === 'thing' &&
          category !== 'flight' &&
          !/^Travel (to|from)\b/i.test(entry.title) &&
          entry.summary;
        const media = entry.media?.length ? entry.media : [];
        return (
          <li
            key={entry.id}
            className={`tsv-timeline-row${entry.conflictWith ? ' is-conflict' : ''}`}
            data-ts-timeline-row="1"
          >
            <div className="tsv-timeline-time-col">
              {entry.startLabel ? (
                <span className="tsv-timeline-time">{entry.startLabel}</span>
              ) : null}
              {(entry.kind === 'flight' || isTravel) &&
              (entry.endLabel || (entry.startMin != null && entry.durationMin != null)) ? (
                <span className="tsv-timeline-time tsv-timeline-time--arrive">
                  {entry.endLabel || formatClockMinutes((entry.startMin ?? 0) + (entry.durationMin ?? 0))}
                </span>
              ) : null}
              {entry.durationMin != null ? (
                <span className="tsv-timeline-duration">
                  {isTravel ? `${entry.durationMin} min` : `${entry.durationMin} min`}
                </span>
              ) : null}
            </div>
            <div className="tsv-timeline-main">
              {entry.conflictWith ? (
                <div className="tsv-timeline-conflict" data-ts-conflict-label="1">
                  <span className="tsv-timeline-conflict-bar" aria-hidden="true" />
                  Conflict with {entry.conflictWith}
                </div>
              ) : null}
              <div className="tsv-timeline-head">
                <TimelineIcon entry={entry} trip={trip} />
                {isTravel || !place ? (
                  <span className="tsv-timeline-title" data-ts-timeline-title="1">
                    {entry.title}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="tsv-timeline-title tsv-timeline-link"
                    data-ts-timeline-title="1"
                    onClick={() => onOpen(place)}
                  >
                    {entry.title || placeName(place)}
                  </button>
                )}
                {media.length ? (
                  <TimelineMediaThumb
                    media={media}
                    expanded={openMediaId === entry.id}
                    onToggle={() =>
                      setOpenMediaId((current) => (current === entry.id ? null : entry.id))
                    }
                  />
                ) : null}
              </div>
              {entry.kind === 'flight' && entry.fare ? (
                <p className="tsv-timeline-fare" data-ts-flight-price="1">
                  {entry.fare}
                </p>
              ) : null}
              {showSummary ? (
                <p className="tsv-timeline-summary" data-row-summary="1" data-summary-stored="1" data-summary-src="thing">
                  {entry.summary}
                </p>
              ) : null}
              {!isTravel && entry.itineraryNote ? (
                <p className="tsv-timeline-note">{entry.itineraryNote}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
