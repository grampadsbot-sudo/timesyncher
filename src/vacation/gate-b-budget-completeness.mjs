import {
  liveBudgetPlacesFromShared,
  placeOnTripTimeline,
  timelineBudgetPlaceIds,
  tripUsesTimelineScopedBudget,
} from './shared-budget-itinerary-membership.mjs';

function placeKey(place = {}) {
  return String(place.id ?? place.place_id ?? '').trim();
}

/** Distinct timeline things that should render a Budget tab row (includes cars). */
export function expectedBudgetDomRowPlaceIds(shared = {}) {
  if (!tripUsesTimelineScopedBudget(shared)) {
    return new Set((shared.places || []).map((place) => placeKey(place)).filter(Boolean));
  }
  return timelineBudgetPlaceIds(shared);
}

export function budgetCompletenessChecks(shared = {}, renderedRowPlaceIds = null) {
  const expectedIds = expectedBudgetDomRowPlaceIds(shared);
  const checks = {};
  const budgetPlaces = liveBudgetPlacesFromShared(shared);

  for (const place of budgetPlaces) {
    const id = placeKey(place);
    const onTimeline = placeOnTripTimeline(shared, place);
    checks[`row_on_timeline_${id}`] = {
      pass: onTimeline,
      placeId: id,
    };
  }

  if (renderedRowPlaceIds != null) {
    const actual = [...new Set((renderedRowPlaceIds || []).map((id) => String(id)).filter(Boolean))];
    for (const id of actual) {
      if (checks[`row_on_timeline_${id}`]) continue;
      checks[`row_on_timeline_${id}`] = {
        pass: expectedIds.has(id),
        placeId: id,
        reason: expectedIds.has(id) ? undefined : 'dom_row_not_on_timeline',
      };
    }
    checks.budget_row_count = {
      pass: actual.length === expectedIds.size,
      expected: expectedIds.size,
      actual: actual.length,
      renderedRowPlaceIds: actual,
    };
  }

  const failing = Object.entries(checks).filter(([, row]) => row && row.pass === false);
  return {
    pass: failing.length === 0,
    checks,
    expectedTimelinePlaceCount: expectedIds.size,
    failing,
  };
}
