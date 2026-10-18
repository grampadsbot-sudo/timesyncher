"""Canonical pregate_one helpers mirrored in-repo for Ubuntu tsv_dispatch (issue #497)."""

from __future__ import annotations

from typing import Any, Callable, Mapping

SKIPPED_BACKEND_ONLY = 'SKIPPED_BACKEND_ONLY'


def compare_result_out(compare: Mapping[str, Any] | None) -> dict[str, Any]:
    if not compare:
        return {}
    out = compare.get('out')
    if isinstance(out, dict):
        return out
    return {}


def compare_log_fields(compare: Mapping[str, Any] | None) -> dict[str, Any]:
    compare = compare if isinstance(compare, dict) else {}
    out = compare_result_out(compare)
    screens = compare.get('screens')
    if screens is None:
        screens = out.get('screens')
    compared = compare.get('compared')
    if compared is None:
        compared = out.get('compared')
    return {
        'screens': screens,
        'compared': compared,
        'verdict': compare.get('verdict'),
        'skip_reason': compare.get('skip_reason') or out.get('skip_reason'),
    }


def gateb_commit_state(verdict: str | None) -> str:
    v = (verdict or '').strip()
    if v == SKIPPED_BACKEND_ONLY:
        return 'success'
    if v.upper() == 'PASS':
        return 'success'
    if v.upper().startswith('SKIPPED'):
        return 'success'
    if v.upper() in ('FAIL', 'DATA_FAULT'):
        return 'failure'
    return 'failure'


def log_compare_result(
    compare: Mapping[str, Any] | None,
    log: Callable[[str], None],
) -> None:
    fields = compare_log_fields(compare)
    log(
        'gateb compare '
        f"screens={fields['screens']!r} compared={fields['compared']!r} "
        f"verdict={fields['verdict']!r} skip_reason={fields['skip_reason']!r}"
    )


def apply_gateb_commit_status(
    verdict: str | None,
    *,
    set_status: Callable[..., Any],
    context: str = 'gateb',
    description: str = '',
    **status_kwargs: Any,
) -> str:
    state = gateb_commit_state(verdict)
    set_status(context=context, state=state, description=description, **status_kwargs)
    return state


def pregate_one_finalize_verdict(
    verdict: str | None,
    compare: Mapping[str, Any] | None,
    *,
    log: Callable[[str], None],
    set_status: Callable[..., Any],
    description: str = '',
    **status_kwargs: Any,
) -> str:
    log_compare_result(compare, log)
    return apply_gateb_commit_status(
        verdict,
        set_status=set_status,
        description=description,
        **status_kwargs,
    )
