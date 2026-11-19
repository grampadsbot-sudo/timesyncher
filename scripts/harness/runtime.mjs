import { preflightHarnessEnv, secretValues, stagingOrigin } from './env.mjs';
import { loadBannedHosts, guardedFetch } from './fetch-guard.mjs';
import { acceptAndConfirmEula } from './eula-accept.mjs';
import { provisionThrowaway } from './live-provision.mjs';
import { playCustomerTurns } from './live-play.mjs';
import { attachMedia, captureScreens, fetchKeepsake, renderDialog, runSteps, writeVideoCheck } from './live-outputs.mjs';
import { captureOnboardingPdf, rebuildCustomerPdf } from './onboarding-capture.mjs';
import { shortHash } from './redact.mjs';
import { transcriptForScorecard, writeRedactedLiveTranscript } from './redacted-transcript.mjs';
import { deleteTaggedRows } from './cleanup.mjs';

function appEndpoint(origin, token, tripId) {
  const url = new URL('/api/vacation-itinerary', origin);
  url.searchParams.set('app', '1');
  url.searchParams.set('session', token);
  url.searchParams.set('tripId', tripId);
  return url;
}

export function chatLeftNoThing(played) {
  return !Number(played?.itineraryCount);
}

async function storedLiveTranscript(db, token) {
  const { loadLiveTranscriptByToken } = await import('../../src/vacation/live-app-turn.mjs');
  try {
    return await loadLiveTranscriptByToken(db, token);
  } catch (error) {
    if (error?.code === 'LIVE_TRANSCRIPT_MISSING') return null;
    throw error;
  }
}

export function liveOptions(env = process.env) {
  const ready = preflightHarnessEnv(env);
  const bannedHosts = loadBannedHosts();
  const fetchImpl = guardedFetch(globalThis.fetch.bind(globalThis), bannedHosts);
  const origin = stagingOrigin(ready);
  return {
    env: ready,
    origin,
    bannedHosts,
    fetchImpl,
    secrets: secretValues(env),
    async play(story, options) {
      const { sql } = await import('../../src/vacation/db.mjs');
      const db = sql(ready);
      const created = await provisionThrowaway(db, story, { tag: options.tag, runId: options.runId, env: ready });
      const secrets = secretValues(ready, [created.token]);
      let onboard = { ok: false, detail: 'missing' };
      try {
        onboard = await captureOnboardingPdf({
          origin,
          outDir: options.outDir,
          runId: options.runId,
          customer: {
            name: story.customer.name,
            email: `harness+${options.runId}+${story.customer.email_alias}@harness.invalid`,
          },
        });
      } catch (error) {
        onboard = { ok: false, detail: String(error?.message || error).replace(/session=[^&\s]+/gi, 'session=[redacted]').slice(0, 240) };
      }
      const onboardingFields = () => ({
        onboardingPdfOk: onboard.ok === true,
        onboardingPdfDetail: onboard.detail || 'missing',
      });
      try {
        await acceptAndConfirmEula({
          origin,
          token: created.token,
          tripId: created.tripId,
          acceptedByName: story.customer.name,
          fetchImpl,
        });
      } catch (error) {
        if (error?.code !== 'eula_not_accepted') throw error;
        return {
          reason: 'eula_not_accepted',
          waveStop: false,
          timings: [],
          liveShaStart: '',
          liveShaEnd: '',
          storedTurns: 0,
          itineraryCount: 0,
          tripId: created.tripId,
          shareToken: created.shareToken,
          detail: 'eula.accepted was not true after accept',
          sessionRef: shortHash(created.token),
          transcript: null,
          pdfText: '',
          dialogOk: false,
          dialogDetail: 'eula_not_accepted',
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
          ...onboardingFields(),
        };
      }
      const played = await playCustomerTurns(story, {
        origin,
        token: created.token,
        tripId: created.tripId,
        fetchImpl,
        hosts: bannedHosts,
        waitMs: 20000,
        secrets,
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
        ...onboardingFields(),
      };
      const storedTranscript = await storedLiveTranscript(db, created.token);
      writeRedactedLiveTranscript(options.outDir, storedTranscript, secrets);
      if (played.reason) return { ...base, transcript: storedTranscript };
      const tripId = played.tripId || created.tripId;
      const shareToken = played.shareToken || created.shareToken;
      const steps = await runSteps(story, async () => {
        const response = await fetchImpl(appEndpoint(origin, created.token, tripId), {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'record-party', tripId, party: story.party }),
        });
        if (response.status >= 400) throw new Error('collaborator step failed');
      });
      const dialog = await renderDialog({ token: created.token, outDir: options.outDir, secrets, buildSha: played.liveShaStart, origin, fetchImpl, replyBackend: story.reply_backend });
      const transcript = transcriptForScorecard(dialog.transcript, storedTranscript);
      if (chatLeftNoThing(played)) {
        const video = await writeVideoCheck({ origin, attachment: { ok: false, detail: 'no-thing-after-chat', bindings: [] }, fetchImpl, outDir: options.outDir });
        return {
          ...base,
          steps,
          transcript,
          pdfText: dialog.pdfText,
          dialogOk: dialog.ok === true,
          dialogDetail: dialog.detail,
          dialogRefused: dialog.ok !== true,
          videoExists: true,
          videoPass: false,
          videoDetail: video.detail,
          reason: 'no-thing-after-chat',
          ...onboardingFields(),
        };
      }
      const attachment = await attachMedia({ origin, shareToken, story, fetchImpl, env: ready });
      const video = await writeVideoCheck({ origin, attachment, fetchImpl, outDir: options.outDir });
      const keepsake = await fetchKeepsake({ origin, shareToken, fetchImpl, outDir: options.outDir });
      const screens = await captureScreens({ origin, shareToken, sessionToken: created.token, outDir: options.outDir });
      try {
        onboard = await rebuildCustomerPdf(onboard, screens.files || []);
      } catch (error) {
        onboard = { ...onboard, ok: false, detail: String(error?.message || error).slice(0, 240) };
      }
      return {
        ...base,
        steps,
        transcript,
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
        ...onboardingFields(),
      };
    },
    async cleanup(tag) {
      const { sql } = await import('../../src/vacation/db.mjs');
      return deleteTaggedRows(sql(ready), tag);
    },
  };
}
