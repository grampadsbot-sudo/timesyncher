import { cleanText } from './http.mjs';

function isShellToken(value) {
  return /^(shell|intake)-[a-z0-9]+$/i.test(value);
}

function isPurchaseOrUpgradeRecord(trip = {}) {
  const metadata = trip.metadata && typeof trip.metadata === 'object' ? trip.metadata : {};
  const status = cleanText(trip.status, 80).toLowerCase();
  const source = cleanText(metadata.source, 120).toLowerCase();
  const title = cleanText(trip.title, 180);
  return (
    status === 'account_upgrade'
    || metadata.notARealVacation === true
    || trip.notARealVacation === true
    || trip.not_a_real_vacation === true
    || source === 'account_upgrade_cleanup'
    || /\bunlimited\s+account\s+upgrade\b/i.test(title)
  );
}

function isSetupStubTitle(title) {
  return /^timesyncher\s+vacation\s+setup$/i.test(title);
}

function tripHasItems(trip) {
  if (trip.has_items === true || trip.hasItems === true) return true;
  const count = Number(trip.item_count ?? trip.itemCount ?? trip.thing_count ?? trip.thingCount ?? 0);
  return Number.isFinite(count) && count > 0;
}

export function isPlaceholderTripRecord(trip = {}) {
  if (!trip || typeof trip !== 'object') return true;
  if (isPurchaseOrUpgradeRecord(trip)) return true;
  const metadata = trip.metadata && typeof trip.metadata === 'object' ? trip.metadata : {};
  const status = cleanText(trip.status, 80).toLowerCase();
  const source = cleanText(metadata.source, 120).toLowerCase();
  const destination = cleanText(trip.destination, 180);
  const title = cleanText(trip.title, 180);
  const start = trip.start_date || trip.startDate;
  const end = trip.end_date || trip.endDate;
  const hasItems = tripHasItems(trip);
  const neverStartedOnboarding = trip.never_started_onboarding === true || trip.neverStartedOnboarding === true;
  const displayTitle = isShellToken(title) ? '' : title;
  const displayDestination = isShellToken(destination) ? '' : destination;
  if (isSetupStubTitle(displayTitle) && !end && !hasItems) return true;
  if (metadata.placeholderTrip === true && !displayDestination && !end && !hasItems) return true;
  if (
    neverStartedOnboarding
    && status === 'onboarding'
    && !displayDestination
    && !end
    && !hasItems
    && metadata.placeholderTrip !== false
    && source !== 'vacation_app_chat'
  ) {
    return true;
  }
  if (displayDestination || (start && end) || hasItems) return false;
  if (displayTitle && !isSetupStubTitle(displayTitle)) return false;
  if (end) return false;
  return true;
}

export function isUpgradeablePlaceholderTrip(trip = {}) {
  if (!trip || typeof trip !== 'object') return false;
  if (isPurchaseOrUpgradeRecord(trip)) return false;
  return isPlaceholderTripRecord(trip);
}
