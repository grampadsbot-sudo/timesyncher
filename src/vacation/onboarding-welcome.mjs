import { readFileSync } from 'node:fs';

const TEMPLATE_FILE = new URL('../../content/onboarding-welcome.json', import.meta.url);

const AUDIENCES = new Set(['owner', 'collaborator', 'owner_no_site', 'collaborator_no_site']);

const REQUIRED = {
  owner: ['firstName', 'tripSiteUrl'],
  collaborator: ['collabFirstName', 'ownerFirstName', 'tripTitle', 'tripSiteUrl'],
  owner_no_site: ['firstName'],
  collaborator_no_site: ['collabFirstName', 'ownerFirstName', 'tripTitle'],
};

export function missingWelcomeFields(input = {}) {
  const audience = AUDIENCES.has(input?.audience) ? input.audience : '';
  if (!audience) return ['audience'];
  return REQUIRED[audience].filter((key) => !String(input[key] ?? '').trim());
}

function rejectWelcome(reason) {
  console.error(reason);
  const error = new Error(reason);
  error.statusCode = 502;
  throw error;
}

export function renderOnboardingWelcome(input = {}, deps = {}) {
  void deps?.jevPrecall;
  void deps?.callTieredModel;
  const audience = AUDIENCES.has(input?.audience) ? input.audience : '';
  if (!audience) rejectWelcome('onboarding welcome missing audience');
  const required = REQUIRED[audience];
  const values = {};
  for (const key of required) {
    const value = String(input[key] ?? '').trim();
    if (!value) rejectWelcome(`onboarding welcome missing ${key}`);
    values[key] = value;
  }
  let templates;
  try {
    templates = JSON.parse(readFileSync(TEMPLATE_FILE, 'utf8'));
  } catch (error) {
    rejectWelcome(`onboarding welcome template unreadable: ${error?.message || error}`);
  }
  const template = templates?.[audience];
  if (typeof template !== 'string' || !template.trim()) rejectWelcome(`onboarding welcome template missing ${audience}`);
  let text = template;
  for (const key of required) {
    const token = `{${key}}`;
    if (!text.includes(token)) rejectWelcome(`onboarding welcome template missing ${token}`);
    text = text.split(token).join(values[key]);
  }
  const leftover = text.match(/\{[A-Za-z0-9]+\}/);
  if (leftover) rejectWelcome(`onboarding welcome left ${leftover[0]} unfilled`);
  return text;
}

export function cannedWelcomeLiveTurn({ text, at, latencyMs = null, sessionE2eMs = null } = {}) {
  return {
    turnIndex: 1,
    role: 'app',
    modality: 'text',
    text: String(text || ''),
    at: at || null,
    latencyMs,
    sessionE2eMs,
    telemetry: {
      kind: 'canned_welcome',
      tier: 'n/a',
      model: 'n/a',
      jevRan: false,
      reason: 'fixed_onboarding_opener',
    },
  };
}
