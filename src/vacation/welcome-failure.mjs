export function onboardingWelcomeFailure(reason, tripId) {
  const error = new Error(String(reason || ''));
  error.statusCode = 502;
  error.code = 'onboarding_welcome_failed';
  error.reason = error.message;
  error.tripId = String(tripId || '');
  return error;
}

export function welcomeFailureBody(error) {
  if (error?.code !== 'onboarding_welcome_failed') return null;
  console.log(JSON.stringify({ reason: error.reason, tripId: error.tripId }));
  return { ok: false, code: error.code, reason: error.reason, error: error.reason };
}
