import fs from 'node:fs';
import path from 'node:path';
import { aggregateSsrWave, ssrScoreboardMarkdown } from './aggregate.mjs';
import { ANCHOR_SET_VERSION } from './anchors.mjs';
import { collectCheckpointReactions, getCheckpointDefinition } from './checkpoints.mjs';
import { attachSsrToDialogPack, attachSsrToKeepsakeMetadata, recordDialogPdfStatus } from './dialog-hook.mjs';
import { createLocalBgeEmbedder } from './embedder.mjs';
import { assertSsrTargetSafe } from './safety.mjs';
import { DEFAULT_SSR_TEMPERATURE, scoreCustomerCheckpoints } from './scorer.mjs';

export function createHarnessSsrHook({
  embedder = null,
  temperature = DEFAULT_SSR_TEMPERATURE,
  anchorVersion = ANCHOR_SET_VERSION,
  respond = null,
  reactionsByStory = null,
  skipDialogPdf = false,
  skipDialogReason = '',
} = {}) {
  let resolvedEmbedder = embedder;
  const getEmbedder = () => {
    if (!resolvedEmbedder) resolvedEmbedder = createLocalBgeEmbedder();
    return resolvedEmbedder;
  };

  async function resolveReactions(story, played = null) {
    if (Array.isArray(played?.ssrReactions) && played.ssrReactions.length) return played.ssrReactions;
    if (Array.isArray(story?.ssr_reactions) && story.ssr_reactions.length) return story.ssr_reactions;
    if (reactionsByStory && Array.isArray(reactionsByStory[story?.story_id])) {
      return reactionsByStory[story.story_id];
    }
    if (typeof respond === 'function') {
      const keepsakeStatus = played?.keepsakeOk === false ? 'skipped' : 'shown';
      const keepsakeNote = played?.keepsakeOk === false
        ? (played?.keepsakeDetail || 'keepsake skipped and recorded')
        : 'keepsake shown';
      return collectCheckpointReactions({
        respond: (ctx) => respond({ ...ctx, story, played }),
        keepsakeStatus,
        keepsakeNote,
      });
    }
    return [];
  }

  async function scoreCustomer({ story, played = null, outDir = '' } = {}) {
    assertSsrTargetSafe({
      origin: played?.origin,
      destination: story?.destination,
      name: story?.customer?.name,
      email: story?.customer?.email_alias,
      shareToken: played?.shareToken,
      tripId: played?.tripId,
    });
    const reactions = await resolveReactions(story, played);
    if (!reactions.length) return null;
    const ssr = scoreCustomerCheckpoints({
      storyId: story?.story_id || '',
      customerName: story?.customer?.name || '',
      reactions,
      anchorVersion,
      temperature,
      embedder: getEmbedder(),
    });
    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'ssr-receipt.json'), `${JSON.stringify({ reactions, ssr }, null, 2)}\n`);
      attachSsrToKeepsakeMetadata({
        outDir,
        keepsakePath: played?.keepsakeOk ? path.join(outDir, 'keepsake.pdf') : '',
        ssrRecord: ssr,
        keepsakeStatus: played?.keepsakeOk === false ? 'skipped' : 'shown',
        keepsakeNote: played?.keepsakeDetail || '',
      });
    }
    return ssr;
  }

  function dialogPdfStatus({ generated, pdfPath = '', ssrAggregate = null } = {}) {
    return recordDialogPdfStatus({
      generated: skipDialogPdf ? false : generated,
      pdfPath,
      skipReason: skipDialogReason || (generated ? '' : 'dialog-pdf-skipped'),
      ssrAggregate,
    });
  }

  return {
    skipDialogPdf,
    skipDialogReason,
    scoreCustomer,
    aggregateWave: aggregateSsrWave,
    scoreboardMarkdown: ssrScoreboardMarkdown,
    attachToDialogPack: attachSsrToDialogPack,
    dialogPdfStatus,
  };
}

export function createPlaywrightSuiteSsrHook({
  embedder = null,
  temperature = DEFAULT_SSR_TEMPERATURE,
  anchorVersion = ANCHOR_SET_VERSION,
} = {}) {
  let resolvedEmbedder = embedder;
  const getEmbedder = () => {
    if (!resolvedEmbedder) resolvedEmbedder = createLocalBgeEmbedder();
    return resolvedEmbedder;
  };
  const pendingByCustomer = new Map();
  const completedCards = [];

  function ensureCustomer(customerId) {
    const id = String(customerId || '').trim();
    if (!id) throw new Error('refused: customerId is required');
    if (!pendingByCustomer.has(id)) pendingByCustomer.set(id, []);
    return pendingByCustomer.get(id);
  }

  function recordCheckpoint(customerId, checkpointId, reply, extra = {}) {
    const def = getCheckpointDefinition(checkpointId);
    const list = ensureCustomer(customerId);
    list.push({
      checkpoint: def.id,
      label: def.label,
      constructs: [...def.constructs],
      prompt: def.prompt,
      reply,
      ...(def.price_usd != null ? { price_usd: def.price_usd } : {}),
      ...extra,
    });
  }

  return {
    suiteReady: true,
    requiresPr1075: false,
    onAfterSetup({ customerId, reply, target = {} }) {
      assertSsrTargetSafe(target);
      recordCheckpoint(customerId, 'after_setup', reply);
    },
    onAfterKeepsake({ customerId, reply, keepsakeStatus = 'shown', keepsakeNote = '', target = {} }) {
      assertSsrTargetSafe(target);
      recordCheckpoint(customerId, 'after_keepsake', reply, {
        keepsake_status: keepsakeStatus === 'skipped' ? 'skipped' : 'shown',
        keepsake_note: keepsakeNote || (keepsakeStatus === 'skipped' ? 'keepsake skipped and recorded' : 'keepsake shown'),
      });
    },
    onPricingCheck({ customerId, priceUsd, reply, target = {} }) {
      assertSsrTargetSafe(target);
      const id = Number(priceUsd) === 10 ? 'pricing_10' : (Number(priceUsd) === 17 ? 'pricing_17' : '');
      if (!id) throw new Error(`refused: unsupported pricing checkpoint $${priceUsd}`);
      recordCheckpoint(customerId, id, reply);
    },
    finalizeCustomer({ customerId, customerName = '', legacyDlr = null }) {
      const reactions = ensureCustomer(customerId);
      const ssr = scoreCustomerCheckpoints({
        storyId: customerId,
        customerName,
        reactions,
        anchorVersion,
        temperature,
        embedder: getEmbedder(),
      });
      const card = {
        story_id: customerId,
        primary_rating_method: 'ssr',
        ssr,
        ...(legacyDlr != null ? { dlr_score: legacyDlr } : {}),
      };
      completedCards.push(card);
      pendingByCustomer.delete(customerId);
      return card;
    },
    finalizeWave() {
      const aggregate = aggregateSsrWave(completedCards);
      return {
        cards: [...completedCards],
        aggregate,
        markdown: ssrScoreboardMarkdown(aggregate),
      };
    },
  };
}
