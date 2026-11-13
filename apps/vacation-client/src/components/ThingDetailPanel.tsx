import { useEffect, useId, useRef, useState } from 'react';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import { buildDetailViewModel } from '../lib/detailModel.mjs';
import { onLogoImgError, onLogoImgLoad } from '../lib/logoChipHandlers.mjs';
import { mediaForPlace } from '../lib/dayTimelineModel.mjs';
import { overrideFor } from '../lib/placeHelpers';
import { StarRating } from './StarRating';
import type { DetailAddressHoursLine } from '../lib/detailModel.mjs';
import { detailLongDetails } from '../lib/detailModel.mjs';

type Props = {
  place: SharedPlace;
  trip: SharedTripPayload;
  onClose: () => void;
  canEdit?: boolean;
  onPatchField?: (field: string, value: string) => void;
};

function DetailLogo({ logoUrl }: { logoUrl: string }) {
  return (
    <span className="tsv-detail-logo-chip" data-ts-detail-logo-chip="1" data-ts-logo-chip="1" aria-hidden="true" data-ts-fallback-emoji="📍">
      <img
        className="tsv-detail-logo"
        src={logoUrl}
        alt=""
        onError={(event) => onLogoImgError(event, '📍')}
        onLoad={(event) => onLogoImgLoad(event, '📍')}
      />
    </span>
  );
}

