import { createAdminArtifactWriter, firstFiveTurnCapture, storeDialogPdf } from './admin-review-artifacts.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { preflightHarnessEnv, secretValues, stagingOrigin } from './env.mjs';
import { loadBannedHosts, guardedFetch } from './fetch-guard.mjs';
import { acceptAndConfirmEula } from './eula-accept.mjs';
import { provisionThrowaway } from './live-provision.mjs';
import { customerAskFromEnv } from './customer-live.mjs';
import { sumUsageUsd } from './cost.mjs';
import { playCustomerTurns } from './live-play.mjs';
import { attachMedia, captureScreens, fetchKeepsake, renderDialog, runSteps, writeVideoCheck } from './live-outputs.mjs';
import { captureOnboardingPdf, rebuildCustomerPdf } from './onboarding-capture.mjs';
import { shortHash } from './redact.mjs';
import { transcriptForScorecard, writeRedactedLiveTranscript } from './redacted-transcript.mjs';
import { deleteTaggedRows } from './cleanup.mjs';
import { createCouponLedger, redeemRosterCoupon } from './coupon.mjs';
import { couponPaymentSteps } from './onboarding-capture.mjs';
import { captureVacationInviteOnboarding } from './onboarding-invites.mjs';

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
  return !Number(played?.itineraryCount);
}

export function maxTurnsFromEnv(env = process.env) {
  const raw = Number(env?.VK_TEST_MAX_TURNS);
  if (!Number.isFinite(raw) || raw === 0) return 4;
  return Math.max(1, Math.floor(raw));
}

export function rescuedTimeoutsSummary(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const turns = Array.isArray(value.turns) ? value.turns.map((n) => Number(n)).filter(Number.isFinite) : [];
  return {
    count: Number(value.count) || turns.length,
    turns,
    timeouts: Number(value.timeouts) || 0,
  };
}

