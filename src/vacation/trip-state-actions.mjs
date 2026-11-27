import { tripStateActionFlag, tripStateCapabilities } from './trip-state-action-registry.mjs';
import { createTripStateActionStore } from './trip-state-action-store.mjs';
import { digestTripState, readTripStateSite, tripStateBacking, tripStateSiteLocked } from './trip-state-action-site.mjs';
import { actionAuthorized, actionFailure, validateActionArguments, validTripStateId } from './trip-state-action-input.mjs';
import { siteActionWriters } from './trip-state-action-writes.mjs';

const batchOps = new Set(['add_named_item', 'add_from_search', 'place_on_day', 'set_stay', 'set_time']);
const topLevelOps = new Set([...batchOps, 'hold_invite', 'save_plan'].filter((op) => op !== 'set_time'));
const handleFields = ['item', 'hotel', 'replace_hotel'];

function statusOf(op, receipt, turn, { result, detail, refs }) {
  return { op, receipt, result, detail, refs: [...new Set(refs)], turn };
}

function capabilitiesFor(context, site, env, read, serviceAvailable = true) {
  return tripStateCapabilities({
    env, read, serviceAvailable, backing: site ? tripStateBacking(site.trip) : context.backing,
    grant: site ? 'owner' : context.grant,
    locked: site ? tripStateSiteLocked(site.trip) : context.locked,
    emailHeld: context.emailHeld || Boolean(Object.keys(site?.invites || {}).length),
    accessRights: context.state.capabilities?.access_rights,
    productFacts: context.state.capabilities?.product_facts,
  });
}

function collectTargets(saved) {
  const targets = new Map();
  for (const [id, item] of Object.entries(saved.items)) {
    targets.set(id, { item, stay: saved.lodging[id], flight: saved.flights[id], ride: saved.ground[id] });
  }
  for (const [day, { assigned }] of Object.entries(saved.days)) {
    for (const row of assigned) targets.set(row.id, { day, row });
  }
  for (const [id, invite] of Object.entries(saved.invites)) targets.set(id, { invite });
  return targets;
}

function withoutGoneAsks(state, saved, turn) {
  const prior = collectTargets(state.saved);
  const current = collectTargets(saved);
  const reopened = state.answered.filter((ask) => ask.status === 'done'
    && ask.refs.some((ref) => prior.has(ref) && !current.has(ref)));
  return {
    answered: state.answered.filter((ask) => !reopened.includes(ask)),
    open_asks: [...state.open_asks, ...reopened.map((ask) => ({ ...ask, status: 'open', outcome: null, turn }))],
  };
}

function publish(context, capabilities, saved, status, operations = [], action, promotions = []) {
  const { state, turn } = context;
  const actions = action ? [action] : [];
  const statuses = [status, ...operations];
  const receipts = new Set(statuses.map((entry) => entry.receipt));
  const updated = (section, source) => ({ section, source, turn });
  const refreshed = saved?.read === 'current';
  const asks = refreshed ? withoutGoneAsks(state, saved, turn) : { answered: state.answered, open_asks: state.open_asks };
  const candidates = { ...state.candidates };
  for (const id of promotions) delete candidates[id];
  const proposalId = context.authority?.source === 'proposal' && context.authority.id;
  const accept = proposalId && status.op === 'save_plan' && ['applied', 'no_change'].includes(status.result)
    && state.proposals[proposalId]?.status === 'offered';
  const proposals = accept ? { ...state.proposals, [proposalId]: { ...state.proposals[proposalId], status: 'accepted' } } : state.proposals;
  const updates = [
    ...state.updates, updated('capabilities', 'registry'), updated('tool_status', 'tool_result'),
    ...(saved ? [updated('saved', 'reconcile')] : []),
    ...(action ? [updated('last_actions', 'tool_result')] : []),
    ...(promotions.length ? [updated('candidates', 'reconcile')] : []),
    ...(accept ? [updated('proposals', 'reconcile')] : []),
    ...(asks.open_asks.length > state.open_asks.length ? [updated('open_asks', 'reconcile'), updated('answered', 'reconcile')] : []),
  ];
  return {
    status, operations, actions,
    state: {
      ...state, ...asks, phase: 'planning', updated_turn: turn, revision: state.revision + 1,
      saved: saved || state.saved, capabilities, candidates, proposals,
      last_actions: [...state.last_actions, ...actions.filter((row) => !state.last_actions.some((old) => old.receipt === row.receipt))],
      tool_status: [...state.tool_status.filter((entry) => !receipts.has(entry.receipt)), ...statuses],
      updates: [...new Map(updates.map((entry) => [digestTripState(entry), entry])).values()],
    },
  };
}

