import { budgetCompletenessChecks } from '../../apps/vacation-client/src/lib/budgetModel.mjs';

function optionalMissingPriceCount(checks = []) {
  const report = checks.find((check) => check.name.startsWith('report_optional_budget_missing_prices_'));
  if (!report) return null;
  const suffix = report.name.slice('report_optional_budget_missing_prices_'.length);
  const count = Number(suffix);
  return Number.isFinite(count) ? count : null;
}

export function gateBBudgetPriceCompleteness(trip = {}) {
  const checks = budgetCompletenessChecks(trip);
  const requiredTravel = checks.find((check) => check.name === 'required_travel_budget_prices');
  const failingRequired = checks.filter(
    (check) => check.name.startsWith('required_price_') && !check.pass,
  );
  const optionalMissing = optionalMissingPriceCount(checks);
  const pass = requiredTravel?.pass === true && failingRequired.length === 0;
  return {
    pass,
    optionalMissingPriceCount: optionalMissing ?? 0,
    checks: checks.filter(
      (check) => check.name === 'required_travel_budget_prices'
        || check.name.startsWith('required_price_')
        || check.name.startsWith('report_optional_budget_missing_prices_'),
    ),
  };
}