export function writeOutcomes(outDir, payload) {
  if (!outDir) return payload;
  try {
    const costs = [];
    const turns = Array.isArray(payload?.customerTurns) ? payload.customerTurns : [];
    for (const turn of turns) {
      if (turn?.cost) costs.push(turn.cost);
    }
    const rawFallbacks = payload?.planningFallbacks && typeof payload.planningFallbacks === 'object'
      ? payload.planningFallbacks
      : { count: 0, turns: [] };
    const fallbackTurns = Array.isArray(rawFallbacks.turns) ? rawFallbacks.turns : [];
    const costUsd = sumUsageUsd(turns.filter((turn) => turn?.cost).map((turn) => ({ usage: turn.cost, model: turn.model || '' })));
    const rec = {
      tripId: payload?.tripId ? String(payload.tripId) : '',
      itineraryCount: Number(payload?.itineraryCount) || 0,
      keepsakeOk: payload?.keepsakeOk === true,
      pricingReactionCaptured: payload?.pricingReactionCaptured === true,
      customerTurnCount: Number(payload?.customerTurnCount) || turns.filter((turn) => turn.role === 'customer').length,
      hitTurnCap: payload?.hitTurnCap === true,
      reason: payload?.reason || '',
      planningFallbacks: { count: Number(rawFallbacks.count) || fallbackTurns.length, turns: fallbackTurns },
      rescuedTimeouts: rescuedTimeoutsSummary(payload?.rescuedTimeouts),
      costs,
      costUsd,
      ...(payload.adminArtifacts ? { adminArtifacts: payload.adminArtifacts } : {}),
      liveShaStart: payload?.liveShaStart || '',
      liveShaEnd: payload?.liveShaEnd || '',
    };
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'outcomes.json'), `${JSON.stringify(rec, null, 2)}\n`);
  } catch {
    return payload;
  }
  return payload;
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
  const play = async (story, options) => {
      const { sql } = await import('../../src/vacation/db.mjs');
      const db = sql(ready);
      const created = await provisionThrowaway(db, story, { tag: options.tag, runId: options.runId, env: ready });
      const secrets = secretValues(ready, [created.token]);
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
      const liveCustomer = story.reply_backend === 'vk_bot_mcp';
      const putArtifact = createAdminArtifactWriter({ origin, login: ready.VK_ADMIN_LOGIN, fetchImpl });
      const capture = firstFiveTurnCapture({ origin, token: created.token, outDir: options.outDir, put: putArtifact });
      const adminArtifacts = { captures: [], onboardingCaptures: [], dialogPdf: false, errors: [] };
      const publishDialog = async (tripId, dialog) => {
        try {
          adminArtifacts.dialogPdf = await storeDialogPdf(putArtifact, tripId, dialog);
        } catch {
          adminArtifacts.errors.push('dialog-pdf-upload-failed');
        }
      };
      let played;
      try {
        played = await playCustomerTurns(story, {
          origin,
          token: created.token,
          tripId: created.tripId,
          fetchImpl,
          hosts: bannedHosts,
          waitMs: 20000,
          secrets,
          afterCustomerTurn: async (turn) => {
            try {
              if (await capture.capture(turn)) adminArtifacts.captures.push(turn.turn);
            } catch {
              adminArtifacts.errors.push(`turn-${turn.turn}-capture-or-upload-failed`);
            }
          },
          liveCustomer,
          customerAsk: customerAskFromEnv(ready, bannedHosts),
          maxTurns: maxTurnsFromEnv(ready.VK_TEST_MAX_TURNS != null ? ready : process.env),
        });
      } finally {
        await capture.close();
      }
      try {
        const invited = await captureVacationInviteOnboarding({
          db, story, ownerCustomerId: created.customerId, tripId: played.tripId || created.tripId,
          tag: options.tag, origin, env: ready, outDir: options.outDir, put: putArtifact,
          issuePlanned: !played.reason,
        });
        adminArtifacts.onboardingCaptures.push(...invited.uploaded);
        adminArtifacts.errors.push(...invited.errors);
      } catch {
        adminArtifacts.errors.push('invite-onboarding-capture-failed');
      }
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
      const storedTranscript = await storedLiveTranscript(db, created.token);
      writeRedactedLiveTranscript(options.outDir, storedTranscript, secrets);
      if (played.reason) {
        const { stampUnstoredExchange } = await import('./unstored-turn.mjs');
        const stamped = stampUnstoredExchange(storedTranscript, played.exchange) || storedTranscript;
        if (stamped) {
          const dialog = await renderDialog({
            token: created.token,
            outDir: options.outDir,
            secrets,
            buildSha: played.liveShaStart,
            origin,
            fetchImpl,
            replyBackend: story.reply_backend,
            loadTranscript: async () => stamped,
          });
          await publishDialog(played.tripId || created.tripId, dialog);
        }
        return writeOutcomes(options.outDir, {
          ...base,
          tripId: played.tripId || created.tripId || '',
          transcript: stamped,
          pricingReactionCaptured: played.pricingReactionCaptured === true,
          customerTurnCount: played.customerTurnCount || 0,
          hitTurnCap: played.hitTurnCap === true,
        });
      }
      const tripId = played.tripId || created.tripId;
      const shareToken = played.shareToken || created.shareToken;
      const qa = played.qaRating && played.qaRating !== 'slot' ? played.qaRating : null;
      if (qa || played.survey) {
        try {
          await putArtifact(tripId, 'review', { qa, survey: played.survey });
        } catch {
          adminArtifacts.errors.push('review-upload-failed');
        }
      }
      const steps = await runSteps(story, async () => {
        const response = await fetchImpl(appEndpoint(origin, created.token, tripId), {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'record-party', tripId, party: story.party }),
        });
        if (response.status >= 400) throw new Error('collaborator step failed');
      });
      const dialog = await renderDialog({
        token: created.token,
        outDir: options.outDir,
        secrets,
        buildSha: played.liveShaStart,
        origin,
        fetchImpl,
        replyBackend: story.reply_backend,
        loadTranscript: async () => stampLivePdf(await storedLiveTranscript(db, created.token), played),
      });
      await publishDialog(tripId, dialog);
      const transcript = transcriptForScorecard(dialog.transcript, storedTranscript);
      if (chatLeftNoThing(played)) {
        const video = await writeVideoCheck({ origin, attachment: { ok: false, detail: 'no-thing-after-chat', bindings: [] }, fetchImpl, outDir: options.outDir });
        return writeOutcomes(options.outDir, {
          ...base,
          tripId,
          steps,
          transcript,
          pdfText: dialog.pdfText,
          dialogOk: dialog.ok === true,
          dialogDetail: dialog.detail,
          dialogRefused: dialog.ok !== true,
          videoExists: !String(video.detail || '').startsWith('video-missing'),
          videoPass: false,
          videoDetail: video.detail,
          reason: 'no-thing-after-chat',
          pricingReactionCaptured: played.pricingReactionCaptured === true,
          customerTurnCount: played.customerTurnCount || 0,
          hitTurnCap: played.hitTurnCap === true,
          keepsakeOk: false,
          ...onboardingFields(),
        });
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
      const pricingOk = played.pricingReactionCaptured === true;
      const itineraryOk = Number(played.itineraryCount) > 0;
      const keepsakeOk = keepsake.ok === true;
      let reason = adminArtifacts.errors.length ? 'admin-artifact-upload-or-capture-failed'
        : adminArtifacts.captures.length !== 5 ? 'admin-first-five-captures-missing' : '';
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
      return writeOutcomes(options.outDir, {
        ...base,
        tripId,
        steps,
        transcript,
        pdfText: dialog.pdfText,
        dialogOk: dialog.ok === true,
        dialogDetail: dialog.detail,
        dialogRefused: dialog.ok !== true,
        refusals: dialog.refusals || [],
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
    async cleanup(tag) {
      const { sql } = await import('../../src/vacation/db.mjs');
      return deleteTaggedRows(sql(ready), tag);
    },
  };
}
