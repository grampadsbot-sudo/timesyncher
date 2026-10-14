import { useEffect, useId, useRef } from 'react';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import { buildDetailViewModel } from '../lib/detailModel.mjs';

type Props = {
  place: SharedPlace;
  trip: SharedTripPayload;
  onClose: () => void;
};

function DetailLogo({ logoUrl }: { logoUrl: string }) {
  return (
    <span className="tsv-detail-logo-chip" data-ts-detail-logo-chip="1" aria-hidden="true">
      <img className="tsv-detail-logo" src={logoUrl} alt="" />
    </span>
  );
}

export function ThingDetailPanel({ place, trip, onClose }: Props) {
  const model = buildDetailViewModel(place, trip);
  const titleId = useId();
  const sheetRef = useRef<HTMLElement>(null);
  const backdropDownRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
  }, [onClose]);

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
          <div className="tsv-detail-title-row">
            {model.showLogo ? <DetailLogo logoUrl={model.logoUrl} /> : null}
            <h2 id={titleId} className="tsv-detail-name" data-ts-detail-name="1">
              {model.name}
            </h2>
            <button type="button" className="tsv-detail-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </header>
        <div className="tsv-detail-body">
          {model.priceLabel ? (
            <p className="tsv-detail-price" data-ts-detail-field="price">
              <strong>Price:</strong> {model.priceLabel}
            </p>
          ) : null}
          {model.ratingLines.map((line) => (
            <p key={line.id} className="tsv-detail-rating" data-ts-detail-field="rating">
              {line.text}
            </p>
          ))}
          {model.summary ? (
            <p className="tsv-detail-summary" data-ts-detail-field="summary">
              {model.summary}
            </p>
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
          {model.itineraryNote ? (
            <p className="tsv-detail-note" data-ts-detail-field="itineraryNote">
              <strong>Itinerary note:</strong> {model.itineraryNote}
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
                    {review.rating ? (
                      <div className="tsv-review-stars">{review.rating} ★</div>
                    ) : null}
                    <p>{review.text}</p>
                    {review.source && !model.reviewFootnote ? <footer>{review.source}</footer> : null}
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
