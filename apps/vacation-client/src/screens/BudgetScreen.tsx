import { BudgetLogoChip } from '../components/BudgetLogoChip';
import {
  buildBudgetModel,
  bucketIcon,
  budgetBucketForPlace,
  formatUsd,
} from '../lib/budgetModel.mjs';
import { catalogRowDisplayName, tabCategoryKey } from '../lib/listTabModel.mjs';
import { overrideFor } from '../lib/placeHelpers';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';

type Props = {
  trip: SharedTripPayload;
  onOpen: (place: SharedPlace) => void;
  canEdit?: boolean;
  onTimelineChange?: (place: SharedPlace, checked: boolean) => void;
};

function TargetReadout({
  planned,
  target,
  currency,
  ariaLabel,
}: {
  planned: number;
  target: number | null;
  currency: string;
  ariaLabel: string;
}) {
  return (
    <span className="tsv-budget-target-line">
      <span className="tsv-budget-planned">{formatUsd(planned, currency)}</span>
      <span className="tsv-budget-target-sep"> / </span>
      <span className="tsv-budget-target-prefix">$</span>
      <input
        className="tsv-budget-target-input"
        type="text"
        readOnly
        aria-label={ariaLabel}
        value={target !== null ? String(target) : '0'}
      />
    </span>
  );
}

function timelineRemoveLabel(place: SharedPlace, trip: SharedTripPayload) {
  const override = overrideFor(trip, place);
  const bucket = budgetBucketForPlace(place, trip);
  const icon = bucketIcon(bucket);
  const category = tabCategoryKey(place, trip);
  if (category === 'car') {
    const company = text(override.rentalCompany || '');
    if (company) return { icon, label: company };
    const name = catalogRowDisplayName(place, trip);
    const parts = name.split(/\s+/);
    if (/priceline/i.test(name) && parts.length >= 2) {
      return { icon, label: `${parts[0]} ${parts[1]}` };
    }
  }
  return { icon, label: catalogRowDisplayName(place, trip) };
}

function text(value: unknown) {
  return String(value ?? '').trim();
}

function placeOnTimeline(place: SharedPlace, trip: SharedTripPayload) {
  return Boolean(overrideFor(trip, place).timeline);
}

function showBudgetRemoveControl(place: SharedPlace, trip: SharedTripPayload) {
  if (placeOnTimeline(place, trip)) return true;
  const category = tabCategoryKey(place, trip);
  if (category !== 'car') return false;
  return Boolean(text(overrideFor(trip, place).rentalCompany));
}

export function BudgetScreen({ trip, onOpen, canEdit = false, onTimelineChange }: Props) {
  const model = buildBudgetModel(trip);
  const timelineRows = model.rows.filter((row) => showBudgetRemoveControl(row.place, trip));

  if (model.isEmpty) {
    return (
      <section className="tsv-screen tsv-budget-screen" data-tab="budget">
        <p className="tsv-empty" role="alert">
          Budget is empty — production must include every priced thing (R2).
        </p>
      </section>
    );
  }

  return (
    <section className="tsv-screen tsv-budget-screen" data-tab="budget">
      <div className="tsv-budget-panel" data-ts-budget-panel="1">
        {timelineRows.length ? (
          <div className="tsv-budget-timeline-controls" data-ts-budget-header-controls="1">
            {timelineRows.map((row) => {
              const { icon, label } = timelineRemoveLabel(row.place, trip);
              const controlLabel = `Remove ${icon} ${label}`;
              return (
                <button
                  key={`remove-${String(row.place.id)}`}
                  type="button"
                  className="tsv-budget-remove-control"
                  data-ts-budget-remove-control="1"
                  aria-label={controlLabel}
                  disabled={!canEdit || !onTimelineChange}
                  onClick={() => onTimelineChange?.(row.place, false)}
                >
                  {controlLabel}
                </button>
              );
            })}
          </div>
        ) : null}
        <h2 className="tsv-budget-overall-title">Overall trip budget</h2>

        <div className="tsv-budget-trip-total" data-ts-budget-trip-total="1">
          <span className="tsv-budget-trip-icon" aria-hidden="true">
            💵
          </span>
          <span className="tsv-budget-trip-label">Trip total</span>
          <TargetReadout
            planned={model.tripPlanned}
            target={model.tripTarget}
            currency={model.currency}
            ariaLabel="Trip total target"
          />
          <span className="tsv-budget-timeline-pill">
            {formatUsd(model.tripTimelinePlanned, model.currency)} timeline
          </span>
          {model.tripVariance ? (
            <span className="tsv-budget-variance-pill">{model.tripVariance}</span>
          ) : null}
        </div>

        {model.buckets.map((bucket) => (
          <section
            key={bucket.label}
            className="tsv-budget-bucket"
            data-ts-budget-bucket={bucket.label}
          >
            <div className="tsv-budget-bucket-head">
              <span className="tsv-budget-bucket-icon" aria-hidden="true">
                {bucket.icon}
              </span>
              <span className="tsv-budget-bucket-label">{bucket.displayLabel}</span>
              <TargetReadout
                planned={bucket.planned}
                target={bucket.target}
                currency={model.currency}
                ariaLabel={`${bucket.displayLabel} target`}
              />
              <span className="tsv-budget-timeline-pill">
                {formatUsd(bucket.timelinePlanned, model.currency)} timeline
              </span>
              {bucket.variance ? (
                <span className="tsv-budget-variance-pill">{bucket.variance}</span>
              ) : null}
            </div>
            <ul className="tsv-budget-lines">
              {bucket.rows.map((row) => (
                <li
                  key={String(row.place.id)}
                  className="tsv-budget-line"
                  data-ts-budget-row="1"
                  data-place-id={String(row.place.id)}
                >
                  <BudgetLogoChip
                    place={row.place}
                    trip={trip}
                    fallback={bucketIcon(bucket.label)}
                  />
                  <button
                    type="button"
                    className="tsv-budget-line-name"
                    data-ts-budget-control="1"
                    onClick={() => onOpen(row.place)}
                  >
                    {catalogRowDisplayName(row.place, trip)}
                  </button>
                  <span className="tsv-budget-line-amount">
                    {row.hasPrice ? formatUsd(row.amount, model.currency) : 'Add price'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
