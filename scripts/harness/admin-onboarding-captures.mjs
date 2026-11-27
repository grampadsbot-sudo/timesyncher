export function couponHarnessRequiresAdminOnboarding(story) {
  return Boolean(story?.coupon) && (story?.steps || []).includes('collaborator');
}

export function assertAdminOnboardingCaptures(story, adminArtifacts) {
  if (!couponHarnessRequiresAdminOnboarding(story)) return '';
  const count = adminArtifacts?.onboardingCaptures?.length || 0;
  if (count > 0) return '';
  return 'admin-onboarding-captures-missing';
}