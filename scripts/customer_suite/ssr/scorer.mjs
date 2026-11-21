import { ANCHOR_SET_VERSION, getAnchorSet } from './anchors.mjs';
import { assertFreeTextPrompt, assertFreeTextReply } from './checkpoints.mjs';
import {
  createLocalBgeEmbedder,
  PINNED_EMBEDDING_MODEL,
  PINNED_EMBEDDING_REVISION,
} from './embedder.mjs';

export const DEFAULT_SSR_TEMPERATURE = 0.5;
export const SSR_FLOAT_TOLERANCE = 1e-6;
export const SSR_CITATION = 'Maier et al. (2025), arXiv:2510.08338';

let sharedEmbedder = null;

function defaultEmbedder() {
  if (!sharedEmbedder) sharedEmbedder = createLocalBgeEmbedder();
  return sharedEmbedder;
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length !== right.length) {
    throw new Error('refused: cosineSimilarity requires non-empty vectors of equal length');
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = Number(left[index]);
    const b = Number(right[index]);
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function similaritiesToPmf(similarities, { temperature = DEFAULT_SSR_TEMPERATURE, epsilon = 0 } = {}) {
  if (!Array.isArray(similarities) || similarities.length !== 5) {
    throw new Error('refused: similaritiesToPmf requires exactly 5 Likert similarities');
  }
  const temp = Number(temperature);
  if (!Number.isFinite(temp) || temp <= 0) {
    throw new Error(`refused: invalid SSR temperature ${temperature}`);
  }
  const eps = Number(epsilon);
  if (!Number.isFinite(eps) || eps < 0) {
    throw new Error(`refused: invalid SSR epsilon ${epsilon}`);
  }
  const values = similarities.map((item) => Number(item));
  const minVal = Math.min(...values);
  const minIdx = values.indexOf(minVal);
  const shifted = values.map((value, index) => Math.max(0, value - minVal) + (index === minIdx ? eps : 0));
  const total = shifted.reduce((sum, item) => sum + item, 0);
  let pmf = total <= 0 ? [0.2, 0.2, 0.2, 0.2, 0.2] : shifted.map((item) => item / total);
  if (temp !== 1) {
    const scaled = pmf.map((prob) => (prob > 0 ? Math.pow(prob, 1 / temp) : 0));
    const scaledSum = scaled.reduce((sum, item) => sum + item, 0);
    pmf = scaledSum <= 0 ? [0.2, 0.2, 0.2, 0.2, 0.2] : scaled.map((item) => item / scaledSum);
  }
  return pmf;
}

export function averagePmfs(pmfs) {
  if (!Array.isArray(pmfs) || pmfs.length === 0) {
    throw new Error('refused: averagePmfs requires at least one PMF');
  }
  const sums = [0, 0, 0, 0, 0];
  for (const pmf of pmfs) {
    if (!Array.isArray(pmf) || pmf.length !== 5) {
      throw new Error('refused: every PMF must have 5 Likert probabilities');
    }
    for (let index = 0; index < 5; index += 1) {
      sums[index] += Number(pmf[index]);
    }
  }
  const avg = sums.map((value) => value / pmfs.length);
  const total = avg.reduce((sum, item) => sum + item, 0);
  return total <= 0 ? [0.2, 0.2, 0.2, 0.2, 0.2] : avg.map((value) => value / total);
}

export function expectedScore(pmf) {
  if (!Array.isArray(pmf) || pmf.length !== 5) {
    throw new Error('refused: expectedScore requires a 5-point PMF');
  }
  let score = 0;
  for (let index = 0; index < 5; index += 1) {
    score += (index + 1) * Number(pmf[index]);
  }
  return score;
}

export function pmfToRatingMap(pmf) {
  return {
    1: pmf[0],
    2: pmf[1],
    3: pmf[2],
    4: pmf[3],
    5: pmf[4],
  };
}

function assertEmbedderPinned(embedder) {
  if (!embedder || typeof embedder.embedTexts !== 'function') {
    throw new Error('refused: embedder must expose embedTexts(texts)');
  }
  if (embedder.modelId !== PINNED_EMBEDDING_MODEL || embedder.revision !== PINNED_EMBEDDING_REVISION) {
    throw new Error(
      `refused: embedder must use pinned ${PINNED_EMBEDDING_MODEL}@${PINNED_EMBEDDING_REVISION}, got ${embedder.modelId}@${embedder.revision}`,
    );
  }
  if (embedder.offlineOnly !== true) {
    throw new Error('refused: embedder must be offlineOnly=true');
  }
  return embedder;
}

function scoreWithLookup({ text, construct, anchorBundle, vectorByText, temperature, epsilon, embedder }) {
  const responseVec = vectorByText.get(text);
  const setPmfs = anchorBundle.sets.map((statements) => {
    const sims = statements.map((statement) => cosineSimilarity(responseVec, vectorByText.get(statement)));
    return similaritiesToPmf(sims, { temperature, epsilon });
  });
  const pmf = averagePmfs(setPmfs);
  const exp = expectedScore(pmf);
  return {
    construct,
    free_text: text,
    pmf,
    pmf_by_rating: pmfToRatingMap(pmf),
    expected_score: exp,
    set_count: anchorBundle.sets.length,
    anchor_set_version: anchorBundle.version,
    embedding_model: embedder.modelId,
    embedding_revision: embedder.revision,
    temperature,
    method: 'ssr-maier-2025',
  };
}

export function scoreFreeText({
  text,
  construct,
  anchorVersion = ANCHOR_SET_VERSION,
  temperature = DEFAULT_SSR_TEMPERATURE,
  epsilon = 0,
  embedder = defaultEmbedder(),
} = {}) {
  const checkedEmbedder = assertEmbedderPinned(embedder);
  const cleanText = assertFreeTextReply(text, construct);
  const anchorBundle = getAnchorSet(construct, anchorVersion);
  const uniqueTexts = [cleanText, ...anchorBundle.sets.flat()];
  const vectors = checkedEmbedder.embedTexts(uniqueTexts);
  const vectorByText = new Map(uniqueTexts.map((item, index) => [item, vectors[index]]));
  return scoreWithLookup({
    text: cleanText,
    construct,
    anchorBundle,
    vectorByText,
    temperature,
    epsilon,
    embedder: checkedEmbedder,
  });
}

export function scoreCustomerCheckpoints({
  storyId = '',
  customerName = '',
  reactions = [],
  anchorVersion = ANCHOR_SET_VERSION,
  temperature = DEFAULT_SSR_TEMPERATURE,
  epsilon = 0,
  embedder = defaultEmbedder(),
} = {}) {
  const checkedEmbedder = assertEmbedderPinned(embedder);
  if (!Array.isArray(reactions) || reactions.length === 0) {
    throw new Error('refused: scoreCustomerCheckpoints requires at least one reaction');
  }
  const bundles = new Map();
  const textsToEmbed = new Set();
  const normalizedReactions = reactions.map((entry) => {
    const prompt = assertFreeTextPrompt(entry.prompt);
    const reply = assertFreeTextReply(entry.reply ?? entry.free_text, entry.checkpoint);
    const constructs = Array.isArray(entry.constructs) && entry.constructs.length
      ? entry.constructs
      : (entry.construct ? [entry.construct] : []);
    if (constructs.length === 0) {
      throw new Error(`refused: reaction at ${entry.checkpoint} has no constructs`);
    }
    textsToEmbed.add(reply);
    for (const construct of constructs) {
      if (!bundles.has(construct)) {
        const bundle = getAnchorSet(construct, anchorVersion);
        bundles.set(construct, bundle);
        for (const set of bundle.sets) {
          for (const statement of set) textsToEmbed.add(statement);
        }
      }
    }
    return { ...entry, prompt, reply, constructs };
  });

  const uniqueList = [...textsToEmbed];
  const vectors = checkedEmbedder.embedTexts(uniqueList);
  const vectorByText = new Map(uniqueList.map((item, index) => [item, vectors[index]]));

  const checkpoints = [];
  const byConstruct = new Map();
  for (const reaction of normalizedReactions) {
    for (const construct of reaction.constructs) {
      const scored = scoreWithLookup({
        text: reaction.reply,
        construct,
        anchorBundle: bundles.get(construct),
        vectorByText,
        temperature,
        epsilon,
        embedder: checkedEmbedder,
      });
      const row = {
        checkpoint: reaction.checkpoint,
        label: reaction.label || reaction.checkpoint,
        construct,
        prompt: reaction.prompt,
        free_text: scored.free_text,
        pmf: scored.pmf,
        pmf_by_rating: scored.pmf_by_rating,
        expected_score: scored.expected_score,
        set_count: scored.set_count,
        anchor_set_version: scored.anchor_set_version,
        embedding_model: scored.embedding_model,
        embedding_revision: scored.embedding_revision,
        temperature: scored.temperature,
        ...(reaction.price_usd != null ? { price_usd: reaction.price_usd } : {}),
        ...(reaction.keepsake_status ? { keepsake_status: reaction.keepsake_status } : {}),
        ...(reaction.keepsake_note ? { keepsake_note: reaction.keepsake_note } : {}),
      };
      checkpoints.push(row);
      if (!byConstruct.has(construct)) byConstruct.set(construct, []);
      byConstruct.get(construct).push(row);
    }
  }

  const summaryByConstruct = {};
  for (const [construct, rows] of byConstruct.entries()) {
    const pmf = averagePmfs(rows.map((row) => row.pmf));
    summaryByConstruct[construct] = {
      n: rows.length,
      pmf,
      pmf_by_rating: pmfToRatingMap(pmf),
      mean_expected_score: rows.reduce((sum, row) => sum + row.expected_score, 0) / rows.length,
    };
  }

  return {
    story_id: storyId,
    customer_name: customerName,
    primary_rating_method: 'ssr',
    method: 'ssr-maier-2025',
    citation: SSR_CITATION,
    anchor_set_version: anchorVersion,
    embedding_model: checkedEmbedder.modelId,
    embedding_revision: checkedEmbedder.revision,
    temperature,
    float_tolerance: SSR_FLOAT_TOLERANCE,
    checkpoints,
    summary_by_construct: summaryByConstruct,
  };
}
