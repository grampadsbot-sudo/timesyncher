# Held publication guard host acceptance

Owner GPT/Codex, 2026-10-23. Refs #662.

The live marker is `ref result-tip old-remote-head`. Retirement must compare the full result tip, never the prior remote head or a shared seven-character prefix. Renamed void files are read directly. Remote transport uses an explicit repository URL so cron does not depend on a Git working directory. Low-quota passes invoke the existing guarded publisher for due held results before skipping launches.

Host verification: 11 regression cases against fresh temporary copies of the actual live preimages, zero-fuzz patch, compile, and four existing stale-publication regressions pass. Every existing function AST except main is unchanged. Tests use BATCH662_RUNTIME_ROOT for actual runtime preimages; they do not invent a dispatcher fixture. Run with PYTHONPATH pointing at the host dispatcher for its unchanged dependencies.

Installed under all three cron/autofill/stall locks, exact preimage hashes verified and timestamped backups retained. Lane preimage a531dc6418924137f157f2634684b7872dbd5ee7690a4fa16d533ac7d8e608cf -> 595f72c619b81764bbc13afbe43abd5beef918faaf5e0c2e02620ddde617bcf9. Alarm preimage b0dc9828bacec7a34772fa8922bbbd6f47f38eeed305db3663cc2d8e6d7cda8f -> 838ff94bd4f0be7b62e2a7bf16f4ddcbf7c76188d31a60e3722b3a1df3924b37.

A remote tip that advanced beyond the result is conservatively unverified by ls-remote alone; it never clears a marker without publication proof. Old void markers may be archived only after actual ancestry proof. No original round, hold, cap, merge or deploy guard is changed. Source retention is a draft PR on migrate/trek-source; no manual merge or deploy. Evidence: bot-admin/receipts/gpt-manager-pass-20261023-0838.
