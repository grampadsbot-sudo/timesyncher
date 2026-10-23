"""Host vk-live-row-check helpers mirrored for lane autofill (issue #658)."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[3]
GATEB = ROOT / 'scripts' / 'ops' / 'gateb'
if str(GATEB) not in sys.path:
    sys.path.insert(0, str(GATEB))

from ui_paths import pr_touches_app_ui  # noqa: E402

ROW_CHECK_NA = 'N/A'
ROW_CHECK_PASS = 'PASS'
ROW_CHECK_FAIL = 'FAIL'


def row_failures_minus_base_known_gaps(
    head_failures: Iterable[str],
    base_known_row_failures: Iterable[str] | None,
) -> list[str]:
    base = {str(x).strip() for x in (base_known_row_failures or []) if str(x).strip()}
    if not base:
        return [str(x) for x in head_failures if str(x).strip()]
    return [f for f in head_failures if str(f).strip() and str(f).strip() not in base]


def host_row_check_verdict(
    changed_paths: Iterable[str],
    head_row_failures: Iterable[str] | None = None,
    base_known_row_failures: Iterable[str] | None = None,
) -> dict:
    ui = pr_touches_app_ui(changed_paths)
    if not ui:
        return {
            'verdict': ROW_CHECK_NA,
            'reason': 'PR diff vs base touches no app/UI paths; host row check skipped',
            'actionable_failures': [],
            'ui_paths': [],
        }
    actionable = row_failures_minus_base_known_gaps(head_row_failures or [], base_known_row_failures)
    if not actionable:
        return {
            'verdict': ROW_CHECK_PASS,
            'reason': 'no new row failures vs base known-gaps',
            'actionable_failures': [],
            'ui_paths': ui,
        }
    return {
        'verdict': ROW_CHECK_FAIL,
        'reason': 'new row failures vs base known-gaps',
        'actionable_failures': actionable,
        'ui_paths': ui,
    }


def lane_autofill_row_check_record(changed_paths: Iterable[str], **kwargs) -> dict:
    return host_row_check_verdict(changed_paths, **kwargs)
