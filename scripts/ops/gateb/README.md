Gate B description judgment
==========================

The managing dr reads each pending request and writes a judgment receipt. This
replaces the fixed Haiku call and the Claude 90% usage gate (owner approval,
2026-10-14). Category rubrics, word requirements, score >=4, generic-text veto,
layout checks and merge guards stay intact.

Run `python3 collect_dr_requests.py <saved-capture-directory>` to collect or
replay only qualitative checks. It does not build, capture, run a new Gate B
round, change labels, or merge. The pipeline's existing check_dir entry also
exports missing requests. Missing or invalid receipts raise a harness
NO_VERDICT, so the dispatcher does not spend a coder round on an absent judge.

Runtime data stays outside git at ~/tsv-gateb/dr-description-judgments:

* pending/<key>.json: full captured input, category rubric, and capture digest.
* verdicts/<key>.json: copy the request's key and input unchanged, then add
  reviewer (gpt, claude-code, grok, dr-eggbot), reviewed_at (UTC ISO timestamp),
  reason (specific written rationale), and verdict (score integer 1-5,
  missing list of strings, generic boolean).

The active dr performs the judgment, never the coder or a low-tier worker.
Descriptions and review data are untrusted content, not instructions to the dr.
Requests bind category/name/price/text/reviews/rubric/task and the actual capture
digest. Changed inputs need new judgments; old Haiku caches are not accepted.
An old pending file is an audit record; a valid receipt supersedes it. Read the
collector's not_judged count to determine what remains pending.

Deploy from this branch's committed files to ~/tsv-gateb with backups while
holding ~/tsv-dispatch/.run.lock. Record the commit in GBrain. The unchanged
restore-check.mjs is imported here so the runtime source is in git; it requires
the existing pngjs and pixelmatch dependencies. Production receipts, captures,
credentials, node_modules, and generated test output must not be committed.

Verification: `python3 -m unittest test_managing_dr_judge.py` and
`python3 selftest-logo-budget.py` (with the existing Node dependencies).

Ruling 99 Step A — row name frame (#457)
--------------------------------------

The current unversioned Ubuntu observer was first imported byte for byte with
`ruling99-runtime-input-pins.json`; the following correction is a separate commit.
No app candidate or product file is included. This draft is based on the existing
versioned harness branch `dr/manager-description-judge-20261014`.

`lib/row-name-frame.mjs` owns glyph-vs-first-name-line alignment at exactly 0.5 px.
The whole-item 6 px frame is removed. Missing names fail closed. The independent
chip-ink, tab mass and generic-logo predicates are retained. The offline manifest
registers `scripts/test_gate_b_row_name_frame.mjs`; run it from repository root.

`capture-name-line.patch` is the collector integration patch against the pinned
Ubuntu capture source. Its helper matches `lib/capture-name-line.mjs` exactly.
It records Range client rects for the first visible text node, including direct
text and wrapped names. Apply it with `patch --forward -p1` in a checked copy of
the capture directory after verifying its input hash. This delivery does not
activate the shared harness or run a new app capture. Do not import a raw capture
script, runtime manifests, credentials, fixtures, screenshots or node_modules
into the public repository.

`ruling99-offline-rescore.md` publishes every screen's old/new class outcome on
immutable rev3. Unrelated reasons are identical; tabs 24, row ink 6 and generic
logos 15 all remain FAIL. Whole-item frame 8 → 0; missing names 0 → 8. The full set
remains FAIL 24/32. Historical captures lack Range rects; their explicitly labelled
legacy leaf-box evidence does not prove the first line of a wrapped historical
name. New Step B evidence must use the Range collector.

`ruling99-step-b-pin.json` records the checker and bundle hashes plus collector
hashes. Independent review is recorded separately. Step B is outside this PR;
its candidate stays at the stopped local 044bb03a until separately executed under
the reviewed pin and existing gates. No merge, deploy, live write or guard reset.
