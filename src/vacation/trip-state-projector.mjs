import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { tripStateCapabilities } from './trip-state-action-registry.mjs';
import { digestTripState, readTripStateSite, tripStateBacking, tripStateSiteLocked } from './trip-state-action-site.mjs';
import { intId } from './intake-shared-trip.mjs';
import schema from './trip-state.schema.json' with { type: 'json' };

const ajv = new Ajv2020({ strictRequired: false, strictTypes: false });
addFormats(ajv);
const validState = ajv.compile(schema);
const validSaved = ajv.compile({ ...schema.$defs.saved, $defs: schema.$defs });
const validFact = ajv.compile(schema.$defs.fact);
const validTraveler = ajv.compile({ ...schema.$defs.traveler, $defs: schema.$defs });
const validStatus = ajv.compile({ ...schema.$defs.status, $defs: schema.$defs });
const validResearch = ajv.compile({ ...schema.$defs.research, $defs: schema.$defs });
const validCandidate = ajv.compile({ ...schema.$defs.candidate, $defs: schema.$defs });
const validStep = ajv.compile({ ...schema.$defs.step, $defs: schema.$defs });
const actions = new Set(schema.$defs.action.properties.op.enum);
const idPattern = new RegExp(schema.$defs.id.pattern);
const budgetDisclosure = /(?:\$|USD\s*)\d[\d,]*(?:\.\d\d)?|\b(?:on a budget|budget-friendly|inexpensive|low-cost)\b/i;
const paceDisclosure = /\b(?:slow|relaxed|easy|leisurely|low[- ]key)\s+(?:pace|days|trip)|\b(?:take it easy|don't pack|downtime|one (?:activity|thing) per day)\b/i;

export function assertTripState(state) {
  if (!validState(state)) throw new TypeError(`Invalid Trip State: ${ajv.errorsText(validState.errors)}`);
}

function emptySaved(turn) {
  return {
    site_revision: 'unavailable', read: 'unavailable',
    trip: { title: null, destination: null, start: null, end: null, via: 'legacy_site', turn },
    days: {}, items: {}, unassigned: [], lodging: {}, flights: {}, ground: {},
    travelers: {}, collaborators: {}, invites: {},
  };
}

function proposedBy(value, entry) {
  if (value === 'customer' || value === 'system') return value;
  return entry.via === 'customer_named' || entry.via === 'chat_action' ? 'customer' : 'system';
}

function unreadSaved(previous, turn, travelers) {
  const saved = previous || emptySaved(turn);
  return { ...saved, read: saved.read === 'unavailable' ? 'unavailable' : 'stale', travelers };
}

function projectSaved(site, previous, turn, travelers) {
  if (!site || tripStateBacking(site.trip) !== 'intake') return unreadSaved(previous, turn, travelers);
  const read = readTripStateSite(site, previous, turn);
  const items = { ...read.items };
  const days = { ...read.days };
  const metadata = new Map(site.things.map((thing) => [String(intId(thing.id)), thing.metadata?.tripState]));
  const occurrences = new Map(site.things.flatMap((thing) =>
    (thing.metadata?.tripState?.occurrences || []).map((row) => [row.id, row])));
  for (const [id, item] of Object.entries(items)) {
    items[id] = { ...item, proposed_by: proposedBy(metadata.get(id)?.proposed_by, item) };
  }
  for (const [id, day] of Object.entries(days)) {
    days[id] = { ...day, assigned: day.assigned.map((row) => ({
      ...row, proposed_by: proposedBy(occurrences.get(row.id)?.proposed_by, row),
    })) };
  }
  const saved = {
    ...read, items, days, travelers, collaborators: site.collaborators || {}, invites: site.invites,
  };
  return validSaved(saved) ? saved : unreadSaved(previous, turn, travelers);
}

function turnDisclosures({ classification, text, turn }) {
  if (classification?.ok !== true || !text) return {};
  const request = text.toLowerCase();
  const accessRequest = classification.inviteeName || classification.understanding?.intent?.asksAccess
    || classification.understanding?.intent?.pullsAccess;
  const relations = { owner: 'self', child: 'child', ...(accessRequest ? {} : { collaborator: null }) };
  const roster = (classification.roster || []).filter(({ role, name }) => Object.hasOwn(relations, role)
    && typeof name === 'string' && name.trim() && request.includes(name.toLowerCase()));
  const travelers = Object.fromEntries(roster.map(({ role, name, age }) => [
    `traveler-${digestTripState(name.toLowerCase()).slice(0, 24)}`,
    { name, relation: relations[role], age: Number.isFinite(age) ? String(age) : null, via: 'intake', turn },
  ]));
  const facts = Object.fromEntries(Object.entries(travelers).map(([id, { name }]) => [id, { kind: 'party', value: name, turn }]));
  const { destination, hasDates, startDate, endDate } = classification;
  if (destination && request.includes(destination.toLowerCase())) facts.dest = { kind: 'destination', value: destination, turn };
  if (hasDates && startDate && endDate) facts.dates = { kind: 'dates', value: `${startDate} – ${endDate}`, turn };
  const party = String(classification.planningParty || '').trim();
  if (party && request.includes(party.toLowerCase())) facts.party = { kind: 'party', value: party.slice(0, 280), turn };
  for (const entry of (Array.isArray(classification.planningWants) ? classification.planningWants : []).slice(0, 8)) {
    const value = String(entry?.value || '').trim();
    if (!value || !request.includes(value.toLowerCase())) continue;
    const category = entry.category;
    const id = `want-${digestTripState([category, value.toLowerCase()]).slice(0, 24)}`;
    facts[id] = { kind: 'preference', value: value.slice(0, 280), category, turn };
  }
  const budgetMatch = text.match(budgetDisclosure)?.[0];
  if (budgetMatch) facts.budget = { kind: 'budget', value: budgetMatch.slice(0, 280), turn };
  const paceMatch = text.match(paceDisclosure)?.[0];
  if (paceMatch) facts.pace = { kind: 'pace', value: paceMatch.slice(0, 280), turn };
  return { travelers, facts };
}

function mergeDisclosures(previous, delta, validate) {
  return { ...previous, ...Object.fromEntries(Object.entries(delta || {})
    .filter(([id, value]) => idPattern.test(id) && validate(value))) };
}

function targetIndex(saved) {
  const targets = new Map(Object.entries(saved.items).map(([id, item]) => [id, {
    item, stay: saved.lodging[id], flight: saved.flights[id], ride: saved.ground[id],
  }]));
  for (const [day, { assigned }] of Object.entries(saved.days)) {
    for (const row of assigned) targets.set(row.id, { day, row });
  }
  for (const [id, invite] of Object.entries(saved.invites)) targets.set(id, { invite });
  return targets;
}

function verifiedTarget(targets, saved, record, ref) {
  const target = targets.get(ref);
  if (!target) return false;
  const observed = digestTripState(target);
  const legacyTarget = structuredClone(target);
  if (legacyTarget.row) delete legacyTarget.row.proposed_by;
  if (legacyTarget.item) delete legacyTarget.item.proposed_by;
  if (![observed, digestTripState(legacyTarget)].includes(record.proof?.[ref])) return false;
  const anchor = record.order?.[ref];
  if (!anchor) return true;
  const assigned = saved.days[target.day]?.assigned || [];
  return assigned.findIndex(({ id }) => id === anchor) > assigned.findIndex(({ id }) => id === ref);
}

function projectReceipts({ receipts, saved, tripId, requestId, turn }) {
  const targets = saved.read === 'current' ? targetIndex(saved) : new Map();
  const statuses = new Map();
  const mutations = new Map();
  function add(entry, record) {
    if (!actions.has(entry.op) || !entry.outcome) return;
    const { detail, result, refs } = entry.outcome;
    if (!Array.isArray(refs)) return;
    const verified = [...new Set(refs)].filter((id) => verifiedTarget(targets, saved, record, id));
    const success = ['applied', 'no_change', 'partial'].includes(result);
    const status = {
      op: entry.op, receipt: entry.receipt, turn,
      result: success && verified.length === 0 ? 'pending_readback'
        : success && verified.length < new Set(refs).size ? 'partial' : result,
      detail: success && verified.length !== new Set(refs).size ? 'Site readback did not confirm every receipt target.' : detail,
      refs: success ? verified : [...new Set(refs)],
    };
    if (!validStatus(status)) return;
    statuses.set(status.receipt, status);
    return result === 'applied' || result === 'partial'
      ? verified.filter((id) => Object.hasOwn(record.changes || {}, id)) : [];
  }
  for (const { operation_key: operationKey, record } of receipts) {
    if (!record) continue;
    const children = record.children || [];
    const receipt = `r-${digestTripState([tripId, requestId, operationKey]).slice(0, 48)}`;
    const op = record.op || (children.length ? 'save_plan' : null);
    const topLevelRefs = add({ op, receipt, outcome: record.outcome }, record) || [];
    const refs = children.length
      ? [...new Set(children.flatMap((child) => add(child, record) || []))]
      : topLevelRefs;
    if (op && refs.length) mutations.set(receipt, { op, receipt, refs, turn });
  }
  return { last_actions: [...mutations.values()], tool_status: [...statuses.values()] };
}

function placedBuildCounts(saved, actions) {
  const refs = new Set(actions.filter(({ op }) => op === 'save_plan').flatMap(({ refs }) => refs));
  const items = new Set(Object.values(saved.days).flatMap(({ assigned }) => assigned)
    .filter(({ id }) => refs.has(id)).map(({ item }) => item));
  const counts = {};
  for (const id of items) {
    const { type, basis } = saved.items[id];
    if (basis === 'plan_block' || basis === 'placeholder') continue;
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

export function projectTripState({
  trip, site, requestId, turn, revision, phase = 'reply_ready', previous,
  receipts = [], disclosures, travelers, classification, text, grant, env,
  research, candidates, nextSteps,
}) {
  const turnFacts = turnDisclosures({ classification, text, turn });
  const newTravelers = { ...turnFacts.travelers, ...travelers };
  const newDisclosures = { ...turnFacts.facts, ...disclosures };
  const saved = projectSaved(site, previous?.saved, turn,
    mergeDisclosures(previous?.saved.travelers, newTravelers, validTraveler));
  const disclosed = mergeDisclosures(previous?.disclosed, newDisclosures, validFact);
  const { last_actions, tool_status } = projectReceipts({ receipts, saved, tripId: trip.id, requestId, turn });
  const capabilities = tripStateCapabilities({
    env, trip: site?.trip || trip, grant,
    backing: tripStateBacking(site?.trip || trip), locked: tripStateSiteLocked(site?.trip || trip),
    read: saved.read, emailHeld: Object.values(saved.invites).some(({ status }) => status === 'held'),
  });
  const hasResearch = Boolean(research && validResearch(research));
  const nextResearch = hasResearch ? research : (previous?.research || { key: null, state: 'waiting', turn, areas: [], gaps: [] });
  const measuredResearch = hasResearch && research.build
    ? { ...research, build: { ...research.build, items_by_type: placedBuildCounts(saved, last_actions) } }
    : nextResearch;
  const hasCandidates = candidates != null && typeof candidates === 'object' && !Array.isArray(candidates);
  const nextCandidates = hasCandidates
    ? Object.fromEntries(Object.entries(candidates).filter(([id, value]) => idPattern.test(id) && validCandidate(value)))
    : (previous?.candidates || {});
  const hasNextSteps = Array.isArray(nextSteps) && nextSteps.length > 0 && nextSteps.length <= 3
    && nextSteps.every((step) => validStep(step));
  const steps = hasNextSteps ? nextSteps : [{ kind: 'wait', task: 'Wait for the next request.', refs: [] }];
  const updates = [
    { section: 'saved', source: 'site_read', turn },
    { section: 'capabilities', source: 'registry', turn },
    { section: 'last_actions', source: last_actions.length ? 'tool_result' : 'turn_reset', turn },
    { section: 'tool_status', source: tool_status.length ? 'tool_result' : 'turn_reset', turn },
  ];
  if (Object.keys(newDisclosures).length) updates.push({ section: 'disclosed', source: 'customer_turn', turn });
  if (hasResearch) updates.push({ section: 'research', source: research.key ? 'vk_search' : 'planner', turn });
  if (hasCandidates) updates.push({ section: 'candidates', source: 'vk_search', turn });
  if (hasNextSteps) updates.push({ section: 'next_steps', source: 'planner', turn });
  return {
    version: '1.0', trip_id: trip.id, updated_turn: turn, revision, phase, capabilities, saved, disclosed,
    candidates: nextCandidates,
    research: measuredResearch,
    proposals: previous?.proposals || {}, open_asks: previous?.open_asks || [], answered: previous?.answered || [],
    said: previous?.said || [], last_actions, tool_status,
    next_steps: steps,
    scope: { mode: 'full', omitted: {} }, updates,
  };
}
