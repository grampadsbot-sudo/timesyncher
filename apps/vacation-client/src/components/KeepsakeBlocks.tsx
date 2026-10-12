import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import { BudgetLogoChip } from './BudgetLogoChip';
import { DayTimeline } from './DayTimeline';
import { overrideFor, placeName } from '../lib/placeHelpers';
import {
  flightPriceDisplay,
  hotelPriceDisplay,
  carPriceDisplay,
  numericPrice,
  rowSummary,
  tabCategoryKey,
} from '../lib/listTabModel.mjs';
import {
  isPhotoMedia,
  isVideoMedia,
  mediaPrintSrc,
  qrSvgUrl,
} from '../lib/keepsakeMedia.mjs';
import type { SharedDay } from '../types/sharedTrip';
import type { TimelineEntry } from '../lib/dayTimelineModel.d.mts';
import { dayChipLabel } from '../lib/dayTimelineModel.mjs';

type MediaRow = Record<string, unknown>;

export function KeepsakePrintBrand({ tripTitle, style }: { tripTitle: string; style: 1 | 2 }) {
  const label =
    style === 2 ? 'TimeSyncher · Journey Book · Style 2' : 'TimeSyncher · Journey';
  return (
    <div className="tsv-keepsake-print-brand print-brand" data-print-brand="1">
      <p className="tsv-keepsake-brand">{label}</p>
      <h1 className="tsv-keepsake-trip-head">{tripTitle}</h1>
    </div>
  );
}

