import { useLayoutEffect, useRef, useState } from 'react';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import {
  NAMED_THING_LOGOS,
  resolveThingLogoUrl,
} from '../../../../src/vacation/thing-logo-capture.mjs';
import { timelineIcon } from '../../../../src/vacation/timeline-icons.mjs';
import { paintAlignedEmoji } from '../lib/paintTabEmoji';
import { logoUrlForPlace, tabCategoryKey } from '../lib/listTabModel.mjs';
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

function text(value: unknown) {
  return String(value ?? '').trim();
}

function airlineLogoFromTitle(title = '') {
  const label = String(title || '');
  if (/\bsouthwest\b/i.test(label)) return NAMED_THING_LOGOS.southwest;
  if (/\bjetblue\b/i.test(label)) return NAMED_THING_LOGOS.jetblue;
  if (/\bunited\b/i.test(label)) return NAMED_THING_LOGOS.united;
  if (/\bdelta\b/i.test(label)) return NAMED_THING_LOGOS.delta;
  if (/\bamerican\b/i.test(label)) return NAMED_THING_LOGOS.american;
  return '';
}

function TimelineEmoji({ emoji }: { emoji: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const title = node.closest('.tsv-timeline-head')?.querySelector('[data-ts-timeline-title="1"]');
    const paint = () =>
      paintAlignedEmoji(node, emoji, 22, title instanceof HTMLElement ? title : null, 0);
    paint();
    const frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [emoji]);
  return <canvas ref={ref} className="tsv-timeline-emoji-canvas" width={44} height={44} />;
}

