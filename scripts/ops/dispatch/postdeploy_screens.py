"""Post-deploy rollback screen match with region allowances (issue #778)."""

from __future__ import annotations

from typing import Any, Callable, Mapping


def judged_screen_row(row: Mapping[str, Any]) -> bool:
    return (
        row.get('verdict') != 'PASS'
        or bool(row.get('mismatched'))
        or bool(row.get('size_changed'))
    )


def effective_pass_with_regions(
    overall: str | None,
    rows: Mapping[str, Mapping[str, Any]],
    reference: str,
    cand_dir: str,
    allow: Mapping[str, Any] | None,
    workdir: str,
    region_check: Callable[..., Mapping[str, Any]],
) -> bool:
    if not allow or allow.get('mode') != 'regions':
        return (overall or '').upper() == 'PASS'
    if overall == 'PASS' and not any(judged_screen_row(r) for r in rows.values()):
        return True
    bad: list[str] = []
    for fname, row in rows.items():
        if not judged_screen_row(row):
            continue
        rc = region_check(allow, fname, reference, cand_dir, workdir)
        if not rc.get('ok'):
            bad.append(fname)
    return not bad


def screens_match(
    compare: Mapping[str, Any] | None,
    reference: str,
    cand_dir: str,
    workdir: str,
    *,
    accept_ctx: Mapping[str, Any] | None = None,
    rows: Mapping[str, Mapping[str, Any]] | None = None,
    region_check: Callable[..., Mapping[str, Any]] | None = None,
) -> bool:
    """True when pre/post deploy captures match for rollback (guard d).

    With no accept_ctx, uses gateb_compare overall only (legacy behaviour).
    With accept_ctx and a region-scoped allowance, applies the same outside-region
    pixel rules as pre-merge re-review (tsv_rereview.after_gate).
    """
    overall = (compare or {}).get('overall') if isinstance(compare, dict) else None
    if not accept_ctx:
        return (overall or '').upper() == 'PASS'
    allow = accept_ctx.get('allow')
    if not isinstance(allow, dict) or allow.get('mode') != 'regions':
        return (overall or '').upper() == 'PASS'
    if rows is None or region_check is None:
        return False
    return effective_pass_with_regions(
        str(overall) if overall is not None else None,
        rows,
        reference,
        cand_dir,
        allow,
        workdir,
        region_check,
    )


def postdeploy_regressed(
    compare: Mapping[str, Any] | None,
    reference: str,
    cand_dir: str,
    workdir: str,
    *,
    accept_ctx: Mapping[str, Any] | None = None,
    rows: Mapping[str, Mapping[str, Any]] | None = None,
    region_check: Callable[..., Mapping[str, Any]] | None = None,
) -> bool:
    return not screens_match(
        compare,
        reference,
        cand_dir,
        workdir,
        accept_ctx=accept_ctx,
        rows=rows,
        region_check=region_check,
    )