export function KeepsakeMediaCard({ row, caption }: { row: MediaRow; caption?: string }) {
  if (isVideoMedia(row)) {
    const href = mediaPrintSrc(row);
    const qr = qrSvgUrl(href);
    if (!qr) return null;
    return (
      <figure className="print-media-card video" data-print-media="1">
        <img className="print-media-qr" src={qr} alt="" data-video-qr="1" />
        {caption ? <figcaption>{caption}</figcaption> : null}
      </figure>
    );
  }
  if (!isPhotoMedia(row)) return null;
  const src = mediaPrintSrc(row);
  if (!src) return null;
  const cap = caption || String(row.caption || row.originalName || row.original_name || '').trim();
  return (
    <figure className="print-media-card" data-print-media="1">
      <img src={src} alt="" data-print-inlined={/^data:image\//i.test(src) ? '1' : undefined} />
      {cap ? <figcaption data-caption-proof="1">{cap}</figcaption> : null}
    </figure>
  );
}

type StoryModel = {
  id?: string | number;
  title: string;
  story?: string;
  photos: MediaRow[];
  videos: MediaRow[];
};

export function KeepsakeStoryCard({ story }: { story: StoryModel }) {
  return (
    <article
      className="tsv-keepsake-story thing"
      data-story-card="1"
      data-saved-story-thing="1"
      data-story-media="bound"
    >
      <h3>{story.title}</h3>
      {story.photos.length || story.videos.length ? (
        <div className="style2-thing-media" data-thing-bound-media="1">
          {story.photos.map((row, index) => (
            <KeepsakeMediaCard key={`p-${String(row.id ?? index)}`} row={row} />
          ))}
          {story.videos.map((row, index) => (
            <KeepsakeMediaCard key={`v-${String(row.id ?? index)}`} row={row} />
          ))}
        </div>
      ) : null}
      {story.story ? <p>{story.story}</p> : null}
    </article>
  );
}

export function KeepsakeDirectoryRow({
  place,
  trip,
}: {
  place: SharedPlace;
  trip: SharedTripPayload;
}) {
  const override = overrideFor(trip, place);
  const category = tabCategoryKey(place, trip);
  const title = placeName(place);
  const summary = rowSummary(place, trip);
  const happyHour = String(override.happyHourDetails || override.happy_hour_details || '').trim();
  let price = '';
  if (category === 'flight') price = flightPriceDisplay(place, trip);
  else if (category === 'hotel') price = hotelPriceDisplay(place, trip);
  else if (category === 'car') price = carPriceDisplay(place, trip);
  else {
    const numeric = numericPrice(place, trip);
    if (numeric != null) price = `$${numeric}`;
  }
  return (
    <li data-list-row="1" data-summary-itinerary="1">
      <BudgetLogoChip place={place} trip={trip} />
      <span>
        <strong>{title}</strong>
        {price ? (
          <div className="tsv-keepsake-dir-meta" data-list-price="1">
            {price}
          </div>
        ) : null}
        {happyHour ? (
          <div className="tsv-keepsake-dir-meta" data-happy-hour="1">
            {happyHour}
          </div>
        ) : null}
        {summary ? (
          <div className="tsv-keepsake-dir-summary" data-list-summary="1">
            {summary}
          </div>
        ) : null}
      </span>
    </li>
  );
}

function KeepsakeDailyThing({
  entry,
  trip,
  style,
}: {
  entry: TimelineEntry;
  trip: SharedTripPayload;
  style: 1 | 2;
}) {
  if (entry.kind === 'travel' || !entry.place) {
    return (
      <article className="thing tsv-keepsake-travel-row">
        <h3>{entry.title}</h3>
      </article>
    );
  }
  const place = entry.place;
  const category = tabCategoryKey(place, trip);
  let price = '';
  if (category === 'flight') price = flightPriceDisplay(place, trip);
  else if (category === 'hotel') price = hotelPriceDisplay(place, trip);
  else if (category === 'car') price = carPriceDisplay(place, trip);

  const media = [
    ...(Array.isArray((place as SharedPlace & { bound_media?: MediaRow[] }).bound_media)
      ? (place as SharedPlace & { bound_media?: MediaRow[] }).bound_media!
      : []),
  ];

  return (
    <article
      className={`thing daily-thing${style === 2 ? ' style2-thing' : ''}`}
      data-thing-id={String(place.id)}
    >
      <div className="thing-head">
        <BudgetLogoChip place={place} trip={trip} />
        <div>
          <h3>{entry.title || placeName(place)}</h3>
          {price ? <div className="thing-meta">{price}</div> : null}
        </div>
      </div>
      {entry.summary ? (
        <p data-row-summary="1" data-summary-thing-only="1">
          {entry.summary}
        </p>
      ) : null}
      {entry.itineraryNote ? <p className="tsv-keepsake-itinerary-note">{entry.itineraryNote}</p> : null}
      {media.length ? (
        <div className="thing-media">
          {media.map((row, index) => (
            <KeepsakeMediaCard key={String(row.id ?? index)} row={row} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function KeepsakeDailyPage({
  trip,
  tripTitle,
  style,
  dayPage,
}: {
  trip: SharedTripPayload;
  tripTitle: string;
  style: 1 | 2;
  dayPage: { day: SharedDay; timeline: TimelineEntry[] };
}) {
  const day = dayPage.day;
  const title = dayChipLabel(day);
  const printReady = style === 2 ? 'style2' : 'daily';
  const pageClass =
    style === 2
      ? 'tsv-keepsake-page tsv-keepsake-day daily-page style2-page'
      : 'tsv-keepsake-page tsv-keepsake-day daily-page';

  return (
    <section
      className={pageClass}
      data-print-ready={printReady}
      data-day={String(day.day_number ?? '')}
      data-day-things-2col={style === 2 ? '1' : undefined}
      data-style2-centered-day={style === 2 ? '1' : undefined}
    >
      <KeepsakePrintBrand tripTitle={tripTitle} style={style} />
      <h2>{title}</h2>
      <div className={style === 2 ? 'style2-day-opening' : 'daily-grid'}>
        {style === 2 ? (
          <main className="style2-details" data-day-things-flow="1">
            {dayPage.timeline.map((entry) => (
              <KeepsakeDailyThing key={entry.id} entry={entry} trip={trip} style={style} />
            ))}
          </main>
        ) : (
          <>
            <aside className="daily-left">
              <DayTimeline trip={trip} entries={dayPage.timeline} onOpen={() => {}} />
            </aside>
            <main className="daily-details" data-day-things-flow="1">
              {dayPage.timeline.map((entry) => (
                <KeepsakeDailyThing key={entry.id} entry={entry} trip={trip} style={style} />
              ))}
            </main>
          </>
        )}
      </div>
    </section>
  );
}

export function KeepsakeLogoFooter() {
  return (
    <p className="tsv-keepsake-brand-logo print-brand pdf-final-logo" data-last-page-logo="1">
      TimeSyncher ⌛ Vacation
    </p>
  );
}
