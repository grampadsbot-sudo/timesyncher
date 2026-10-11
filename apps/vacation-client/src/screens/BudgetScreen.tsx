import type { SharedTripPayload } from '../types/sharedTrip';

type Props = {
  trip: SharedTripPayload;
};

export function BudgetScreen({ trip }: Props) {
  const lines = trip.budget || [];
  return (
    <section className="tsv-screen" data-tab="budget">
      <h2 className="tsv-subhead">Budget</h2>
      {lines.length === 0 ? (
        <p className="tsv-empty" role="alert">
          Budget is empty — production must include every priced thing (R2).
        </p>
      ) : (
        <table className="tsv-budget-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Item</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={`${line.name}-${idx}`}>
                <td>{line.category || '—'}</td>
                <td>{line.name || '—'}</td>
                <td>
                  {line.total_price != null ? `$${line.total_price}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
