# Host row-gate source repair for #658

Source base d510520afc1fc504a01913d5e45ec6beec1ea191 on migrate/trek-source. No product source changed.

Actual installed lane wrapper unconditionally sends every vkfill job through UI row checks. Backend PR569 repeatedly fails those base rows and the generated brief causes unrelated UI edits. Reject earlier source helper: missing git evidence must refuse; never infer backend-only from an empty failed command.

New helper uses the installed canonical strict UI regex and render_files classifier. It reads the full merge-base diff plus working-tree diff and untracked files with no rename collapsing. Missing base, failed Git/classifier reads and invalid paths fail closed. Backend row capture is recorded NOT_RUN_BACKEND_ONLY, never PASS. UI row-check code is unchanged. Source patch only branches before that existing block.

Host executed seven independent checks: committed backend, untracked UI, committed UI, UI renamed away, missing base, actual clean and rejected dirty PR569 worktrees, and exact candidate shell block against actual clean PR569 with capture sentinel. Backend printed ROWCHECK-NOT-RUN and neither capture nor rowfix ran. bash -n passed. Proof /home/ubishere9995/tsv-work/manager-pass-20261023-0700/658-proof.json. Full worker publication and runtime install still require host acceptance. Existing bad UI edits preserved unpushed; PR569 remains held.

Owner GPT/Codex. Source bot-admin/receipts/gpt-manager-pass-20261023-0700. No merge, deploy, threshold/mask/baseline or product capture change.
