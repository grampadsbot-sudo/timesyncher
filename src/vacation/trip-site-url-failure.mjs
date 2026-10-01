export function tripSiteUrlFailure(reason, tripId) {
  const error = new Error(String(reason || ''));
  error.statusCode = 502;
  error.code = 'onboarding_trip_site_url_failed';
  error.reason = error.message;
  error.tripId = String(tripId || '');
  console.log(JSON.stringify({ reason: error.reason, tripId: error.tripId }));
  return error;
}
