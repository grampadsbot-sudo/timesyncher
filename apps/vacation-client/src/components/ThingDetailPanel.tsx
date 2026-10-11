import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';
import { overrideFor, placeName, priceLabel, summaryText } from '../lib/placeHelpers';

type Props = {
  place: SharedPlace;
  trip: SharedTripPayload;
  onClose: () => void;
};

export function ThingDetailPanel({ place, trip, onClose }: Props) {
  const o = overrideFor(trip, place);
  const reviews = [1, 2, 3, 4].map((i) => {
    const text = o[`review${i}`];
    const rating = o[`review${i}Rating`];
    const source = o[`review${i}Source`];
    if (typeof text !== 'string' || !text.trim()) return null;
    return { text, rating, source };
  }).filter(Boolean) as Array<{ text: string; rating: unknown; source: unknown }>;

  return (
    <aside className="tsv-detail" role="dialog" aria-label="Thing details">
      <header className="tsv-detail-head">
        <h2>{placeName(place)}</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="tsv-detail-body">
        {priceLabel(place, trip) ? <p><strong>Price:</strong> {priceLabel(place, trip)}</p> : null}
        {summaryText(place, trip) ? <p>{summaryText(place, trip)}</p> : null}
        {typeof o.address === 'string' && o.address ? <p><strong>Address:</strong> {o.address}</p> : null}
        {typeof o.phone === 'string' && o.phone ? <p><strong>Phone:</strong> {o.phone}</p> : null}
        {typeof o.hours === 'string' && o.hours ? <p><strong>Hours:</strong> {o.hours}</p> : null}
        {typeof o.website === 'string' && o.website ? (
          <p>
            <strong>Website:</strong>{' '}
            <a href={o.website} target="_blank" rel="noreferrer">
              {o.website}
            </a>
          </p>
        ) : null}
        {typeof o.happyHourDetails === 'string' && o.happyHourDetails ? (
          <p><strong>Happy hour:</strong> {o.happyHourDetails}</p>
        ) : null}
        {reviews.length ? (
          <section>
            <h3>Reviews</h3>
            <ul className="tsv-reviews">
              {reviews.map((r, idx) => (
                <li key={idx} className="tsv-review-box">
                  {r.rating ? <div className="tsv-review-stars">{String(r.rating)} ★</div> : null}
                  <p>{r.text}</p>
                  {r.source ? <footer>{String(r.source)}</footer> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="tsv-muted">Detail fields populate from API thingOverrides (P1 skeleton).</p>
        )}
      </div>
    </aside>
  );
}
