import { pickCustomerLane } from './customer-live.mjs';
import { httpHarnessEnv } from './env.mjs';
import { guardedFetch, loadBannedHosts } from './fetch-guard.mjs';

function stopped(reason) {
  return {
    reason,
    hostOnly: reason === 'host-only-database' ? 'DATABASE_URL' : '',
    waveStop: false,
    timings: [],
    liveShaStart: '',
    liveShaEnd: '',
    storedTurns: 0,
    itineraryCount: 0,
    tripId: '',
    shareToken: '',
    detail: reason === 'host-only-database' ? 'DATABASE_URL' : reason,
    transcript: null,
    pdfText: '',
    dialogOk: false,
    dialogDetail: reason,
    dialogRefused: false,
    keepsakeOk: false,
    keepsakeDetail: '',
    screensOk: false,
    screensDetail: '',
    videoExists: false,
    videoPass: false,
    videoDetail: '',
    chromeOk: false,
    chromeDetail: '',
    steps: [],
    couponRedemption: null,
  };
}

export function httpLiveOptions(env = process.env, { fetchImpl, pickLane = pickCustomerLane } = {}) {
  const prepared = httpHarnessEnv(env);
  const bannedHosts = loadBannedHosts();
  const send = fetchImpl || guardedFetch(globalThis.fetch.bind(globalThis), bannedHosts);
  const origin = prepared.origin;
  const play = async () => {
    const blocked = [];
    try { pickLane(prepared.env); } catch (error) { blocked.push(String(error?.message || error)); }
    blocked.push('staging HTTP API does not set replyBackend');
    return { ...stopped(blocked.join('; ')), detail: blocked.join('; ') };
  };
  return {
    env: prepared.env,
    origin,
    bannedHosts,
    fetchImpl: send,
    play,
    mcpRoute: {
      backend: 'vk_bot_mcp',
      openRouter: false,
      guard: 'staging-fetch',
      origin,
      play,
    },
    async cleanup() {
      return { deleted: {}, remaining: 0, hostOnly: 'DATABASE_URL' };
    },
  };
}
