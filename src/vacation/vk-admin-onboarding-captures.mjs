export const INVITE_ONBOARDING_STAGES = {
  'invite-email': 'Invite email',
  'accept-link': 'Accept-link landing',
  'sign-in-or-join': 'Sign-in or join',
  'first-view': 'First view',
  'shared-landing': 'Shared URL landing',
};

const roleLabels = {
  telegram_collaborator: 'Collaborator',
  web_editor: 'Trip editor',
  viewer: 'Viewer',
};

export function onboardingCaptureTag(artifact, vacationId) {
  const match = /^onboarding-(telegram_collaborator|web_editor|viewer)-([a-f\d]{12})-([a-z-]+)-(390|430)$/.exec(artifact);
  if (!match) return null;
  const [, role, guest, screen, width] = match;
  if (!Object.hasOwn(INVITE_ONBOARDING_STAGES, screen) || (role === 'viewer') !== (screen === 'shared-landing')) return null;
  return { artifact, vacationId, role, roleLabel: roleLabels[role], guest, screen, title: INVITE_ONBOARDING_STAGES[screen], width: Number(width) };
}

export function listOnboardingCaptureTags(names, vacationId) {
  const roles = Object.keys(roleLabels);
  const screens = Object.keys(INVITE_ONBOARDING_STAGES);
  return names.map((name) => onboardingCaptureTag(name, vacationId)).filter(Boolean).sort((a, b) =>
    roles.indexOf(a.role) - roles.indexOf(b.role) || a.guest.localeCompare(b.guest)
    || screens.indexOf(a.screen) - screens.indexOf(b.screen) || a.width - b.width);
}
