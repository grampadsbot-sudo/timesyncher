const REQUIRED_SKILLS = new Set([
  'timesyncher-travel-assistant',
  'timesyncher-travel-method-registry',
  'timesyncher-travel-ui',
  'timesyncher-travel-thing-editor',
  'timesyncher-travel-restaurant-tagger',
  'timesyncher-travel-store-tagger',
  'timesyncher-vacation-production-capability',
  'timesyncher-vacation-public-research-worker',
]);

const REQUIRED_TOOL_LANES = new Set([
  'public-web-search',
  'browser-automation',
  'weather',
  'filesystem-read-product-gbrain',
  'hosted-queue-read-write',
  'trek-agent-edit-runner',
]);

const REQUIRED_BLOCKED = new Set([
  'gmail',
  'google-calendar',
  'google-drive',
  'google-contacts',
  'social-posting',
  'owner-private-gbrain-browse',
  'general-openclaw-admin',
  'shell-access-for-customer',
]);

const PERSONAL_SKILLS = new Set([
  'timesyncher-email-review',
  'timesyncher-email-action',
  'timesyncher-calendar-management',
  'timesyncher-google-meeting-request',
  'timesyncher-notes',
  'timesyncher-receipts',
  'timesyncher-reminders',
  'x-read-search',
  'timesyncher-social-launch-operations',
]);

const BLOCKED_REQUEST_PATTERNS = [
  { capability: 'gmail', pattern: /\b(read|check|search|open|scan|use)\s+(my\s+|the\s+)?g\s?mail\b/i },
  { capability: 'google-calendar', pattern: /\b(read|check|create|update|move|delete|use)\s+(my\s+|the\s+)?(google\s+)?calendar\b/i },
  { capability: 'google-drive', pattern: /\b(read|search|open|scan|use|write|upload)\s+(my\s+|the\s+)?(google\s+)?drive\b/i },
  { capability: 'google-contacts', pattern: /\b(read|search|open|use)\s+(my\s+|the\s+)?(google\s+)?contacts\b/i },
  { capability: 'owner-private-gbrain-browse', pattern: /\b(private|owner|craig'?s|personal)\s+gbrain\b/i },
  { capability: 'social-posting', pattern: /\b(post|publish|schedule)\s+(to|on)\s+(x|twitter|instagram|facebook|linkedin|tiktok|postiz)\b/i },
  { capability: 'shell-access-for-customer', pattern: /\b(run|execute)\s+(a\s+)?(shell|terminal|bash|ssh|sudo)\b/i },
  { capability: 'booking-payment', pattern: /\b(book|reserve|purchase|buy|pay for|hold)\s+(the\s+)?(flight|hotel|room|car|rental|tour|ticket|reservation)\b/i },
];

function asSet(value) {
  return new Set(Array.isArray(value) ? value : []);
}

function missing(required, actual) {
  return [...required].filter((item) => !actual.has(item)).sort();
}

function combinedRequestText(job) {
  const chunks = [];
  const push = (value) => {
    if (typeof value === 'string' && value.trim()) chunks.push(value);
  };
  push(job?.request_text);
  push(job?.input?.requestText);
  push(job?.payload?.requestText);
  push(job?.payload?.text);
  if (Array.isArray(job?.trip_transcript)) {
    for (const turn of job.trip_transcript) push(turn?.body);
  }
  return chunks.join('\n\n').slice(0, 20000);
}

export function buildCapabilityObject(manifest = {}) {
  const allowedSkills = asSet(manifest.allowedSkills);
  const allowedToolLanes = asSet(manifest.allowedToolLanes);
  const blockedCapabilities = asSet(manifest.blockedCapabilities);
  const errors = [];

  const missingSkills = missing(REQUIRED_SKILLS, allowedSkills);
  if (missingSkills.length) errors.push({ type: 'missing_allowed_skills', values: missingSkills });

  const blockedSkillLeaks = [...PERSONAL_SKILLS].filter((skill) => allowedSkills.has(skill)).sort();
  if (blockedSkillLeaks.length) errors.push({ type: 'personal_skills_allowed', values: blockedSkillLeaks });

  const missingLanes = missing(REQUIRED_TOOL_LANES, allowedToolLanes);
  if (missingLanes.length) errors.push({ type: 'missing_allowed_tool_lanes', values: missingLanes });

  const missingBlocked = missing(REQUIRED_BLOCKED, blockedCapabilities);
  if (missingBlocked.length) errors.push({ type: 'missing_blocked_capabilities', values: missingBlocked });

  const capability = manifest.capabilityObject || {};
  if (capability.policySkill !== 'timesyncher-vacation-production-capability') {
    errors.push({ type: 'wrong_policy_skill', value: capability.policySkill || null });
  }
  if (capability.publicResearchRequired !== true) errors.push({ type: 'public_research_not_required' });
  if (capability.noHardCodedDestinationItineraries !== true) errors.push({ type: 'hard_coded_itineraries_not_blocked' });
  if (Number(capability.minimumInitialResearchMinutes || 0) < 10) errors.push({ type: 'minimum_research_minutes_too_low' });

  return {
    name: manifest.name || 'timesyncher-vacation',
    allowedSkills,
    allowedToolLanes,
    blockedCapabilities,
    capability,
    errors,
    publicSummary: {
      allowedSkills: [...allowedSkills].sort(),
      allowedToolLanes: [...allowedToolLanes].sort(),
      blockedCapabilities: [...blockedCapabilities].sort(),
      publicResearchRequired: capability.publicResearchRequired === true,
      minimumInitialResearchMinutes: Number(capability.minimumInitialResearchMinutes || 0),
      noHardCodedDestinationItineraries: capability.noHardCodedDestinationItineraries === true,
    },
  };
}

export function assertCapabilityObject(capabilities) {
  if (capabilities.errors.length) {
    const error = new Error(`Product GBrain capability manifest invalid: ${JSON.stringify(capabilities.errors)}`);
    error.code = 'PRODUCT_CAPABILITY_INVALID';
    throw error;
  }
}

export function assertCustomerRequestAllowed(job, capabilities) {
  const requestText = combinedRequestText(job);
  const violations = BLOCKED_REQUEST_PATTERNS
    .filter(({ capability, pattern }) => capabilities.blockedCapabilities.has(capability) || capability === 'booking-payment')
    .filter(({ pattern }) => pattern.test(requestText))
    .map(({ capability }) => capability);
  if (violations.length) {
    const error = new Error(`Blocked production Vacation capability requested: ${[...new Set(violations)].sort().join(', ')}`);
    error.code = 'PRODUCT_CAPABILITY_BLOCKED';
    error.violations = [...new Set(violations)].sort();
    throw error;
  }
}

export function assertToolingAllowed(toolingUsed, capabilities) {
  const unknown = [];
  for (const item of toolingUsed || []) {
    if (item === 'product-gbrain-dispatch') continue;
    if (capabilities.allowedSkills.has(item)) continue;
    if (capabilities.allowedToolLanes.has(item)) continue;
    if (/^travel\./.test(item)) continue;
    unknown.push(item);
  }
  if (unknown.length) {
    const error = new Error(`Product GBrain tooling outside allowlist: ${unknown.sort().join(', ')}`);
    error.code = 'PRODUCT_TOOLING_NOT_ALLOWED';
    error.unknown = unknown.sort();
    throw error;
  }
}