function planOperation({ op, args, site, saved, context, handles, batch }) {
  if (!validateActionArguments(op, args)) return actionFailure('needs_info', 'Supply valid action arguments.');
  if (!actionAuthorized(context.authority, op, args, context.state)) return actionFailure('denied', 'This action needs matching customer authorization.');
  const resolved = { ...args };
  for (const key of handleFields) {
    if (typeof resolved[key] !== 'string' || !resolved[key].startsWith('$')) continue;
    const value = batch && handles.get(resolved[key].slice(1));
    if (!value) return actionFailure('needs_info', 'Resolve the result handle from an earlier successful operation.');
    resolved[key] = value;
  }
  for (const key of [...handleFields, 'day', 'check_in', 'check_out', 'candidate']) {
    if (resolved[key] != null && !validTripStateId(resolved[key])) return actionFailure('needs_info', 'Supply IDs from this trip.');
  }
  const draft = structuredClone(site);
  const result = siteActionWriters[op](draft, saved, context, resolved);
  if (result.result === 'applied') {
    site.things = draft.things;
    site.invites = draft.invites;
  }
  return result;
}

function planBatch(args, site, saved, context, receipt) {
  if (!validateActionArguments('save_plan', args) || !validTripStateId(args.authority)
    || !Array.isArray(args.operations) || !args.operations.length || args.operations.length > 32) {
    return { outcome: actionFailure('needs_info', 'Supply authority and one to 32 ordered save operations.'), children: [] };
  }
  if (args.authority !== context.authority?.id || !['customer', 'proposal'].includes(context.authority?.source)) {
    return { outcome: actionFailure('denied', 'The plan needs matching customer authorization.'), children: [] };
  }
  if (args.operations.some((entry) => !batchOps.has(entry?.op)
    || Object.keys(entry).some((key) => !['op', 'args', 'as'].includes(key)))) {
    return { outcome: actionFailure('denied', 'The plan contains an unsupported operation.'), children: [] };
  }
  const handles = new Map();
  const children = [];
  let current = saved;
  for (const child of args.operations) {
    const { op, args: command, as } = child;
    const outcome = as != null && (!validTripStateId(as) || handles.has(as))
      ? actionFailure('needs_info', 'Use a unique valid result handle.')
      : planOperation({ op, args: command, site, saved: current, context, handles, batch: true });
    if (as && outcome.item) handles.set(as, outcome.item);
    if (outcome.result === 'applied') current = readTripStateSite(site, saved, context.turn);
    children.push({ op, receipt: `${receipt}-${children.length + 1}`, outcome, candidate: command?.candidate });
  }
  return { children, outcome: summarizeBatch(children.map((entry) => entry.outcome)) };
}

function summarizeBatch(results) {
  const applied = results.filter((row) => row.result === 'applied');
  const satisfied = results.filter((row) => ['applied', 'no_change'].includes(row.result));
  if (satisfied.length && satisfied.length !== results.length) {
    return { result: 'partial', detail: 'Some plan operations are verified. Other operations still need attention.', refs: satisfied.flatMap((row) => row.refs) };
  }
  if (satisfied.length && !applied.length) return { result: 'no_change', detail: 'The saved plan already matches.', refs: satisfied.flatMap((row) => row.refs) };
  if (applied.length) return { result: 'applied', detail: 'Verified the requested plan on the site.', refs: applied.flatMap((row) => row.refs) };
  return results.find((row) => row.result === 'pending_readback') || results[0];
}

function planRecord(op, args, site, saved, context, receipt, signature) {
  const next = structuredClone(site);
  const planned = op === 'save_plan' ? planBatch(args, next, saved, context, receipt)
    : { outcome: planOperation({ op, args, site: next, saved, context, handles: new Map() }), children: [] };
  const final = readTripStateSite(next, saved, context.turn);
  const before = collectTargets(saved);
  const after = collectTargets(final);
  const results = planned.children.length ? planned.children.map((row) => row.outcome) : [planned.outcome];
  const refs = new Set(results.filter((row) => ['applied', 'no_change'].includes(row.result)).flatMap((row) => row.refs));
  const proof = Object.fromEntries([...refs].map((ref) => [ref, digestTripState(after.get(ref) ?? null)]));
  const changes = Object.fromEntries([...refs].filter((ref) => digestTripState(before.get(ref) ?? null) !== proof[ref])
    .map((ref) => [ref, { before: before.get(ref) ?? null, after: after.get(ref) ?? null }]));
  return { next, record: { ...planned, signature, proof, changes, turn: context.turn } };
}

function verifyRecord(record, saved, replay, op, args) {
  const actual = saved ? collectTargets(saved) : new Map();
  function verify(outcome) {
    if (!['applied', 'no_change'].includes(outcome.result)) return outcome;
    if (!saved || !outcome.refs.length || outcome.refs.some((id) => record.proof[id] !== digestTripState(actual.get(id) ?? null))) {
      return actionFailure('pending_readback', 'Site readback could not yet confirm the requested targets.');
    }
    return outcome;
  }
  const children = record.children.map((child) => ({ ...child, outcome: verify(child.outcome) }));
  const original = children.length ? summarizeBatch(children.map((child) => child.outcome)) : verify(record.outcome);
  const results = children.length ? children : [{ op, outcome: original, candidate: args.candidate }];
  const mutations = results.filter((result) => result.outcome.result === 'applied').flatMap((result) => result.outcome.refs)
    .filter((id) => Object.hasOwn(record.changes, id));
  const promotions = results.filter((result) => result.op === 'add_from_search' && ['applied', 'no_change'].includes(result.outcome.result))
    .map((result) => result.candidate);
  function repeated(outcome) {
    return replay && outcome.result === 'applied'
      ? { ...outcome, result: 'no_change', detail: 'The original receipt is already recorded and verified.' } : outcome;
  }
  return { outcome: repeated(original), children: children.map((child) => ({ ...child, outcome: repeated(child.outcome) })), mutations, promotions };
}

