import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const journeySource = readFileSync(new URL('./screenshot-journey-pdf.mjs', import.meta.url), 'utf8');
for (const kept of ['Review Terms & Privacy', 'Kimberly welcome', 'Print and PDF', 'Keepsakes config', 'Ratings and reviews', 'First onboarding prompt']) {
  if (!journeySource.includes(kept)) {
    process.stderr.write(`journey dropped ${kept}\n`);
    process.exit(1);
  }
}
for (const added of ['Things list under', 'Cars Things list', 'Budget screen', 'category-detail-${key}', "['Flights', 'flight']", "['Cars', 'car']", "['Stores', 'store']", "['The Rest', 'other']", 'tags-applied']) {
  if (!journeySource.includes(added)) {
    process.stderr.write(`journey missing added shot ${added}\n`);
    process.exit(1);
  }
}
const self = spawnSync(process.execPath, ['scripts/screenshot-journey-pdf.mjs', '--self-check'], { cwd: root, encoding: 'utf8' });
if (self.status !== 0) {
  process.stderr.write(self.stderr || self.stdout);
  process.exit(1);
}

const dir = mkdtempSync(path.join(tmpdir(), 'journey-pdf-'));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const image = path.join(dir, 'pixel.png');
writeFileSync(image, png);
const stamp = 'live 0123456789abcdef0123456789abcdef01234567 https://vacation-staging.timesyncher.com';
const buildVsTip = 'build used vs tip: 0123456789abcdef0123456789abcdef01234567 equals the tip';
const manifest = {
  title: 'Screenshot Journey',
  subtitle: 'fixture',
  deployBanner: stamp,
  buildVsTip,
  pages: [
  { id: 'purchase', chapter: 'Purchase', title: 'Purchase confirmed', file: 'post-purchase-email-eula.md', note: 'fixture Capture build aaaabbbbccccddddeeeeffffaaaabbbbccccdddd.', image, captureBuild: 'aaaabbbbccccddddeeeeffffaaaabbbbccccdddd' },
],
  gaps: [{ feature: 'Language', file: 'language.md', reason: 'no language control' }],
};
const emptyPath = path.join(dir, 'empty.json');
writeFileSync(emptyPath, JSON.stringify({ ...manifest, deployBanner: '' }));
const refused = spawnSync('python3', ['scripts/screenshot_journey_pdf.py', emptyPath, path.join(dir, 'empty.pdf')], { cwd: root, encoding: 'utf8' });
if (refused.status === 0) {
  process.stderr.write('empty journey stamp produced a pdf\n');
  process.exit(1);
}
const manifestPath = path.join(dir, 'manifest.json');
const pdfPath = path.join(dir, 'screenshot-journey.pdf');
writeFileSync(manifestPath, JSON.stringify(manifest));
const built = spawnSync('python3', ['scripts/screenshot_journey_pdf.py', manifestPath, pdfPath], { cwd: root, encoding: 'utf8' });
if (built.status !== 0) {
  process.stderr.write(built.stderr || built.stdout);
  process.exit(1);
}
const again = spawnSync('python3', ['scripts/screenshot_journey_pdf.py', manifestPath, pdfPath], { cwd: root, encoding: 'utf8' });
if (again.status !== 0) process.exit(1);
const bytes = readFileSync(pdfPath);
if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
  process.stderr.write('pdf header missing\n');
  process.exit(1);
}
const text = spawnSync('python3', ['-c', `
import sys
from pypdf import PdfReader
text = "\\n".join(page.extract_text() or "" for page in PdfReader(sys.argv[1]).pages)
need = ["Contents", "GAP. Language", "language.md", "Purchase confirmed", "Capture build", "0123456789abcdef0123456789abcdef01234567", "aaaabbbbccccddddeeeeffffaaaabbbbccccdddd", "build used vs tip:", "equals the tip"]
missing = [item for item in need if item not in text]
if missing:
    raise SystemExit("missing " + ", ".join(missing))
print("journey pdf fixture ok")
`, pdfPath], { cwd: root, encoding: 'utf8' });
if (text.status !== 0) {
  process.stderr.write(text.stderr || text.stdout);
  process.exit(1);
}
process.stdout.write(text.stdout);
rmSync(dir, { recursive: true, force: true });
