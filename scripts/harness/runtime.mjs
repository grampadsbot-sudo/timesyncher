import { createAdminArtifactWriter, firstFiveTurnCapture, storeDialogPdf, storePdf } from './admin-review-artifacts.mjs';
import path from 'node:path';
import { preflightHarnessEnv, secretValues, stagingOrigin } from './env.mjs';
import { loadBannedHosts, guardedFetch } from './fetch-guard.mjs';
import { acceptAndConfirmEula } from './eula-accept.mjs';
import { provisionThrowaway } from './live-provision.mjs';
import { customerAskFromEnv } from './customer-live.mjs';
import { playCustomerTurns } from './live-play.mjs';
import { attachMedia, captureScreens, collaboratorStepFailure, fetchKeepsake, renderDialog, renderStoredDialog, runSteps, writeVideoCheck } from './live-outputs.mjs';
import { captureOnboardingPdf, rebuildCustomerPdf } from './onboarding-capture.mjs';
import { redactText, shortHash } from './redact.mjs';
import { redactUrls } from './backends.mjs';
import { transcriptForScorecard, writeRedactedLiveTranscript } from './redacted-transcript.mjs';
import { deleteTaggedRows } from './cleanup.mjs';
import { createCouponLedger, redeemRosterCoupon } from './coupon.mjs';
import { couponPaymentSteps } from './onboarding-capture.mjs';
import { stampUnstoredExchange } from './unstored-turn.mjs';
import { vkAdminStorage } from '../../src/vacation/vk-admin-review-storage.mjs';
import { assertAdminOnboardingCaptures } from './admin-onboarding-captures.mjs';
import { captureVacationInviteOnboarding } from './onboarding-invites.mjs';
import { attachSsrToKeepsakeMetadata } from '../customer_suite/ssr/dialog-hook.mjs';
import { createLiveSsrHarness, primeLiveSsr } from './live-ssr-harness.mjs';
import { finishMeasuredPlay } from './outcomes.mjs';

export { writeOutcomes } from './outcomes.mjs';

function stampLivePdf(doc, played) {
  if (!doc || !Array.isArray(doc.turns)) return doc;
  const last = [...doc.turns].reverse().find((turn) => turn.role === 'app');
  if (!last) return doc;
  last.qaRating = played?.qaRating || 'slot';
  last.survey = played?.survey || null;
  const appCosts = (played?.customerTurns || []).filter((turn) => turn.role === 'app').map((turn) => turn.cost).filter(Boolean);
  const customerCosts = (played?.customerTurns || []).filter((turn) => turn.role === 'customer').map((turn) => turn.cost).filter(Boolean);
  last.appCost = appCosts.length ? appCosts : 'none';
  last.customerCost = customerCosts.length ? customerCosts : 'none';
  return doc;
}

function appEndpoint(origin, token, tripId) {
  const url = new URL('/api/vacation-itinerary', origin);
  url.searchParams.set('app', '1');
  url.searchParams.set('session', token);
  url.searchParams.set('tripId', tripId);
  return url;
}

export function chatLeftNoThing(played) {
  return played?.itineraryCountSource !== 'db' || !(played.itineraryCount > 0);
}

