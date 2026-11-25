export const HOUSEHOLD_PLAN_YEAR_LINE = "The household plan covers the family's vacations for the whole year.";
export const HOUSEHOLD_PLAN_YEAR_FRAGMENT = "covers the family's vacations for the whole year";
export const HOUSEHOLD_PLAN_YEAR_PATTERN = /covers the family's vacations for the whole year/i;

const OLD_PLAN_LINE = /\bthe household plan is unlimited vacations for the whole year\.?/gi;
const OLD_PLAN_TAIL = /\bunlimited vacations for the whole year\b/gi;

export function upgradeHouseholdPlanYearWording(text) {
  return String(text || '')
    .replace(OLD_PLAN_LINE, HOUSEHOLD_PLAN_YEAR_LINE)
    .replace(OLD_PLAN_TAIL, HOUSEHOLD_PLAN_YEAR_FRAGMENT);
}