import { averagePmfs, pmfToRatingMap, SSR_CITATION } from './scorer.mjs';

function round3(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
}

function formatPmfInline(pmf) {
  return pmf.map((prob, index) => `${index + 1}:${(prob * 100).toFixed(1)}%`).join(' / ');
}

function meanOf(values) {
  if (!values.length) return null;
  return values.reduce((sum, item) => sum + item, 0) / values.length;
}

export function extractLegacyDlrComparison(cards = []) {
  const perCustomer = [];
  const allValues = [];
  for (const card of cards) {
    const storyId = String(card?.story_id || card?.customer_id || 'unknown');
    const explicit = card?.dlr_comparison?.mean
      ?? card?.dlr_score
      ?? card?.forced_likert
      ?? card?.legacy_rating;
    const turnJev = (card?.turns || [])
      .filter((turn) => turn?.role === 'app' && Number.isFinite(Number(turn?.jev_score)))
      .map((turn) => Number(turn.jev_score));
    const numeric = Number.isFinite(Number(explicit))
      ? Number(explicit)
      : (turnJev.length ? meanOf(turnJev) : null);
    if (numeric != null) {
      allValues.push(numeric);
      perCustomer.push({
        story_id: storyId,
        legacy_numeric_score: round3(numeric),
        source: Number.isFinite(Number(explicit)) ? 'dlr_forced_likert' : 'jev_score_numeric',
        role: 'comparison_only',
        is_primary: false,
      });
    }
  }
  return {
    role: 'comparison_only',
    is_primary: false,
    label: 'Legacy DLR / numeric rating (comparison only, never primary)',
    n: allValues.length,
    mean: allValues.length ? round3(meanOf(allValues)) : null,
    per_customer: perCustomer,
  };
}

export function aggregateSsrWave(cards = []) {
  const list = Array.isArray(cards) ? cards : [];
  const byPair = new Map();
  const byConstruct = new Map();
  const versions = new Set();
  const models = new Set();
  const revisions = new Set();
  const perCustomer = [];

  for (const card of list) {
    const ssr = card?.ssr;
    if (!ssr || !Array.isArray(ssr.checkpoints) || ssr.checkpoints.length === 0) continue;
    const storyId = String(card.story_id || ssr.story_id || 'unknown');
    if (ssr.anchor_set_version) versions.add(ssr.anchor_set_version);
    if (ssr.embedding_model) models.add(ssr.embedding_model);
    if (ssr.embedding_revision) revisions.add(ssr.embedding_revision);
    for (const entry of ssr.checkpoints) {
      if (!Array.isArray(entry.pmf) || entry.pmf.length !== 5) continue;
      if (entry.anchor_set_version) versions.add(entry.anchor_set_version);
      if (entry.embedding_model) models.add(entry.embedding_model);
      if (entry.embedding_revision) revisions.add(entry.embedding_revision);
      const pairKey = `${entry.checkpoint}\0${entry.construct}`;
      if (!byPair.has(pairKey)) {
        byPair.set(pairKey, {
          checkpoint: entry.checkpoint,
          label: entry.label || entry.checkpoint,
          construct: entry.construct,
          entries: [],
        });
      }
      const sample = {
        story_id: storyId,
        checkpoint: entry.checkpoint,
        construct: entry.construct,
        expected_score: entry.expected_score,
        pmf: entry.pmf,
      };
      byPair.get(pairKey).entries.push(sample);
      if (!byConstruct.has(entry.construct)) byConstruct.set(entry.construct, []);
      byConstruct.get(entry.construct).push(sample);
      perCustomer.push(sample);
    }
  }

  const byCheckpointConstruct = [...byPair.values()].map((group) => {
    const distribution = averagePmfs(group.entries.map((item) => item.pmf));
    const meanScore = meanOf(group.entries.map((item) => item.expected_score));
    return {
      checkpoint: group.checkpoint,
      label: group.label,
      construct: group.construct,
      n: group.entries.length,
      distribution,
      distribution_by_rating: pmfToRatingMap(distribution),
      mean_expected_score: meanScore,
      per_customer: group.entries.map((item) => ({
        story_id: item.story_id,
        expected_score: item.expected_score,
        pmf: item.pmf,
      })),
    };
  });

  const constructRollup = [...byConstruct.entries()].map(([construct, entries]) => {
    const distribution = averagePmfs(entries.map((item) => item.pmf));
    const meanScore = meanOf(entries.map((item) => item.expected_score));
    return {
      construct,
      n: entries.length,
      distribution,
      distribution_by_rating: pmfToRatingMap(distribution),
      mean_expected_score: meanScore,
    };
  });

  const dlrComparison = extractLegacyDlrComparison(list);

  return {
    primary_rating_method: 'ssr',
    has_ssr: byCheckpointConstruct.length > 0,
    method: 'ssr-maier-2025',
    citation: SSR_CITATION,
    anchor_set_versions: [...versions].sort(),
    embedding_models: [...models].sort(),
    embedding_revisions: [...revisions].sort(),
    by_checkpoint_construct: byCheckpointConstruct,
    by_construct: constructRollup,
    per_customer: perCustomer,
    dlr_comparison: dlrComparison,
  };
}

export function ssrScoreboardMarkdown(aggregate) {
  if (!aggregate || !aggregate.has_ssr) {
    return '## SSR Ratings (Primary)\n\nNo SSR checkpoint reactions recorded in this wave.\n';
  }
  const lines = [
    '## SSR Ratings (Primary)',
    '',
    `Method: \`${aggregate.method}\` (${aggregate.citation}) · Anchor set: \`${aggregate.anchor_set_versions.join(', ')}\` · Embedding: \`${aggregate.embedding_models.join(', ')}@${aggregate.embedding_revisions.join(', ')}\``,
    '',
    '| checkpoint | construct | n | mean expected score | aggregate distribution (1..5 PMF) |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const row of aggregate.by_checkpoint_construct) {
    lines.push(
      `| ${row.checkpoint} | ${row.construct} | ${row.n} | ${round3(row.mean_expected_score)} | ${formatPmfInline(row.distribution)} |`,
    );
  }
  lines.push(
    '',
    '### SSR Aggregate by Construct',
    '',
    '| construct | n | mean expected score | aggregate distribution (1..5 PMF) |',
    '| --- | --- | --- | --- |',
  );
  for (const row of aggregate.by_construct) {
    lines.push(
      `| ${row.construct} | ${row.n} | ${round3(row.mean_expected_score)} | ${formatPmfInline(row.distribution)} |`,
    );
  }
  if (aggregate.dlr_comparison && aggregate.dlr_comparison.n > 0) {
    lines.push(
      '',
      '### Legacy Direct-Number Ratings (Comparison Column Only — Non-Primary)',
      '',
      '| customer | legacy DLR / numeric comparison (non-primary) | source | primary? |',
      '| --- | --- | --- | --- |',
    );
    for (const row of aggregate.dlr_comparison.per_customer) {
      lines.push(`| ${row.story_id} | ${row.legacy_numeric_score} | ${row.source} | no (comparison only) |`);
    }
    lines.push(
      '',
      `Legacy DLR comparison mean (non-primary): ${aggregate.dlr_comparison.mean} (n=${aggregate.dlr_comparison.n})`,
    );
  }
  return `${lines.join('\n')}\n`;
}
