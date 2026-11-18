import { secretValues, stagingOrigin } from './env.mjs';
import { loadBannedHosts, guardedFetch } from './fetch-guard.mjs';
import { provisionThrowaway } from './live-provision.mjs';
import { playCustomerTurns } from './live-play.mjs';
import { attachMedia, captureScreens, fetchKeepsake, renderDialog, runSteps, writeVideoCheck } from './live-outputs.mjs';
import { shortHash } from './redact.mjs';
import { deleteTaggedRows } from './cleanup.mjs';

function appEndpoint(origin, token, tripId) {
  const url = new URL('/api/vacation-itinerary', origin);
  url.searchParams.set('app', '1');
  url.searchParams.set('session', token);
  url.searchParams.set('tripId', tripId);
  return url;
}

export function liveOptions(env = process.env) {
  const bannedHosts = loadBannedHosts();
  const fetchImpl = guardedFetch(globalThis.fetch.bind(globalThis), bannedHosts);
  const origin = stagingOrigin(env);
  return {
    env,
    origin,
    bannedHosts,
    fetchImpl,
    secrets: secretValues(env),
    async play(story, options) {
      const { sql } = await import('../../src/vacation/db.mjs');
      const db = sql(env);
      const created = await provisionThrowaway(db, story, { tag: options.tag, runId: options.runId, env });
      const secrets = secretValues(env, [created.token]);
      const played = await playCustomerTurns(story, {
        origin,
        token: created.token,
        tripId: created.tripId,
        fetchImpl,
        hosts: bannedHosts,
      });
      const base = {
        ...played,
        sessionRef: shortHash(created.token),
        transcript: null,
        pdfText: '',
        dialogOk: false,
        dialogDetail: played.reason || '',
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
      };
      if (played.reason) return base;
      const steps = await runSteps(story, async () => {
        const response = await fetchImpl(appEndpoint(origin, created.token, created.tripId), {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'record-party', tripId: created.tripId, party: story.party }),
        });
        if (response.status >= 400) throw new Error('collaborator step failed');
      });
      const dialog = await renderDialog({ token: created.token, outDir: options.outDir, secrets });
      const attachment = await attachMedia({ origin, shareToken: created.shareToken, story, fetchImpl, env });
      const video = await writeVideoCheck({ origin, attachment, fetchImpl, outDir: options.outDir });
      const keepsake = await fetchKeepsake({ origin, shareToken: created.shareToken, fetchImpl, outDir: options.outDir });
      const screens = await captureScreens({ origin, shareToken: created.shareToken, sessionToken: created.token, outDir: options.outDir });
      return {
        ...base,
        steps,
        transcript: dialog.transcript,
        pdfText: dialog.pdfText,
        dialogOk: dialog.ok === true,
        dialogDetail: dialog.detail,
        dialogRefused: dialog.ok !== true,
        refusals: dialog.refusals || [],
        keepsakeOk: keepsake.ok === true,
        keepsakeDetail: keepsake.detail || '',
        screensOk: screens.ok === true,
        screensDetail: screens.error || '',
        videoExists: true,
        videoPass: video.pass === true,
        videoDetail: video.detail || '',
        chromeOk: screens.ok === true && !(screens.hits || []).length,
        chromeDetail: (screens.hits || []).join(','),
      };
    },
    async cleanup(tag) {
      const { sql } = await import('../../src/vacation/db.mjs');
      return deleteTaggedRows(sql(env), tag);
    },
  };
}
