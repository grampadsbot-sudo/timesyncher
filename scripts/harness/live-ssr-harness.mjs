import fs from 'node:fs';
import path from 'node:path';
import { buildFeedbackArtifact } from '../../src/vacation/vk-admin-feedback.mjs';
import { scoreCustomerCheckpoints } from '../customer_suite/ssr/scorer.mjs';
import { collectLiveSsrCheckpoint, createLiveSsrRespond } from './live-ssr.mjs';
import { renderDialog } from './live-outputs.mjs';
import { storeDialogPdf } from './admin-review-artifacts.mjs';

export async function primeLiveSsr({ liveCustomer, story, ready, bannedHosts, customerAskFromEnv }) {
  const ssrReactions = [];
  const ssrSetupErrors = [];
  let liveSsrRespond = null;
  if (liveCustomer) {
    liveSsrRespond = createLiveSsrRespond({
      story,
      customerAsk: customerAskFromEnv(ready, bannedHosts),
      env: ready,
    });
    try {
      ssrReactions.push(await collectLiveSsrCheckpoint('after_setup', liveSsrRespond));
    } catch {
      ssrSetupErrors.push('ssr-after-setup-failed');
    }
  }
  return { ssrReactions, ssrSetupErrors, liveSsrRespond };
}

export function createLiveSsrHarness({
  liveCustomer, liveSsrRespond, ssrReactions, adminArtifacts, story, played, tripId,
  putArtifact, outDir, recordArtifactFailure, stampLivePdf, storedTranscript,
  created, secrets, origin, fetchImpl, replyBackend,
}) {
  async function finalizeLiveSsr(keepsakeDecision) {
    if (!liveCustomer || !liveSsrRespond) return null;
    const keepsakeStatus = keepsakeDecision?.ok === true ? 'shown' : 'skipped';
    const keepsakeNote = keepsakeDecision?.detail || '';
    for (const [checkpointId, extra] of [
      ['after_keepsake', { keepsakeStatus, keepsakeNote }],
      ['pricing_10', {}],
      ['pricing_17', {}],
    ]) {
      try {
        ssrReactions.push(await collectLiveSsrCheckpoint(checkpointId, liveSsrRespond, extra));
      } catch {
        adminArtifacts.errors.push(`ssr-${checkpointId}-failed`);
      }
    }
    try {
      const ssr = scoreCustomerCheckpoints({
        storyId: story.story_id,
        customerName: story.customer?.name || '',
        reactions: ssrReactions,
      });
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'ssr-receipt.json'), `${JSON.stringify({ reactions: ssrReactions, ssr }, null, 2)}\n`);
      try {
        await putArtifact(tripId, 'feedback', buildFeedbackArtifact({
          story,
          played: { ...played, tripId, survey: played.survey },
          reactions: ssrReactions,
          ssr,
        }));
      } catch (error) {
        recordArtifactFailure(adminArtifacts, 'feedback-artifact-upload-failed', error);
      }
      return ssr;
    } catch {
      adminArtifacts.errors.push('ssr-score-failed');
      return null;
    }
  }

  async function renderLiveDialogWithSsr(ssrRecord) {
    const ssrDialog = await renderDialog({
      token: created.token,
      outDir,
      secrets,
      buildSha: played.liveShaStart,
      origin,
      fetchImpl,
      replyBackend,
      ssrSummary: ssrRecord,
      loadTranscript: async () => stampLivePdf(storedTranscript, played),
      redactForAdmin: true,
    });
    try {
      adminArtifacts.dialogPdf = await storeDialogPdf(putArtifact, tripId, ssrDialog);
    } catch (error) {
      recordArtifactFailure(adminArtifacts, 'dialog-pdf-upload-failed', error);
    }
    return ssrDialog;
  }

  return { finalizeLiveSsr, renderLiveDialogWithSsr };
}