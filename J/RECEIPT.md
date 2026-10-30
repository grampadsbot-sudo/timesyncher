# #741 Shared report PDF Unicode — lane receipt (HOST PUBLICATION ONLY)

**Start HEAD:** `2a26b5acbe8ecdcc2fd56814cc4e53eb75bc58a5`

**Outcome:** `source-ready` — embed DejaVu Sans (CIDFontType2 + Identity-H + ToUnicode); non-ASCII no longer folded to `?`; new unicode extract test registered.

## Root cause + fix

`foldPdfLine` stripped non-ASCII and Type1 Helvetica could not render Unicode. Fix: ship `src/vacation/pdf-fonts/DejaVuSans.ttf`, parse TTF cmap/hmtx in-process, emit Type0/CIDFontType2 PDF text as `<GID…> Tj` with ToUnicode for extraction.

| File | Change |
| --- | --- |
| `src/vacation/minimal-text-pdf.mjs` | Unicode font embed; `extractMinimalPdfText()` for tests |
| `src/vacation/pdf-fonts/DejaVuSans.ttf` | Bundled open-font (system DejaVu copy) |
| `scripts/test_shared_pdf_unicode.mjs` | Asserts `→`, `é`, `ʻ` round-trip via ToUnicode |
| `scripts/test_shared_trip_report_pdf.mjs` | PDF body assertions via `extractMinimalPdfText` (hex text no longer ASCII-visible) |
| `scripts/offline-tests.txt` | Register `test_shared_pdf_unicode.mjs` |

## Tests run (workspace @ 2a26b5ac)

| Command | Result |
| --- | --- |
| `node scripts/test_shared_pdf_unicode.mjs` | PASS |
| `node scripts/test_shared_trip_report_pdf.mjs` | PASS |
| `node scripts/test_offline_manifest.mjs` | PASS (379 offline) |
| `node scripts/check-no-comments.mjs` | BLOCKED — missing `apps/vacation-client/node_modules/typescript` (host install) |
| `BASE=2a26b5ac node scripts/check-code-ratchet.mjs` | REPORT only; BASELINE-GROWTH FAIL — `origin/2a26b5ac…` ref missing locally |

**Host:** commit + push once; PR into `vk` with `Closes #741`; run full pre-push gates on Ubuntu with origin ref fetched; no Gate B on this DATA/UI PDF text change per #65 unless UI screens touched.

## Uncommitted files

- `src/vacation/minimal-text-pdf.mjs`
- `src/vacation/pdf-fonts/DejaVuSans.ttf` (new)
- `scripts/test_shared_pdf_unicode.mjs` (new)
- `scripts/test_shared_trip_report_pdf.mjs`
- `scripts/offline-tests.txt`
- `J/RECEIPT.md`

Local `npm install` may have updated `node_modules/`; do not commit lockfile churn from lane install.
