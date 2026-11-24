import { couponRequestBody } from './coupon.mjs';
import { httpHarnessEnv } from './env.mjs';
import { guardedFetch, loadBannedHosts } from './fetch-guard.mjs';
import { mintFreshStagingCoupon } from './mint-coupon.mjs';

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

export function httpLiveOptions(env = process.env, { fetchImpl } = {}) {
  const prepared = httpHarnessEnv(env);
  const bannedHosts = loadBannedHosts();
  const send = fetchImpl || guardedFetch(globalThis.fetch.bind(globalThis), bannedHosts);
  const origin = prepared.origin;
  const play = async (story, options = {}) => {
    const minted = await mintFreshStagingCoupon({
      origin,
      env: prepared.env,
      runId: options.runId || 'probe',
      storyId: story.story_id || 'story',
      fetchImpl: send,
    });
    if (!minted.ok) return { ...stopped('coupon-not-minted'), hostOnly: minted.missing, detail: minted.missing };
    const liveStory = { ...story, coupon: { ...(story.coupon || {}), code: minted.code, mintedCode: minted.code } };
    const version = await send(new URL('/api/version', origin), { headers: { accept: 'application/json' } });
    if (Number(version.status) >= 400) return stopped('staging-unreachable');
    const body = { ...couponRequestBody(liveStory, options.runId || 'probe'), action: 'validate_coupon' };
    const response = await send(new URL('/api/checkout-coupon', origin), {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (Number(response.status) >= 400) {
      const data = typeof response.json === 'function' ? await response.json().catch(() => ({})) : {};
      const error = String(data?.error || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, '[email]').slice(0, 180);
      return { ...stopped('coupon-not-validated'), detail: error || 'coupon-not-validated' };
    }
    return { ...stopped('host-only-database'), couponCode: minted.code };
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
