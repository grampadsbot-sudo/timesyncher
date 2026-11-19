import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { orderCustomerPages } from './onboarding-screens.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

function extractPdfText(file) {
  if (!file || !fs.existsSync(file)) return '';
  const result = spawnSync('python3', ['-c', `
from pypdf import PdfReader
import sys
print("\\n".join((page.extract_text() or "") for page in PdfReader(sys.argv[1]).pages))
`, file], { encoding: 'utf8' });
  if (result.status !== 0) return '';
  return result.stdout || '';
}

function writeCustomerPdf(pages, outPath) {
  if (!pages.length) return { ok: false, pdfText: '' };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const manifest = `${outPath}.pages.json`;
  fs.writeFileSync(manifest, JSON.stringify(pages));
  const script = path.join(root, 'scripts/harness/onboarding_customer_pdf.py');
  const result = spawnSync('python3', [script, manifest, outPath], { encoding: 'utf8' });
  fs.rmSync(manifest, { force: true });
  if (result.status !== 0 || !fs.existsSync(outPath)) return { ok: false, pdfText: '' };
  return { ok: true, pdfText: extractPdfText(outPath) };
}

export function buildCustomerPdf({ shots, laterFiles = [], outPath }) {
  const pages = orderCustomerPages(shots, laterFiles);
  const written = writeCustomerPdf(pages, outPath);
  return { pages, pdfText: written.pdfText || '' };
}
