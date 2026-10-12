import { BudgetLogoChip } from '../components/BudgetLogoChip';
import {
  buildBudgetModel,
  formatUsd,
  bucketIcon,
} from '../lib/budgetModel.mjs';
import { budgetLineDisplayName } from '../lib/listTabModel.mjs';
import type { SharedPlace, SharedTripPayload } from '../types/sharedTrip';

type Props = {
  trip: SharedTripPayload;
  onOpen: (place: SharedPlace) => void;
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

export function BudgetScreen({ trip, onOpen }: Props) {
  const model = buildBudgetModel(trip);

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
          <span className="tsv-budget-timeline-pill">{formatUsd(model.tripPlanned, model.currency)} timeline</span>
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
                {formatUsd(bucket.planned, model.currency)} timeline
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
                  data-place-name={row.name}
                >
                  <BudgetLogoChip
                    place={row.place}
                    trip={trip}
                    fallback={bucketIcon(bucket.label)}
                  />
                  <div className="tsv-budget-line-main">
                    <button
                      type="button"
                      className="tsv-budget-line-name"
                      aria-label={budgetLineDisplayName(row.place, trip)}
                      onClick={() => onOpen(row.place)}
                    >
                      {row.name}
                    </button>
                    <span className="tsv-budget-line-amount">
                      {row.hasPrice ? formatUsd(row.amount, model.currency) : 'Add price'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}
