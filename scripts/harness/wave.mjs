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
  let stopped = '';
  const slots = Array.from({ length: limit }, () => 0);
  await Promise.all(slots.map(async () => {
    while (!stop) {
      const current = index;
      index += 1;
      if (current >= assigned.length) return;
      const story = assigned[current];
      if (options.beforeCustomer) {
        const gate = await options.beforeCustomer(story, cards.filter(Boolean));
        if (gate && gate.ok === false) {
          stop = true;
          stopped = `${gate.reason || 'stopped'} before ${story.story_id}: ${gate.detail || ''}`.trim();
          return;
        }
      }
      const outDir = path.join(options.outRoot, options.runId, story.story_id);
      const card = await run(story, { ...options, outDir });
      cards[current] = card;
      if (options.onCard) await options.onCard(card, story);
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
    ...(stopped ? { stopped } : {}),
  };
  fs.writeFileSync(path.join(dir, 'scoreboard.json'), `${JSON.stringify(scoreboardPayload, null, 2)}\n`);
  const ssrSection = ssr.has_ssr ? `${ssrScoreboardMarkdown(ssr)}\n` : '';
  const couponRows = ordered.filter((card) => card.coupon_redemption);
  const couponSection = couponRows.length
    ? `\n## Coupon redemptions\n\n| story | coupon | mode | status | reuse |\n| --- | --- | --- | --- | --- |\n${couponRows.map((card) => {
      const row = card.coupon_redemption;
      const reuse = row.reuse ? (row.reuse.sent === false ? 'planned (not sent)' : row.reuse.rejected ? 'rejected by app' : 'ACCEPTED by app') : '';
      return `| ${card.story_id} | ${row.code_hint || ''} | ${row.mode || ''} | ${row.status || ''} | ${reuse} |`;
    }).join('\n')}\n`
    : '';
  const stoppedLine = stopped ? `\nStopped: ${stopped}\n` : '';
  fs.writeFileSync(path.join(dir, 'scoreboard.md'), `# Wave ${options.runId}\n${stoppedLine}\n${ssrSection}${comparisonMarkdown(comparison)}\n\n${storyMarkdown(ordered)}\n${couponSection}`);
  fs.writeFileSync(path.join(dir, 'blind-sample.json'), `${JSON.stringify(blind.sample, null, 2)}\n`);
  fs.writeFileSync(path.join(dir, 'blind-key.json'), `${JSON.stringify(blind.key, null, 2)}\n`);
  return { cards: ordered, comparison, ssr, blind, dir, stopped, planned: assigned.length };
}
