import fs from 'node:fs';
import { checkDialogPack, checkerVersion, formatPackReport, gitSha, loadBarTerms } from './dialog-bars.mjs';

const usage = 'usage: node scripts/check-dialog-pack.mjs <pack.json> [--json] [--terms <file>]\n';

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function main() {
  const packPath = process.argv.slice(2).find((item) => !item.startsWith('--') && process.argv[process.argv.indexOf(item) - 1] !== '--terms');
  if (!packPath) {
    process.stderr.write(usage);
    process.exit(2);
  }
  const terms = loadBarTerms(arg('--terms') || undefined);
  const pack = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  const result = checkDialogPack(pack, terms);
  const sha = gitSha();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ version: checkerVersion(terms), gitSha: sha, ...result })}\n`);
  } else {
    process.stdout.write(formatPackReport(result, sha));
  }
  if (!result.ok) process.exit(1);
}

main();
