import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { publicReviewFieldKeys, writeDossierReviews } from '../src/vacation/thing-dossier-fields.mjs';
import { resolveDossierReviewRatings } from '../src/vacation/dossier-review-ratings.mjs';
import { placeSupportsDossierReviews } from '../src/vacation/dossier-brave-queries.mjs';

export function rederiveReviewRatings(input) {
  const output = structuredClone(input);
  const things = [];
  const visit = (value, key = '') => {
    if (!value || typeof value !== 'object') return;
    if (value.evidenceDossier && placeSupportsDossierReviews(value)) {
      const dossier = resolveDossierReviewRatings(value.evidenceDossier);
      const candidate = writeDossierReviews({ ...value }, dossier);
      let filled = 0;
      let dropped = 0;
      for (let n = 1; n <= 4; n += 1) {
        const field = `review${n}`;
        if (!value[field]) continue;
        if (candidate[field] === value[field] && candidate[`${field}Rating`]) {
          if (Number(value[`${field}Rating`]) !== Number(candidate[`${field}Rating`])) {
            value[`${field}Rating`] = candidate[`${field}Rating`];
            filled += 1;
          }
        } else {
          for (const name of publicReviewFieldKeys().filter((name) => name.startsWith(field))) value[name] = null;
          dropped += 1;
        }
      }
      if (filled || dropped) value.evidenceDossier = dossier;
      if (dropped) {
        value.missingFields = [...new Set([...(value.missingFields || []), 'reviews'])];
        value.dataShortcomings = [...(value.dataShortcomings || []).filter((row) => row.field !== 'reviews'),
          { field: 'reviews', reason: 'review ratings could not be grounded in saved evidence' }];
      }
      things.push({ id: value.id ?? key, name: value.title || value.name || dossier.thing,
        outcome: dropped ? 'dropped' : filled ? 'filled' : 'unchanged', filled, dropped });
      return;
    }
    for (const [name, child] of Object.entries(value)) visit(child, name);
  };
  visit(output);
  const summary = { things: things.length, filled: 0, dropped: 0, unchanged: 0, ratingsFilled: 0, reviewsDropped: 0 };
  for (const row of things) {
    summary[row.outcome] += 1;
    summary.ratingsFilled += row.filled;
    summary.reviewsDropped += row.dropped;
  }
  return { output, summary, things };
}

function main() {
  const args = process.argv.slice(2);
  const input = args[0];
  const outputAt = args.indexOf('--output');
  const output = outputAt >= 0 ? args[outputAt + 1] : '';
  if (!input || args.some((arg, index) => index > 0 && !['--dry-run', '--output'].includes(arg) && index !== outputAt + 1)
    || outputAt >= 0 && !output || args.includes('--dry-run') && output) {
    throw new Error('Usage: node scripts/rederive_review_ratings.mjs INPUT.json [--dry-run | --output OUTPUT.json]');
  }
  if (output && resolve(input) === resolve(output)) throw new Error('Output must differ from the saved input');
  const result = rederiveReviewRatings(JSON.parse(readFileSync(input, 'utf8')));
  if (output) writeFileSync(output, `${JSON.stringify(result.output, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ input, mode: output ? 'output' : 'dry-run',
    summary: result.summary, things: result.things }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