export function maxTurnsFromEnv(env = process.env) {
  const raw = Number(env?.VK_TEST_MAX_TURNS);
  if (!Number.isFinite(raw) || raw === 0) return 5;
  return Math.max(1, Math.floor(raw));
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

function recordArtifactFailure(artifacts, failure, error) {
  if (!artifacts.errors.includes(failure)) artifacts.errors.push(failure);
  if (Number.isInteger(error?.status)) {
    artifacts.httpFailures.push({ failure, operation: error.operation, status: error.status });
  }
}

export async function playWithAdminArtifacts({ origin, token, tripId, outDir, secrets, fetchImpl, replyBackend, put, play, loadTranscript, openPage, measure }) {
  const capture = firstFiveTurnCapture({ origin, token, outDir, put, openPage });
  const adminArtifacts = { captures: [], dialogPdf: false, keepsakePdf: false, errors: [], httpFailures: [] };
  const captureFailure = (n) => `turn-${n}-capture-or-upload-failed`;
  const afterCustomerTurn = async (turn) => {
    try {
      if (await capture.capture(turn)) adminArtifacts.captures.push(turn.turn);
    } catch (error) {
      recordArtifactFailure(adminArtifacts, captureFailure(turn.turn), error);
    }
  };
  let played;
  try {
    played = await play(afterCustomerTurn);
  } catch (error) {
    played = { reason: 'harness-error', detail: redactUrls(redactText(error?.message || error, secrets)) };
  } finally {
    if (measure) played = { ...played, ...await measure(played?.tripId) };
    await capture.flush((n, error) => {
      if (error) recordArtifactFailure(adminArtifacts, captureFailure(n), error);
      else {
        adminArtifacts.captures.push(n);
        adminArtifacts.errors = adminArtifacts.errors.filter((failure) => failure !== captureFailure(n));
      }
    });
    await capture.close().catch(() => recordArtifactFailure(adminArtifacts, 'capture-close-failed'));
    adminArtifacts.captures.sort((left, right) => left - right);
  }
  const storedTranscript = await loadTranscript();
  writeRedactedLiveTranscript(outDir, storedTranscript, secrets);
  const transcript = played.reason ? stampUnstoredExchange(storedTranscript, played.exchange) : stampLivePdf(storedTranscript, played);
  let dialog = { ok: false, detail: 'no stored turns', pdfText: '' };
  if (transcript?.turns?.length) {
    try {
      dialog = await renderDialog({
        token, outDir, secrets, buildSha: played.liveShaStart, origin, fetchImpl, replyBackend,
        loadTranscript: async () => transcript,
        redactForAdmin: true,
      });
    } catch (error) {
      dialog.detail = redactUrls(redactText(error?.message || error, secrets));
    }
  }
  let uploadDialog;
  try {
    uploadDialog = dialog.ok ? dialog : renderStoredDialog({ transcript, outDir, secrets, failed: Boolean(played.reason) });
    if (!uploadDialog) recordArtifactFailure(adminArtifacts, 'dialog-pdf-generation-failed');
  } catch {
    recordArtifactFailure(adminArtifacts, 'dialog-pdf-generation-failed');
  }
  if (uploadDialog) {
    try {
      adminArtifacts.dialogPdf = await storeDialogPdf(put, played.tripId || tripId, uploadDialog);
    } catch (error) {
      recordArtifactFailure(adminArtifacts, 'dialog-pdf-upload-failed', error);
    }
  }
  return { played, adminArtifacts, dialog, transcript: transcriptForScorecard(dialog.transcript, transcript) };
}

export async function storeHarnessKeepsake({ origin, tripId, shareToken, fetchImpl, outDir, put, adminArtifacts }) {
  let keepsake;
  try {
    keepsake = await fetchKeepsake({ origin, shareToken, fetchImpl, outDir });
  } catch {
    keepsake = { ok: false, detail: 'keepsake request failed' };
  }
  if (!keepsake.ok) {
    recordArtifactFailure(adminArtifacts, 'keepsake-pdf-generation-failed');
    return keepsake;
  }
  try {
    adminArtifacts.keepsakePdf = await storePdf(put, tripId, 'keepsake-pdf', keepsake.file);
  } catch (error) {
    recordArtifactFailure(adminArtifacts, 'keepsake-pdf-upload-failed', error);
  }
  return keepsake;
}

export function liveOptions(env = process.env) {
  const ready = preflightHarnessEnv(env);
  const bannedHosts = loadBannedHosts();
  const fetchImpl = guardedFetch(globalThis.fetch.bind(globalThis), bannedHosts);
  const origin = stagingOrigin(ready);
  const playProvisioned = async (story, options, secrets, { db, rememberTrip, measure }) => {
      const created = await provisionThrowaway(db, story, {
        tag: options.tag, runId: options.runId, env: ready, outDir: options.outDir, secrets,
      });
      rememberTrip(created.tripId);
      secrets.push(created.token, created.shareToken);
      let couponRedemption = null;
      if (story.coupon) {
        try {
          couponRedemption = await redeemRosterCoupon({ story, runId: options.runId, origin, fetchImpl, ledger: options.ledger || createCouponLedger() });
          if (couponRedemption.session_token) secrets.push(couponRedemption.session_token);
        } catch (error) {
          couponRedemption = { status: 'error', pass: false, detail: String(error?.message || error).replace(/session=[^&\s]+/gi, 'session=[redacted]').slice(0, 200) };
        }
      }
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
          ...(story.coupon ? { payment: couponPaymentSteps({ code: story.coupon.code, sessionToken: couponRedemption?.session_token || '', origin, minted: story.coupon.mintedCode || '' }) } : {}),
        });
      } catch (error) {
        onboard = { ok: false, detail: String(error?.message || error).replace(/session=[^&\s]+/gi, 'session=[redacted]').slice(0, 240) };
      }
      const onboardingFields = () => ({
        onboardingPdfOk: onboard.ok === true,
        onboardingPdfDetail: onboard.detail || 'missing',
        couponRedemption,
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
      const liveCustomer = story.reply_backend === 'vk_bot_mcp' || story.reply_backend === 'trip_state';
      const harnessVacation = { db, tripId: created.tripId, tag: options.tag, openStore: () => vkAdminStorage(ready) };
      const putArtifact = createAdminArtifactWriter({
        origin, login: ready.VK_ADMIN_LOGIN, fetchImpl, harnessVacation,
      });
      const { ssrReactions, ssrSetupErrors, liveSsrRespond } = await primeLiveSsr({
        liveCustomer, story, ready, bannedHosts, customerAskFromEnv,
      });
      const { played, adminArtifacts, dialog, transcript } = await playWithAdminArtifacts({
        origin, token: created.token, tripId: created.tripId, outDir: options.outDir, secrets, fetchImpl,
        replyBackend: story.reply_backend, put: putArtifact,
        loadTranscript: async () => await storedLiveTranscript(db, created.token),
        measure,
        play: (afterCustomerTurn) => playCustomerTurns(story, {
          origin,
          token: created.token,
          tripId: created.tripId,
          fetchImpl,
          hosts: bannedHosts,
          waitMs: 20000,
          secrets,
          onTrip: rememberTrip,
          afterCustomerTurn,
          liveCustomer,
          customerAsk: customerAskFromEnv(ready, bannedHosts),
          maxTurns: maxTurnsFromEnv(ready.VK_TEST_MAX_TURNS != null ? ready : process.env),
        }),
      });
      adminArtifacts.errors.push(...ssrSetupErrors);
      const storedTranscript = await storedLiveTranscript(db, created.token);
      const tripId = played.tripId || created.tripId;
      harnessVacation.tripId = tripId;
      adminArtifacts.onboardingCaptures = [];
      const captureInviteOnboarding = async (issuePlanned = true) => {
        try {
          const invited = await captureVacationInviteOnboarding({
            db, story, ownerCustomerId: created.customerId, tripId,
            tag: options.tag, origin, env: ready, outDir: options.outDir, put: putArtifact, issuePlanned,
          });
          adminArtifacts.onboardingCaptures.push(...invited.uploaded);
          adminArtifacts.errors.push(...invited.errors);
        } catch {
          adminArtifacts.errors.push('invite-onboarding-capture-failed');
        }
      };
      const shareToken = played.shareToken || created.shareToken;
      const keepsakeOptions = { origin, tripId, shareToken, fetchImpl, outDir: options.outDir, put: putArtifact, adminArtifacts };
      const base = {
        ...played,
        adminArtifacts,
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
      if (played.reason) {
        const keepsake = !chatLeftNoThing(played) ? await storeHarnessKeepsake(keepsakeOptions) : null;
        return {
          ...base,
          tripId,
          ssrReactions,
          transcript,
          pdfText: dialog.pdfText,
          keepsakeOk: keepsake?.ok === true,
          keepsakeDetail: keepsake?.detail || '',
          pricingReactionCaptured: played.pricingReactionCaptured === true,
          customerTurnCount: played.customerTurnCount || 0,
          hitTurnCap: played.hitTurnCap === true,
        };
      }
      const qa = played.qaRating && played.qaRating !== 'slot' ? played.qaRating : null;
      if (qa || played.survey) {
        try {
          await putArtifact(tripId, 'review', { qa, survey: played.survey });
        } catch (error) {
          recordArtifactFailure(adminArtifacts, 'review-upload-failed', error);
        }
      }
      const steps = await runSteps(story, async () => {
        const response = await fetchImpl(appEndpoint(origin, created.token, tripId), {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'record-party', tripId, party: story.party }),
        });
        if (response.status >= 400) throw new Error(await collaboratorStepFailure(response));
      });
      const { finalizeLiveSsr, renderLiveDialogWithSsr } = createLiveSsrHarness({
        liveCustomer, liveSsrRespond, ssrReactions, adminArtifacts, story, played, tripId,
        putArtifact, outDir: options.outDir, recordArtifactFailure, stampLivePdf, storedTranscript,
        created, secrets, origin, fetchImpl, replyBackend: story.reply_backend,
      });
      await captureInviteOnboarding(!played.reason);
      if (chatLeftNoThing(played)) {
        const reason = played.itineraryCountSource === 'db' ? 'no-thing-after-chat' : 'itinerary-unmeasured';
        const ssrRecord = await finalizeLiveSsr({ ok: false, detail: reason });
        const outDialog = ssrRecord ? await renderLiveDialogWithSsr(ssrRecord) : dialog;
        const outTranscript = transcriptForScorecard(outDialog.transcript, transcript);
        const video = await writeVideoCheck({ origin, attachment: { ok: false, detail: 'no-thing-after-chat', bindings: [] }, fetchImpl, outDir: options.outDir });
        return {
          ...base,
          tripId,
          steps,
          ssrReactions,
          ssr: ssrRecord,
          transcript: outTranscript,
          pdfText: outDialog.pdfText,
          dialogOk: outDialog.ok === true,
          dialogDetail: outDialog.detail,
          dialogRefused: outDialog.ok !== true,
          videoExists: !String(video.detail || '').startsWith('video-missing'),
          videoPass: false,
          videoDetail: video.detail,
          reason,
          pricingReactionCaptured: played.pricingReactionCaptured === true,
          customerTurnCount: played.customerTurnCount || 0,
          hitTurnCap: played.hitTurnCap === true,
          keepsakeOk: false,
          ...onboardingFields(),
        };
      }
      const attachment = await attachMedia({ origin, shareToken, story, fetchImpl, env: ready });
      const video = await writeVideoCheck({ origin, attachment, fetchImpl, outDir: options.outDir });
      const keepsake = await storeHarnessKeepsake(keepsakeOptions);
      const ssrRecord = await finalizeLiveSsr(keepsake);
      if (ssrRecord) {
        attachSsrToKeepsakeMetadata({
          outDir: options.outDir,
          keepsakePath: keepsake.ok ? path.join(options.outDir, 'keepsake.pdf') : '',
          ssrRecord,
          keepsakeStatus: keepsake.ok ? 'shown' : 'skipped',
          keepsakeNote: keepsake.detail || '',
        });
      }
      const outDialog = ssrRecord ? await renderLiveDialogWithSsr(ssrRecord) : dialog;
      const outTranscript = ssrRecord ? transcriptForScorecard(outDialog.transcript, transcript) : transcript;
      const screens = await captureScreens({ origin, shareToken, sessionToken: created.token, outDir: options.outDir });
      try {
        onboard = await rebuildCustomerPdf(onboard, screens.files || []);
      } catch (error) {
        onboard = { ...onboard, ok: false, detail: String(error?.message || error).slice(0, 240) };
      }
      const pricingOk = played.pricingReactionCaptured === true;
      const itineraryOk = Number(played.itineraryCount) > 0;
      const keepsakeOk = keepsake.ok === true;
      let reason = assertAdminOnboardingCaptures(story, adminArtifacts)
        || (adminArtifacts.errors.length ? 'admin-artifact-upload-or-capture-failed' : '')
        || (adminArtifacts.captures.length !== 5 ? 'admin-first-five-captures-missing' : '');
      if (liveCustomer && (!itineraryOk || !keepsakeOk || !pricingOk)) {
        const missing = [
          itineraryOk ? null : 'itinerary',
          keepsakeOk ? null : 'keepsake',
          pricingOk ? null : 'pricing-reaction',
        ].filter(Boolean);
        reason = played.hitTurnCap
          ? `cap-without-required:${missing.join(',')}`
          : `missing-required:${missing.join(',')}`;
      }
      return {
        ...base,
        tripId,
        steps,
        ssrReactions,
        ssr: ssrRecord,
        transcript: outTranscript,
        pdfText: outDialog.pdfText,
        dialogOk: outDialog.ok === true,
        dialogDetail: outDialog.detail,
        dialogRefused: outDialog.ok !== true,
        refusals: outDialog.refusals || [],
        keepsakeOk,
        keepsakeDetail: keepsake.detail || '',
        pricingReactionCaptured: pricingOk,
        customerTurnCount: played.customerTurnCount || 0,
        hitTurnCap: played.hitTurnCap === true,
        reason,
        screensOk: screens.ok === true,
        screensDetail: screens.error || '',
        videoExists: !String(video.detail || '').startsWith('video-missing'),
        videoPass: video.pass === true,
        videoDetail: video.detail || '',
        chromeOk: screens.ok === true && !(screens.hits || []).length,
        chromeDetail: (screens.hits || []).join(','),
        ...onboardingFields(),
      };
  };
  const play = async (story, options) => {
    const secrets = secretValues(ready);
    return finishMeasuredPlay({
      tag: options.tag, outDir: options.outDir, secrets,
      async connect() {
        const { sql } = await import('../../src/vacation/db.mjs');
        return sql(ready);
      },
      play: async (measurement) => await playProvisioned(story, options, secrets, measurement),
    });
  };
  return {
    env: ready,
    origin,
    bannedHosts,
    fetchImpl,
    secrets: secretValues(env),
    play,
    mcpRoute: {
      backend: 'vk_bot_mcp',
      openRouter: false,
      guard: 'staging-fetch',
      origin,
      play,
    },
    async cleanup(tag, { outDir } = {}) {
      const { sql } = await import('../../src/vacation/db.mjs');
      return deleteTaggedRows(sql(ready), tag, { snapshotDir: outDir, secrets: secretValues(ready) });
    },
  };
}