function ThingDetailPanelInner({ place, trip, onClose, canEdit = false, onPatchField }: Props) {
  const model = buildDetailViewModel(place, trip);
  const override = overrideFor(trip, place);
  const [editMode, setEditMode] = useState(false);
  const details = detailLongDetails(place, trip);
  const photos = mediaForPlace(trip, place).filter((row) => String(row.kind || row.mediaKind || '') !== 'video' && !String(row.mimeType || row.mime_type || '').startsWith('video/') && !/\.mp4(?:[?#]|$)/i.test(String(row.url || row.publicUrl || '')));
  const dayIds = Array.isArray(override.dayIds) ? override.dayIds : (trip.days || []).filter((day) =>
    (trip.assignments?.[String(day.id)] || []).some((row) => String(row.place_id ?? row.item?.id) === String(place.id)),
  ).map((day) => day.id);
  const titleId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const backdropDownRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (editMode) setEditMode(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheetRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [editMode, onClose]);

  return (
    <div
      className="tsv-detail-backdrop"
      data-ts-detail-backdrop="1"
      role="presentation"
      onPointerDown={(event) => {
        backdropDownRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && backdropDownRef.current) onClose();
        backdropDownRef.current = false;
      }}
    >
      <aside
        ref={sheetRef}
        className="tsv-detail-sheet"
        data-ts-detail-panel="1"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tsv-detail-head">
          {model.headerLabel ? (
            <p className="tsv-detail-category" data-ts-detail-category="1">
              {model.headerLabel}
            </p>
          ) : null}
          <div className="tsv-detail-title-row" data-ts-detail-title-wrap="1">
            {model.showLogo ? <DetailLogo logoUrl={model.logoUrl} /> : null}
            <h2 id={titleId} className="tsv-detail-name" data-ts-detail-name="1">
              {model.name}
            </h2>
            <span className="tsv-detail-title-actions">
              {canEdit && !editMode ? (
                <button
                  type="button"
                  className="tsv-detail-edit"
                  data-ts-detail-edit="1"
                  aria-label="Edit thing"
                  onClick={() => setEditMode(true)}
                >
                  ✎
                </button>
              ) : null}
              <button
                type="button"
                className="tsv-detail-close"
                data-ts-detail-close="1"
                onClick={() => {
                  setEditMode(false);
                  onClose();
                }}
                aria-label="Close"
              >
                ×
              </button>
            </span>
          </div>
        </header>
        <div className="tsv-detail-body">
          {editMode && canEdit ? (
            <label className="tsv-detail-price tsv-detail-field" data-ts-detail-field="price">
              <strong>Price:</strong>{' '}
              <input
                type="text"
                value={String(override.price ?? '')}
                onChange={(event) => onPatchField?.('price', event.target.value)}
                inputMode="decimal"
                aria-label="Price"
                style={{ marginLeft: 4, maxWidth: '100%', fontSize: 13 }}
              />
            </label>
          ) : model.priceLabel ? (
            <p className="tsv-detail-price" data-ts-detail-field="price">
              <strong>Price:</strong> {model.priceLabel}
            </p>
          ) : null}
          {model.ratingLines.map((line) => (
            <p key={line.id} className="tsv-detail-rating" data-ts-detail-field="rating">
              <StarRating value={line.value} />
              {line.caption ? <span className="tsv-detail-rating-caption"> {line.caption}</span> : null}
            </p>
          ))}
          {model.summary ? (
            <p className="tsv-detail-summary" data-ts-detail-field="summary">
              {model.summary}
            </p>
          ) : null}
          {model.addressHoursBox ? (
            <div className="tsv-detail-info-box" data-ts-detail-info-box="address-hours">
              {model.addressHoursBox.lines.map((line: DetailAddressHoursLine) => (
                <p key={line.key} className="tsv-detail-field" data-ts-detail-field={line.key}>
                  <strong>{line.label}:</strong> {line.value}
                </p>
              ))}
            </div>
          ) : null}
          {model.phoneCallBox ? (
            <a
              className="tsv-detail-info-box tsv-detail-phone-box"
              data-ts-detail-info-box="phone"
              href={model.phoneCallBox.href}
            >
              <strong>Phone:</strong> {model.phoneCallBox.phone}
            </a>
          ) : null}
          {model.fieldRows.map((row) => (
            <p key={row.key} className="tsv-detail-field" data-ts-detail-field={row.key}>
              <strong>{row.label}:</strong>{' '}
              {row.href ? (
                <a href={row.href} target="_blank" rel="noreferrer">
                  {row.value}
                </a>
              ) : (
                row.value
              )}
            </p>
          ))}
          {model.happyHourDetails ? (
            <p className="tsv-detail-happy-hour" data-ts-detail-field="happyHour">
              <strong>Happy hour:</strong> {model.happyHourDetails}
            </p>
          ) : null}
          {model.reviews.length ? (
            <section className="tsv-detail-reviews" data-ts-detail-reviews="1">
              <h3>Reviews</h3>
              <ul className="tsv-reviews">
                {model.reviews.map((review) => (
                  <li key={review.index} className="tsv-review-box" data-ts-detail-review="1">
                    {review.compositeLabel ? (
                      <p className="tsv-review-composite" data-ts-detail-review-composite="1">
                        {review.compositeLabel}
                      </p>
                    ) : null}
                    {review.ratingValue != null ? (
                      <div className="tsv-review-stars">
                        <StarRating value={review.ratingValue} />
                      </div>
                    ) : null}
                    <p>{review.text}</p>
                  </li>
                ))}
              </ul>
              {model.reviewFootnote ? (
                <p className="tsv-detail-review-footnote" data-ts-detail-review-footnote="1">
                  {model.reviewFootnote}
                </p>
              ) : null}
              {model.reviewTotalsLine ? (
                <p className="tsv-detail-review-totals" data-ts-detail-review-totals="1">
                  {model.reviewTotalsLine}
                </p>
              ) : null}
            </section>
          ) : null}
          {model.itineraryNote ? (
            <p className="tsv-detail-note" data-ts-detail-field="itineraryNote">
              <strong>Itinerary note:</strong> {model.itineraryNote}
            </p>
          ) : null}
          {details ? (
            <section className="tsv-detail-note" data-ts-detail-field="longDetails">
              <h3>Details</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{details}</p>
            </section>
          ) : null}
          <div className="tsv-row-chips" data-ts-detail-timeline="1">
            {dayIds.map((id) => {
              const day = (trip.days || []).find((row) => String(row.id) === String(id));
              return day ? <span key={String(id)}>D{day.day_number}</span> : null;
            })}
            <label className="tsv-timeline-toggle">
              <input type="checkbox" checked={Boolean(override.timeline)} disabled readOnly /> Timeline
            </label>
          </div>
          {photos.length ? (
            <div className="tsv-row-chips" data-ts-detail-photos="1">
              {photos.map((photo, index) => (
                <img key={index} src={photo.thumbnailUrl || photo.thumbnail_url || photo.publicUrl || photo.url} alt={photo.caption || ''} width={58} height={58} style={{ objectFit: 'cover', borderRadius: 10 }} />
              ))}
            </div>
          ) : null}
          {model.summarySourceUrls.length ? (
            <section className="tsv-detail-sources">
              <h3>Summary sources</h3>
              <ul>
                {model.summarySourceUrls.map((url, index) => (
                  <li key={`${index}-${url}`}>
                    <a href={url} target="_blank" rel="noreferrer">
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

export function ThingDetailPanel(props: Props) {
  return <ThingDetailPanelInner key={String(props.place.id)} {...props} />;
}
