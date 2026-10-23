"""Rowfix brief guard: never steer coders to app edits on ops-only scope (issue #658)."""

from __future__ import annotations

import re
from typing import Iterable

from vk_live_row_check import ROW_CHECK_NA  # noqa: E402
from vk_live_row_check import host_row_check_verdict  # noqa: E402

APP_EDIT_MARKERS = (
    'apps/vacation-client/',
    'ListRow.tsx',
    'trek-live-product-patches',
    'public/assets/index-',
    'translateY(',
    '<strong>',
    'data-ts-list-row-name',
)

SCOPE_EXCLUDES_APP_RE = re.compile(
    r'(?:no ui|no app/|source scripts/ops/dispatch|scripts/ops/dispatch;\s*no ui)',
    re.I,
)


def issue_scope_excludes_app_files(issue_body: str | None) -> bool:
    return bool(SCOPE_EXCLUDES_APP_RE.search(issue_body or ''))


def rowfix_brief_forbids_app_edits(changed_paths: Iterable[str], issue_body: str | None) -> bool:
    if issue_scope_excludes_app_files(issue_body):
        return True
    return host_row_check_verdict(changed_paths)['verdict'] == ROW_CHECK_NA


def filter_rowfix_brief(brief: str, changed_paths: Iterable[str], issue_body: str | None) -> str:
    if not rowfix_brief_forbids_app_edits(changed_paths, issue_body):
        return brief
    kept = []
    for line in (brief or '').splitlines():
        if any(marker in line for marker in APP_EDIT_MARKERS):
            continue
        kept.append(line)
    header = (
        'Host row check: N/A (ops-only PR diff; do not edit app/UI files to satisfy row-logo scoring).'
    )
    body = '\n'.join(kept).strip()
    return f'{header}\n\n{body}'.strip() if body else header
