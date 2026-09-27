# Verification table

## Dialog

`scripts/live-transcript-dialog-pdf.mjs` wrote `dialog-gold-v7-jev-quality.pdf` from the one drive.

49 turns. Status DONE. Content checks: none. `pack_id` is `live-dialog-49`. The cover prints `build used vs tip: 128c9e1781f2f9ce4f0bf2396cf1ccdce136540e equals the tip`.

`dialog-gold-v7-jev-quality.pdf` sha256 `06ec57a2f4b2c47b7a0535779f201885d6f34bde682302f837c0a2a8b3f8da1f`.

## Screenshot journey

`scripts/screenshot-journey-pdf.mjs` overwrites `screenshot-journey.pdf`. The real-app gate runs first. The script does not redeem a coupon.

A feature file counts as captured only when a journey PDF page lists that file.
Captured feature files: 35 of 36.
jev-quality-line: PASS. The score line is in the Dialog PDF and the JSONL log. The customer app does not show it.
`screenshot-journey.pdf` sha256 `2d1c88314ce816e8f562a6c8c6099de6ec52c8a4da84115c318cbf408414bc27`.
`journey-manifest.json` sha256 `a230368834b23ac63035499b1f085a1bff613eed125c4b6dfcbc5620ef8aa22a`.
`live-transcript.jsonl` sha256 `0543d0c5058eacde7789f1324c50ec0a6a916b798acf1d23ff9a66aeed4e2aa8`.

These hashes are the final committed bytes of those files.

Search and the autonomy bar were removed from the feature map. This journey records them as N/A and does not rebuild either screen.
Trip View is removed from the app bundle.

The journey PDF is 87 pages. The manifest `pageCount` is 87 (85 screenshots plus cover and contents). Every screenshot page carries capture build `128c9e1781f2f9ce4f0bf2396cf1ccdce136540e`. Page 1 prints that sha and `build used vs tip: 128c9e1781f2f9ce4f0bf2396cf1ccdce136540e equals the tip`.

### Not captured

- Chat search: Search was removed from the feature map. This journey does not rebuild a search screen.
- Autonomy: The autonomy bar was removed from the feature map. N/A.
- Ratings and reviews (`ratings-reviews.md`): no sourced rating screenshot was captured
