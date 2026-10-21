# VK issue #595 receipt (PR #599)

**Start sha:** `446e19137ebe9c6ee0dab651dca078f2cd35f13f`  
**PR:** https://github.com/grampadsbot-sudo/timesyncher/pull/599

## GBrain handoff

`gbrain get bot-admin/lanes/vk-pr-handoff/pr-599` → **page_not_found** (2026-10-21).

## Problem

Gate B reported `daybyday-1280.png` at 0.03% vs baseline (run `20261021-230524`). CCAB narrative merge was writing `longDetails` / `summary` onto timeline-selected non-hotel overrides, so Day-by-Day `rowSummary` subtitles appeared where the baseline had none.

## Fix

Scope `mergeStoredCcabNarrativeIntoOverride` so override list-row narrative (longDetails, price, logo, full sourceRecord) applies to hotels and list-only rows only; timeline non-hotel rows upgrade `place.description` for VK contract without override fields that feed the day timeline.

## Checks (local)

Run on tip before push; record exit codes in PR description.
