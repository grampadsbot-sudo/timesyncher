export function onboardingCapturesRequired(vacation) {
  return Boolean(String(vacation?.harnessTag || '').trim());
}

export function onboardingCapturesMissing(vacation, artifacts) {
  if (!onboardingCapturesRequired(vacation)) return false;
  if (!artifacts || artifacts.failed) return false;
  const shots = artifacts.onboardingCaptures || [];
  return shots.length === 0;
}

export function onboardingMissingMessage(runId) {
  const id = String(runId || '').trim() || 'unknown';
  return { role: 'alert', text: `Onboarding captures missing for this run ${id}.`, runId: id };
}