export function createTripStateActions({ env = process.env, store = createTripStateActionStore({ env }) } = {}) {
  return {
    capabilities: (context) => capabilitiesFor(context, null, env, context.state.saved.read, store.available),
    async read(context) {
      if (!tripStateActionFlag(env)) return null;
      const site = await store.read(context);
      if (!site || tripStateBacking(site.trip) !== 'intake') return null;
      return readTripStateSite(site, context.state.saved, context.turn);
    },
    async execute({ context, op, args = {} }) {
      const { tripId, requestId, actorId, operationKey, turn, state, siteRevision } = context || {};
      if (!topLevelOps.has(op) || ![tripId, requestId, actorId, operationKey, siteRevision].every(validTripStateId)
        || state?.trip_id !== tripId || state?.version !== '1.0' || state?.scope?.mode !== 'full'
        || !Number.isSafeInteger(turn) || turn < state.updated_turn) {
        throw new TypeError('Invalid Trip State action envelope.');
      }
      const receipt = `r-${digestTripState([tripId, requestId, operationKey]).slice(0, 48)}`;
      const signature = digestTripState([actorId, turn, op, args]);
      const initial = capabilitiesFor(context, null, env, state.saved.read, store.available);
      const done = (outcome, capabilities = initial, saved) => publish(context, capabilities, saved, statusOf(op, receipt, turn, outcome));
      if (!tripStateActionFlag(env)) return done(actionFailure('denied', 'not_wired'));
      if (store.available === false) return done(actionFailure('denied', 'service_unavailable'));
      let observed, saved, committed, transactionError, replay = false, rejected;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          committed = await store.transact(context, (site) => {
            const capabilities = capabilitiesFor(context, site, env, 'current');
            if (!capabilities.actions[op].enabled) {
              rejected = done(actionFailure('denied', capabilities.actions[op].reason), capabilities);
              return { record: null };
            }
            if (site.record) {
              replay = true;
              return { record: site.record };
            }
            const before = readTripStateSite(site, state.saved, turn);
            if (before.site_revision !== siteRevision || state.saved.read !== 'current') {
              rejected = done(actionFailure('conflict', 'The site changed. Refresh the plan from the current trip.'), capabilities, before);
              return { record: null };
            }
            return planRecord(op, args, site, before, context, receipt, signature);
          });
          if (rejected) return rejected;
          if (!committed) {
            const capabilities = capabilitiesFor({ ...context, grant: 'none' }, null, env, state.saved.read, store.available);
            return done(actionFailure('denied', 'no_grant'), capabilities);
          }
          transactionError = null;
          break;
        } catch (error) {
          transactionError = error;
          if (error?.code !== '40001' && error?.code !== '23505') break;
        }
      }
      try {
        observed = await store.read(context);
        if (observed && tripStateBacking(observed.trip) === 'intake' && !tripStateSiteLocked(observed.trip)) {
          saved = readTripStateSite(observed, state.saved, turn);
        }
      } catch (error) {
        observed = undefined;
      }
      const capabilities = capabilitiesFor(context, observed, env, saved ? 'current' : 'stale', store.available);
      const record = observed?.record || committed;
      if (!record) {
        const result = transactionError?.code === '40001' || transactionError?.code === '23505' ? 'conflict' : 'pending_readback';
        if (saved && result !== 'conflict') return done(actionFailure('failed', 'The transaction did not save the requested change.'), capabilities, saved);
        return done(actionFailure(result, 'The transaction could not be confirmed.'), capabilities, saved || { ...state.saved, read: 'stale' });
      }
      if (record.signature !== signature) return done(actionFailure('conflict', 'This operation key already belongs to different arguments.'), capabilities, saved);
      const verified = verifyRecord(record, observed?.record && saved, replay, op, args);
      const operations = verified.children.map((child) => statusOf(child.op, child.receipt, turn, child.outcome));
      const recover = !replay || state.tool_status.some((row) => row.receipt === receipt && row.result === 'pending_readback');
      const action = recover && verified.mutations.length ? { op, receipt, refs: [...new Set(verified.mutations)], turn } : undefined;
      return publish(context, capabilities, saved || { ...state.saved, read: 'stale' },
        statusOf(op, receipt, turn, verified.outcome), operations, action, verified.promotions);
    },
  };
}
