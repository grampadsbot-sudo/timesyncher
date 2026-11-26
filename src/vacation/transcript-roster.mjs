import { customerChallengesPriorReply } from './reply-self-correction-grade.mjs';

const AGE_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen'];

function rosterDisclosureCorpus(turns = []) {
  return (Array.isArray(turns) ? turns : []).filter((turn) => turn?.role === 'customer' && !customerChallengesPriorReply(turn.text))
    .map((turn) => String(turn.text || '').replace(/[^.!?\n]*\?/g, '')).join('\n');
}

function disclosedAge(corpus, name, value) {
  if (value == null || value === '') return NaN;
  const age = Number(value);
  if (!Number.isInteger(age) || age < 0 || age > 120) return NaN;
  const variants = [String(age), AGE_WORDS[age]].filter(Boolean).join('|');
  const person = escapeRosterName(name);
  const ageNumber = `(?:${variants})\\b`;
  const ageText = new RegExp([
    `\\b${person}\\s+(?:is|is aged|turned|will be)\\s+${ageNumber}(?![\\w-]|\\s+(?:feet|miles|hours|minutes|days|weeks|months)\\b)`,
    `\\b${person}\\s*\\(\\s*${ageNumber}\\s*\\)`,
    `\\b${ageNumber}[- ]year[- ]old\\s+${person}\\b`,
  ].join('|'), 'i');
  return ageText.test(corpus) ? age : NaN;
}

export function customerNamedInRoster(text, name) {
  return !customerChallengesPriorReply(text) && customerMentionedName(text, name);
}

function rememberRoster(sources, field, value, source) {
  sources.push({ field, value, source });
}

function escapeRosterName(name) {
  return String(name || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

function customerMentionedName(corpus, name) {
  const escaped = escapeRosterName(name);
  return Boolean(escaped && new RegExp(`\\b${escaped}\\b`, 'i').test(String(corpus || '')));
}

export function completeRosterParty(doc) {
  const stored = doc?.party && typeof doc.party === 'object' ? doc.party : {};
  const transcriptOnly = doc?.transcriptOnly === true;
  const customerCorpus = transcriptOnly ? rosterDisclosureCorpus(doc.turns) : '';
  const named = (name) => customerMentionedName(customerCorpus, name);
  const ageFor = (name, age) => transcriptOnly ? disclosedAge(customerCorpus, name, age) : Number(age);
  const sources = [];
  const party = {
    primary: null,
    collaborators: [],
    preference_subjects: [],
    viewers: [],
    editors: [],
    sources,
  };
  if (stored.primary?.name && (!transcriptOnly || named(stored.primary.name))) {
    party.primary = { name: stored.primary.name, role: stored.primary.role || 'Owner' };
    rememberRoster(sources, 'primary', party.primary.name, 'trip.dialogParty');
  } else if (!transcriptOnly && (doc?.customerName || doc?.targetPerson)) {
    party.primary = { name: doc.customerName || doc.targetPerson, role: 'Owner' };
    rememberRoster(sources, 'primary', party.primary.name, 'session');
  }
  for (const person of Array.isArray(stored.collaborators) ? stored.collaborators : []) {
    if (!person?.name || (transcriptOnly && !named(person.name))) continue;
    const collaborator = transcriptOnly ? { name: person.name } : { ...person };
    party.collaborators.push(collaborator);
    rememberRoster(sources, `collaborators.${person.name}`, collaborator.payer || '', 'trip.dialogParty');
  }
  for (const kid of Array.isArray(stored.preference_subjects) ? stored.preference_subjects : []) {
    if (!kid?.name || (transcriptOnly ? !named(kid.name) : !Number.isFinite(Number(kid.age)))) continue;
    const age = ageFor(kid.name, kid.age);
    party.preference_subjects.push(Number.isFinite(age) ? { name: kid.name, age } : { name: kid.name });
    rememberRoster(sources, `preference_subjects.${kid.name}`, Number.isFinite(age) ? age : '', 'trip.dialogParty');
  }
  for (const person of Array.isArray(stored.viewers) ? stored.viewers : []) {
    if (!person?.name || (transcriptOnly && !named(person.name))) continue;
    party.viewers.push({ name: person.name });
    rememberRoster(sources, `viewers.${person.name}`, 'viewer', 'trip.dialogParty');
  }
  for (const person of Array.isArray(stored.editors) ? stored.editors : []) {
    if (!person?.name || (transcriptOnly && !named(person.name))) continue;
    party.editors.push({ name: person.name });
    rememberRoster(sources, `editors.${person.name}`, 'editor', 'trip.dialogParty');
  }
  const samePerson = (left, right) => new RegExp(`^${String(left || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(String(right || ''));
  let unplaced = false;
  for (const person of Array.isArray(doc?.roster) ? doc.roster : []) {
    const name = String(person?.name || '').trim();
    const role = String(person?.role || '').trim().toLowerCase();
    if (!name || (transcriptOnly && !named(name))) continue;
    if (role === 'owner') {
      if (!party.primary?.name) {
        party.primary = { name, role: 'Owner' };
        rememberRoster(sources, 'primary', name, 'chat_extraction');
      }
    } else if (role === 'child') {
      const age = person.age === null || person.age === undefined || person.age === '' ? NaN : ageFor(name, person.age);
      if (party.preference_subjects.some((kid) => samePerson(name, kid.name))) continue;
      party.preference_subjects.push(Number.isFinite(age) ? { name, age } : { name });
      rememberRoster(sources, `preference_subjects.${name}`, Number.isFinite(age) ? age : '', 'chat_extraction');
    } else if (role === 'viewer') {
      if (party.viewers.some((item) => samePerson(name, item.name))) continue;
      party.viewers.push({ name });
      rememberRoster(sources, `viewers.${name}`, 'viewer', 'chat_extraction');
    } else if (role === 'editor') {
      if (party.editors.some((item) => samePerson(name, item.name))) continue;
      party.editors.push({ name });
      rememberRoster(sources, `editors.${name}`, 'editor', 'chat_extraction');
    } else if (role === 'collaborator') {
      continue;
    } else {
      unplaced = true;
    }
  }
  if (doc?.rosterError) {
    party.rosterError = String(doc.rosterError);
    party.askRoster = true;
  } else if (doc?.askRoster === true || unplaced) {
    party.askRoster = true;
  }
  return party;
}
