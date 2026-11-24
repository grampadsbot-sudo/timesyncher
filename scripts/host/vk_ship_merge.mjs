import { exactHeadMergeReady } from './vk_ship_round_core.mjs';

const MERGE_API = '2026-03-10';

function pullHeadSha(pull) {
  return String(pull?.head?.sha || pull?.headRefOid || '').trim();
}

export function stackBaseRef(pull, defaultBranch = 'vk') {
  const base = String(pull?.base?.ref || pull?.baseRef || '').trim();
  if (!base || base === defaultBranch) return '';
  return base;
}

export function needsAsyncMerge(pull, defaultBranch = 'vk') {
  if (pull?.stack) return true;
  return Boolean(stackBaseRef(pull, defaultBranch));
}

function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function assertReady(io, number, sha) {
  if (!exactHeadMergeReady(io.reportFor(sha), sha)) {
    throw new Error(`skip: #${number} is not accept=success and CI green on ${sha}`);
  }
}

async function confirmMerged(io, number) {
  const after = io.getPull(number);
  if (after.merged !== true || !after.merge_commit_sha) throw new Error(`merge not completed: ${number}`);
  return after.merge_commit_sha;
}

async function mergeAsync(io, number, sha) {
  const started = io.request('PUT', `/repos/${io.repo}/pulls/${number}/merge-async`, {
    merge_method: 'merge',
    merge_action: 'direct_merge',
    sha,
  }, MERGE_API);
  const uuid = started?.details?.uuid || started?.uuid || '';
  if (String(started?.status || '') === 'merged') return confirmMerged(io, number);
  if (!uuid) throw new Error(`merge not completed: ${number}`);
  for (let attempt = 0; attempt < 15; attempt += 1) {
    pause(2000);
    const polled = io.request('GET', `/repos/${io.repo}/pulls/${number}/merge-async/${uuid}`, undefined, MERGE_API);
    const status = String(polled?.status || '');
    if (status === 'failed') throw new Error(`merge not completed: ${number}`);
    if (status === 'merged' || status === 'enqueued') return confirmMerged(io, number);
  }
  throw new Error(`merge not completed: ${number}`);
}

async function mergeOne(io, number, sha) {
  const fresh = io.getPull(number);
  const head = pullHeadSha(fresh);
  const state = String(fresh.state || '').toUpperCase();
  if (fresh.merged === true || state === 'MERGED') return confirmMerged(io, number);
  if (head !== sha || state !== 'OPEN') throw new Error(`skip: #${number} head moved`);
  assertReady(io, number, head);
  if (!needsAsyncMerge(fresh)) {
    const done = io.request('PUT', `/repos/${io.repo}/pulls/${number}/merge`, { merge_method: 'merge', sha: head });
    if (done?.merged !== true || !done?.sha) throw new Error(`merge not completed: ${number}`);
    return confirmMerged(io, number);
  }
  return mergeAsync(io, number, head);
}

function parentsOf(pull, io) {
  if (io.below) return io.below(pull);
  const chain = [];
  let current = pull;
  for (let depth = 0; depth < 8; depth += 1) {
    const base = stackBaseRef(current);
    if (!base) break;
    const listed = io.listByHead(base);
    const parent = (Array.isArray(listed) ? listed : []).find((row) => row.head?.ref === base);
    if (!parent) throw new Error(`stacked base missing for #${current.number}`);
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

async function retargetOntoVk(io, pull) {
  if (!io.retarget) return pull;
  try {
    const next = await io.retarget(pull.number, 'vk');
    if (next && pullHeadSha(next)) return next;
  } catch { return pull; }
  return pull;
}

export function noteMergeFailure(round, message) {
  const text = String(message || '');
  if (text.startsWith('skip:')) {
    round.skipped = [...(round.skipped || []), text];
    console.log(text);
    return;
  }
  round.errors.push(text);
}

function mergeRank(action) {
  if (action.shipFix) return 0;
  return String(action.baseRef || 'vk') === 'vk' ? 1 : 2;
}

export function mergeOrder(actions) {
  const early = [];
  const merges = [];
  for (const action of actions || []) {
    if (action.type === 'batch-deploy' || action.type === 'live-accept' || action.type === 'dry-run-after-deploy') continue;
    if (action.type === 'merge') merges.push(action);
    else early.push(action);
  }
  merges.sort((left, right) => mergeRank(left) - mergeRank(right));
  return early.concat(merges);
}

export async function mergePull(action, round, io) {
  const fresh = io.getPull(action.pr);
  const head = pullHeadSha(fresh);
  const state = String(fresh.state || '').toUpperCase();
  if (fresh.merged === true || state === 'MERGED') return confirmMerged(io, action.pr).then(() => true);
  if (head !== action.sha || state !== 'OPEN') throw new Error(`skip: #${action.pr} head moved`);
  const current = stackBaseRef(fresh) ? await retargetOntoVk(io, fresh) : fresh;
  const now = pullHeadSha(current);
  if (now !== action.sha) throw new Error(`skip: #${action.pr} retargeted onto vk`);
  if (!stackBaseRef(current)) {
    assertReady(io, action.pr, now);
    try {
      const done = io.request('PUT', `/repos/${io.repo}/pulls/${action.pr}/merge`, { merge_method: 'merge', sha: now });
      if (done?.merged !== true || !done?.sha) throw new Error(`merge not completed: ${action.pr}`);
      await confirmMerged(io, action.pr);
      return true;
    } catch (error) {
      if (!needsAsyncMerge(current)) throw error;
    }
    await mergeAsync(io, action.pr, now);
    return true;
  }
  const below = parentsOf(current, io);
  for (const parent of below) {
    if (parent.merged === true || String(parent.state || '').toUpperCase() === 'MERGED') continue;
    const parentHead = pullHeadSha(parent);
    assertReady(io, parent.number, parentHead);
  }
  assertReady(io, action.pr, head);
  for (const parent of below) {
    if (parent.merged === true || String(parent.state || '').toUpperCase() === 'MERGED') continue;
    await mergeOne(io, parent.number, pullHeadSha(parent));
    if (!round.merges.includes(parent.number)) round.merges.push(parent.number);
  }
  const again = io.getPull(action.pr);
  const againHead = pullHeadSha(again);
  if (again.merged === true) return confirmMerged(io, action.pr).then(() => true);
  if (againHead !== action.sha) throw new Error(`skip: #${action.pr} head moved`);
  await mergeOne(io, action.pr, againHead);
  return true;
}
