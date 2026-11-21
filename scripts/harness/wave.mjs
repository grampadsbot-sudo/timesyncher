import fs from 'node:fs';
import path from 'node:path';
import { assignReplyBackends, clampConcurrency } from './backends.mjs';
import { blindExport, compareBackends, comparisonMarkdown, storyMarkdown } from './comparison.mjs';
import { runCustomer } from './customer.mjs';
import { aggregateSsrWave, ssrScoreboardMarkdown } from '../customer_suite/ssr/aggregate.mjs';

export async function runWave(stories, options) {
  const assigned = assignReplyBackends(stories);
  const run = options.run || runCustomer;
  const limit = Math.min(clampConcurrency(options.concurrency), assigned.length || 1);
  const cards = new Array(assigned.length);
  let index = 0;
  let stop = false;
  const slots = Array.from({ length: limit }, () => 0);
  await Promise.all(slots.map(async () => {
    while (!stop) {
      const current = index;
      index += 1;
      if (current >= assigned.length) return;
      const story = assigned[current];
      const outDir = path.join(options.outRoot, options.runId, story.story_id);
      const card = await run(story, { ...options, outDir });
      cards[current] = card;
      if (card.wave_stop || (card.verdict === 'FAIL' && !options.continueOnFail)) stop = true;
    }
  }));
  const ordered = cards.filter(Boolean);
  const comparison = compareBackends(ordered);
  const ssr = aggregateSsrWave(ordered);
  const blind = blindExport(ordered);
  const dir = path.join(options.outRoot, options.runId);
  fs.mkdirSync(dir, { recursive: true });
  const scoreboardPayload = {
    run_id: options.runId,
    primary_rating_method: ssr.has_ssr ? 'ssr' : 'legacy_comparison_only',
    ssr,
    stories: ordered,
    comparison,
  };
  fs.writeFileSync(path.join(dir, 'scoreboard.json'), `${JSON.stringify(scoreboardPayload, null, 2)}\n`);
  const ssrSection = ssr.has_ssr ? `${ssrScoreboardMarkdown(ssr)}\n` : '';
  fs.writeFileSync(path.join(dir, 'scoreboard.md'), `# Wave ${options.runId}\n\n${ssrSection}${comparisonMarkdown(comparison)}\n\n${storyMarkdown(ordered)}\n`);
  fs.writeFileSync(path.join(dir, 'blind-sample.json'), `${JSON.stringify(blind.sample, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'blind-key.json'), `${JSON.stringify(blind.key, null, 2)}\n`);
  return { cards: ordered, comparison, ssr, blind, dir };
}
