import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hostIsBanned, loadBannedHosts } from './fetch-guard.mjs';
import { travelSummaryValues } from '../../src/vacation/vk-travel-summary.mjs';

const CUSTOMER_LANE_ORDER = ['gemini', 'claude', 'codex'];
const TRANSCRIPT_MAX_TURNS = 12;
const TRANSCRIPT_MAX_CHARS = 1200;

export function formatCustomerTranscript(turns, { maxTurns = TRANSCRIPT_MAX_TURNS, maxChars = TRANSCRIPT_MAX_CHARS } = {}) {
  if (!Array.isArray(turns)) return [];
  const capTurns = Math.max(1, Number(maxTurns) || TRANSCRIPT_MAX_TURNS);
  const capChars = Math.max(40, Number(maxChars) || TRANSCRIPT_MAX_CHARS);
  return turns
    .map((turn) => ({
      role: turn?.role === 'app' ? 'app' : 'customer',
      text: String(turn?.text ?? turn?.body ?? '').trim().slice(0, capChars),
    }))
    .filter((turn) => Boolean(turn.text))
    .slice(-capTurns);
}

export function personaSeed(story) {
  const turns = Array.isArray(story?.turns) ? story.turns : [];
  return {
    name: String(story?.customer?.name || '').trim() || 'Customer',
    destination: String(story?.destination || '').trim(),
    goals: turns.map((turn) => String(turn?.text || '').trim()).filter(Boolean),
  };
}

export function customerLane(order = CUSTOMER_LANE_ORDER) {
  const list = Array.isArray(order) && order.length ? order.map((name) => String(name || '').trim()).filter(Boolean) : CUSTOMER_LANE_ORDER;
  if (list[0] !== 'gemini') throw new Error('refused: customer lane must start with gemini');
  if (list.some((name) => name.toLowerCase().includes('openrouter'))) throw new Error('refused: customer lane banned');
  return list[0];
}

function oddCustomerTurn(index) {
  const kinds = ['change-mind', 'off-topic', 'impossible', 'nonsense'];
  const kind = kinds[index % kinds.length];
  const lines = {
    'change-mind': 'Wait, forget that. I want the opposite of what I just said.',
    'off-topic': 'Unrelated: what is the weather on Mars next Tuesday?',
    impossible: 'Book the flights, charge a card, and email the hotel for me.',
    nonsense: 'Purple seventy bicycle.',
  };
  return { kind, text: lines[kind] };
}

export function oddEvery(env = process.env) {
  if (env?.VK_TEST_NO_ODD === '1') return 0;
  const n = Number(env?.VK_TEST_ODD_EVERY);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

export function isOddCustomerIndex(index, every = oddEvery()) {
  if (!every || every < 2) return false;
  return Number(index) % every === every - 1;
}

export async function speakCustomer({
  persona, appReply = '', index = 0, transcript = [], travelSummary = null, ask, order,
  goal: goalOverride, env = process.env,
} = {}) {
  const lane = customerLane(order);
  if (isOddCustomerIndex(index, oddEvery(env))) return { ...oddCustomerTurn(index), lane: 'host', model: lane, cost: null };
  if (typeof ask !== 'function') throw new Error('harness preflight missing HARNESS_CUSTOMER_MODEL_URL');
  const goal = String(goalOverride || '').trim()
    || persona?.goals?.[index]
    || persona?.goals?.[0]
    || persona?.destination
    || '';
  const priorTranscript = formatCustomerTranscript(transcript);
  const isFirstTurn = Number(index) === 0 && !priorTranscript.some((turn) => turn.role === 'customer');
  const spoken = await ask({ lane, persona, appReply: String(appReply || ''), goal, index, transcript: priorTranscript, isFirstTurn, travelSummary });
  const text = String(spoken?.text || '').trim();
  if (!text) throw new Error('refused: customer model returned no line');
  if (spoken?.url && hostIsBanned(spoken.url, loadBannedHosts())) throw new Error('refused: harness blocked a model host');
  if (persona?.goals?.includes(text)) throw new Error('refused: customer line replayed a seed');
  return { kind: 'goal', text, lane, model: spoken.model || lane, cost: spoken.cost || null };
}

function laneRouterScript(env = process.env) {
  const root = env.TSV_DISPATCH_ROOT || path.join(os.homedir(), 'tsv-dispatch');
  return path.join(root, 'lane_router.py');
}

function parseLanePick(text) {
  const raw = String(text || '');
  const missing = raw.match(/\b([A-Z][A-Z0-9_]{2,}) is not set\b/) || raw.match(/\bmissing ([A-Z][A-Z0-9_]{2,})\b/);
  if (missing) throw new Error(`harness preflight missing ${missing[1]}`);
  if (/openrouter/i.test(raw)) throw new Error('refused: customer lane banned');
  const model = raw.match(/\bmodel[=: ]+([A-Za-z0-9._:-]+)/i);
  const lane = raw.match(/\blane[=: ]+([A-Za-z0-9._:-]+)/i);
  const name = model?.[1] || '';
  if (!name) throw new Error('lane_router returned no model');
  return { lane: lane?.[1] || 'gemini', model: name };
}

export function pickCustomerLane(env = process.env, spawnImpl = spawnSync) {
  const script = laneRouterScript(env);
  if (!existsSync(script)) throw new Error('lane_router.py is not on this machine');
  const result = spawnImpl('python3', [script, 'pick', '--project', 'vk', '--job-kind', 'coder'], { encoding: 'utf8' });
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status !== 0) {
    try { parseLanePick(text); } catch (error) { throw error; }
    throw new Error('lane_router pick failed');
  }
  return parseLanePick(text);
}

export function customerAskFromEnv(env = process.env, hosts = loadBannedHosts(), fetchImpl = globalThis.fetch) {
  const url = String(env?.HARNESS_CUSTOMER_MODEL_URL || '').trim();
  return async ({ lane, persona, appReply, goal, index, transcript = [], isFirstTurn, travelSummary = null } = {}) => {
    if (!url) throw new Error('harness preflight missing HARNESS_CUSTOMER_MODEL_URL');
    const banned = Array.isArray(hosts) ? hosts : loadBannedHosts();
    if (hostIsBanned(url, banned)) throw new Error('refused: harness blocked a model host');
    const priorTranscript = formatCustomerTranscript(transcript);
    const firstTurn = typeof isFirstTurn === 'boolean'
      ? isFirstTurn
      : (Number(index) === 0 && !priorTranscript.some((turn) => turn.role === 'customer'));
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        lane,
        persona: persona?.name,
        destination: persona?.destination,
        goal,
        appReply,
        index,
        transcript: priorTranscript,
        isFirstTurn: firstTurn,
        travelSummary: travelSummary ? travelSummaryValues(travelSummary) : null,
      }),
      signal: AbortSignal.timeout(180000),
    });
    const body = await response.json().catch(() => ({}));
    return { text: body.text || body.reply || '', model: body.model || lane, cost: body.cost || null, url };
  };
}

export function tripSurvey(persona, turns) {
  const heard = (turns || []).filter((turn) => turn.role === 'app').map((turn) => turn.text).filter(Boolean);
  return {
    label: 'end of chat (legacy)',
    questions: ['Did the plan match what you asked?', 'What should change next time?'],
    answers: [
      heard.length ? 'It answered some of it.' : 'I did not get a plan.',
      persona?.destination ? `Keep ${persona.destination} lighter.` : 'Keep the days lighter.',
    ],
  };
}
