"""Gate B scripts/tests-only exemption mirror (Ubuntu tsv_dispatch guard c, issue #507)."""

from __future__ import annotations

from typing import Iterable

FORBIDDEN_PREFIXES: tuple[str, ...] = (
    'src/',
    'apps/',
    'fixtures/',
    'data/',
    'nyc-final-reference/',
    'vercel.json',
    '.github/workflows/',
    'package.json',
    'package-lock.json',
)

ALLOWED_PREFIXES: tuple[str, ...] = ('scripts/', 'tests/')


def changed_paths_eligible_for_exemption(paths: Iterable[str]) -> bool:
    """True when every changed path is under scripts/ or tests/ with no forbidden prefix."""
    seen = False
    for raw in paths:
        path = raw.strip().lstrip('./')
        if not path:
            continue
        seen = True
        if not any(path.startswith(prefix) for prefix in ALLOWED_PREFIXES):
            return False
        if any(path.startswith(prefix) for prefix in FORBIDDEN_PREFIXES):
            return False
        if path.startswith('scripts/') and '/.github/' in path:
            return False
    return seen


def data_contract_lines_equal(base_lines: Iterable[str], head_lines: Iterable[str]) -> bool:
    return sorted(line.strip() for line in base_lines if line.strip()) == sorted(
        line.strip() for line in head_lines if line.strip()
    )


def gateb_exempt_commit_description(head_sha: str, base_sha: str) -> str:
    head = head_sha.strip()[:7]
    base = base_sha.strip()[:7]
    return f'Gate B exempt on {head}: scripts/tests only; data fault identical to base {base}; CI green'