function TimelineIcon({
  entry,
  trip,
}: {
  entry: TimelineEntry;
  trip: SharedTripPayload;
}) {
  const [logoBroken, setLogoBroken] = useState(false);

  if (entry.kind === 'travel') {
    return (
      <span className="tsv-timeline-icon tsv-timeline-icon--travel" data-ts-timeline-icon="1">
        <TimelineEmoji emoji="🚗" />
      </span>
    );
  }

  const place = entry.place;
  const stub = place || {
    name: entry.title,
    category_name:
      entry.category === 'flight' || /flight/i.test(entry.title) ? 'Flight' : 'Attraction',
  };
  const override = place ? overrideFor(trip, place) : {};
  const isFlight =
    entry.kind === 'flight' ||
    entry.category === 'flight' ||
    /^Flight option:/i.test(entry.title);
  const resolved = timelineIcon(stub, override, isFlight ? 'flight' : '');
  const flightTitle = entry.title || place?.name || '';
  let logo = '';
  if (place) {
    logo =
      logoUrlForPlace(place, trip) ||
      resolveThingLogoUrl(place, override) ||
      text(resolved.logoUrl);
  }
  if (!logo) {
    logo = text(resolved.logoUrl) || resolveThingLogoUrl(stub, override);
  }
  if (isFlight && !logo) {
    logo = airlineLogoFromTitle(flightTitle);
  }
  const flightGlyph = resolved.icon || '✈️';
  const flightLogo = isFlight ? logo || airlineLogoFromTitle(flightTitle) : logo;

  if (isFlight) {
    const src = flightLogo || airlineLogoFromTitle(flightTitle);
    return (
      <span className="tsv-timeline-icon" data-ts-timeline-icon="1" aria-hidden="true">
        {src ? (
          <img
            className="ts-logo tiny-logo tsv-timeline-logo"
            src={src}
            alt=""
            width={22}
            height={22}
            loading="eager"
            decoding="sync"
            data-ts-timeline-logo="1"
            data-logo-src={src}
          />
        ) : (
          <TimelineEmoji emoji={flightGlyph} />
        )}
      </span>
    );
  }

  if (entry.kind === 'hotel-wake' || entry.kind === 'hotel-sleep') {
    return (
      <span className="tsv-timeline-icon" data-ts-timeline-icon="1" aria-hidden="true">
        <TimelineEmoji emoji="🛏️" />
      </span>
    );
  }

  const showLogo = Boolean(flightLogo) && !logoBroken;
  const showEmoji = !showLogo || logoBroken;

  return (
    <span className="tsv-timeline-icon" data-ts-timeline-icon="1" aria-hidden="true">
      {showLogo && flightLogo ? (
        <img
          className="tiny-logo tsv-timeline-logo"
          src={flightLogo}
          alt=""
          width={22}
          height={22}
          loading="eager"
          decoding="sync"
          data-ts-timeline-logo="1"
          onError={() => setLogoBroken(true)}
        />
      ) : null}
      {showEmoji ? <TimelineEmoji emoji={flightGlyph} /> : null}
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
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const primary = media.find((row) => mediaUrl(row)) || media[0];
  const url = primary ? mediaUrl(primary) : '';

  useLayoutEffect(() => {
    if (!expanded || !buttonRef.current) {
      setAnchor(null);
      return;
    }
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 248;
      const height = 190;
      const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
      const top = Math.max(8, rect.top - height - 6);
      setAnchor({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [expanded]);

  if (!url) return null;
  const video = isVideoMedia(primary);
  return (
    <div className="tsv-timeline-media-wrap">
      <button
        ref={buttonRef}
        type="button"
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
      {expanded ? (
        <div
          data-ts-pic-popup="1"
          className="tsv-timeline-pic-popup"
          role="dialog"
          aria-label="Photo"
          style={
            anchor
              ? { position: 'fixed', top: anchor.top, left: anchor.left, right: 'auto', bottom: 'auto' }
              : undefined
          }
        >
          <span className="tsv-timeline-pic-popup-tip" data-ts-pic-popup-tip="1" aria-hidden="true" />
          <div className="tsv-timeline-pic-popup-body">
            {video ? (
              <video src={url} controls playsInline className="tsv-timeline-pic-popup-media" />
            ) : (
              <img src={url} alt="" className="tsv-timeline-pic-popup-media" />
            )}
          </div>
        </div>
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
    <div className="tsv-timeline-list">
      {entries.map((entry) => {
        const isTravel = entry.kind === 'travel';
        const isFlight = entry.kind === 'flight';
        const place = entry.place;
        const category = place ? tabCategoryKey(place, trip) : entry.category || '';
        const showSummary =
          !isTravel &&
          !isFlight &&
          entry.kind === 'thing' &&
          category !== 'flight' &&
          !/^Travel (to|from)\b/i.test(entry.title) &&
          entry.summary;
        const media = entry.media?.length ? entry.media : [];
        return (
          <div
            key={entry.id}
            className={`tsv-timeline-row${entry.conflictWith ? ' is-conflict' : ''}`}
            data-ts-timeline-row="1"
          >
            <div className="tsv-timeline-time-col">
              {!isTravel && entry.startLabel ? (
                <span className="tsv-timeline-time">{entry.startLabel}</span>
              ) : null}
              {isFlight && entry.endLabel ? (
                <span className="tsv-timeline-time tsv-timeline-time--arrive">{entry.endLabel}</span>
              ) : null}
              {entry.durationMin != null ? (
                <span className="tsv-timeline-duration">
                  {isTravel ? `${entry.durationMin} min` : `${entry.durationMin} min`}
                </span>
              ) : null}
            </div>
            {entry.conflictWith ? (
              <div
                className="tsv-timeline-conflict tsv-timeline-conflict--full"
                data-ts-conflict-label="1"
              >
                <span className="tsv-timeline-conflict-bar" aria-hidden="true" />
                Conflict with {entry.conflictWith}
              </div>
            ) : null}
            <div className="tsv-timeline-head tsv-timeline-head--with-icon">
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
            {entry.fare || showSummary || (!isTravel && entry.itineraryNote) ? (
              <div className="tsv-timeline-details">
                {entry.fare ? (
                  <p className="tsv-timeline-fare" data-ts-flight-price="1">
                    {entry.fare}
                  </p>
                ) : null}
                {showSummary ? (
                  <p
                    className="tsv-timeline-summary"
                    data-row-summary="1"
                    data-summary-stored="1"
                    data-summary-src="thing"
                  >
                    {entry.summary}
                  </p>
                ) : null}
                {!isTravel && entry.itineraryNote ? (
                  <p className="tsv-timeline-note">{entry.itineraryNote}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
