# Ruling 99 Step A independent code review

Verdict: **PASS for the reviewed harness correction**, with the historical-evidence limitation below. No blocking code findings. This is a review of the correction, not a claim that all Step A delivery/scoring work or Step B has completed.

Reviewer: separate host-dispatched Codex session `/root/ruling99_independent_review`; did not write implementation. No implementation files edited, no nested runtime, external agent contact, live harness activation, or new capture performed.

## Authority and scope

Read `gbrain/skills/tsv-layout-verification/SKILL.md` checks 14 and 19 and request `bot-admin/requests/eggbot-vk-ruling99-observer-frame-rescope-20261017-0035` using gbrain. Check 14 requires logo/name vertical alignment and fail-closed measurement. Check 19 requires rendered glyph pixels within 0.5 px. Ruling 99 selects the first visible rendered name line and retires the unrelated whole-item 6 px predicate.

Reviewed worktree `/home/ubishere9995/tsv-ruling99-step-a`, branch `dr/ruling99-name-line-frame-20261017`, against baseline import commit `63d932fdc50dadec49dec5ecfbe4fe7b2a20cbaf`. HEAD was that same import commit; correction was still uncommitted when reviewed. The baseline import pins the current unversioned observer rather than treating older repository code as the active input. Only the correction diff and seven listed files below are covered; runtime node_modules and __pycache__ are not reviewed deliverables.

## Findings and limitations

- **Informational, historical evidence:** `scripts/ops/gateb/lib/row-name-frame.mjs:13` deliberately uses `first_text.box` when `line_boxes` is absent and labels the result `legacy-leaf-box`. Immutable rev3 has no Range rects. Consequently its offline re-score can establish alignment against its recorded leaf geometry, but cannot prove the first rendered line of a wrapped historical name. A multi-line legacy leaf may yield a different centre. Report these rows/receipts as historical leaf-frame evidence, not Range-first-line verification. New Step B evidence needs the reviewed collector patch applied; the fallback must not be used as proof that a new capture implemented the Range requirement.
- **Resolved review observation:** the updated `scripts/test_gate_b_row_name_frame.mjs` adds a behavioral guard: importing the actual Python checker, isolating unrelated structure checks, and supplying a whole-item box that raises on indexing, iteration or truth testing. This exercises `structure_check` and rejects the retired whole-item frame even if its local variable names or centre arithmetic change. The original spelling guards remain supplemental. No outstanding code findings.

## Assessment

- `restore_check.py:154` forwards the actual `first_text` record to the shared judge; `structure_check` removes the whole-item chip-box/6 px predicate.
- `row-name-frame.mjs:20` fails closed on a missing/invisible/empty/invalid name and on a non-finite measured glyph. It compares the raw absolute offset with `<= 0.5`, without rounding. New Range rects override the leaf box; invalid or empty Range rects do not silently fall back.
- `capture-name-line.mjs:10` walks text nodes inside `[data-ts-list-row-name]`, skips empty/hidden leaves, obtains Range client rects, and retains nonzero rects intersecting the viewport. `nameLineFrame` chooses the topmost retained rect, so normal wrapped names use line 1 rather than the whole leaf. Direct text nodes are supported. The patch contains the same helper body as the exported calibration helper.
- `restore-check-logo-centres.mjs:124` calls the shared name predicate once per measured row logo. A missing glyph already fails independently; capture coverage gaps retain their existing failure behavior.
- Independent glyph-to-chip ink checks, tab visual-mass checks, generic-logo checks, coverage handling and their tolerances remain unchanged by the correction. Retaining the independent chip-ink check is explicitly required by this request and is distinct from the retired whole-item frame.
- The new test is registered in the offline manifest and covers centred PASS, 1 px FAIL, exact 0.5 boundary, above-boundary FAIL, wrapped first line, missing name, recorded flight geometry (glyph 410 vs name 410.5), and raster integration retaining independent row-ink failure.

## Validation

Executed `node scripts/test_gate_b_row_name_frame.mjs`: PASS (exit 0), then independently reran after reviewing the strengthened Python behavioral guard: PASS (exit 0). Inspected the saved browser calibration receipt showing a three-line leaf (59 px) and first Range line (19 px), direct text support, hidden-leaf skipping, and the expected centred/1 px outcomes. That existing receipt was not independently re-captured. Did not run offline full-matrix scoring; the managing session is performing that work separately.

## Reviewed identity

Tracked correction diff SHA-256 (`git diff --binary 63d932fd -- <reviewed paths>`): `c8ce96c82197cd06fe148d73d1f1ed1ac7e64aaa54a7820240538964e40bdd4c`.

All seven reviewed files, including untracked additions, canonical sorted compact JSON path-to-SHA256 map digest: `052e43e64160192bfa138622f4f5ec2d98e9caf60ad606add0fa0392dc03c02c`.

| File | SHA-256 |
|---|---|
| scripts/offline-tests.txt | 83ad914caf0ce64941723fd1a08e80993c292206673228d64048e3ffe1107d0e |
| scripts/ops/gateb/restore-check-logo-centres.mjs | 7af4d7dbfc0c9af4145be980cc8dbe9cfcb04adbe2e5472dc2ff6cf1ddb22d29 |
| scripts/ops/gateb/restore_check.py | 40c073331171d3b976dc99ab80235bd468792e527abab607e709e2ce22d42174 |
| scripts/ops/gateb/capture-name-line.patch | 86e333014ae5c07b4087ed7674b57553e33f474d69cbf1a65d949f2149dfa07e |
| scripts/ops/gateb/lib/capture-name-line.mjs | 694473dcf786c5d8ada31a8692a6776c33b334b8578ebaaa85e3bb2a41a8601f |
| scripts/ops/gateb/lib/row-name-frame.mjs | 06028076823876a0103c2d7853c5114603856fc8bd9f041507b2951d63c147ae |
| scripts/test_gate_b_row_name_frame.mjs | 3a7b55ed1d39a62ba68d0cd71e83c15ef4997fb21056da4f01de8146acc1ccd6 |
