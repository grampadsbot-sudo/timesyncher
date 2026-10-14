"""TSV guard rules mirrored in-repo (harness/data-fault pause + verified resolution)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    from .tsv_dispatch import VkFixtureIntegrity, verify_vk_fixture_integrity
except ImportError:  # unittest imports this directory on sys.path
    from tsv_dispatch import VkFixtureIntegrity, verify_vk_fixture_integrity

DATA_FAULT_VERDICT = 'DATA_FAULT'


@dataclass(frozen=True)
class GateVerdict:
    pr: int
    head_sha: str
    verdict: str
    reason: str
    at: str


@dataclass(frozen=True)
class DataFaultResolution:
    pr: int
    repo_head_sha: str
    snapshot_sha256: str
    binding_sha256: str
    recorded_at: str
    note: str = ''


def _parse_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding='utf-8').splitlines():
        text = line.strip()
        if not text:
            continue
        rows.append(json.loads(text))
    return rows


def load_gate_verdicts(path: Path) -> list[GateVerdict]:
    out: list[GateVerdict] = []
    for row in _parse_jsonl(path):
        try:
            pr = int(row['pr'])
        except (KeyError, TypeError, ValueError):
            continue
        out.append(
            GateVerdict(
                pr=pr,
                head_sha=str(row.get('head') or row.get('head_sha') or ''),
                verdict=str(row.get('verdict') or ''),
                reason=str(row.get('reason') or row.get('detail') or ''),
                at=str(row.get('at') or row.get('ts') or ''),
            )
        )
    return out


def load_data_fault_resolutions(path: Path) -> list[DataFaultResolution]:
    out: list[DataFaultResolution] = []
    for row in _parse_jsonl(path):
        if row.get('kind') != 'data_fault_resolution':
            continue
        try:
            pr = int(row['pr'])
        except (KeyError, TypeError, ValueError):
            continue
        out.append(
            DataFaultResolution(
                pr=pr,
                repo_head_sha=str(row.get('repo_head_sha') or ''),
                snapshot_sha256=str(row.get('snapshot_sha256') or ''),
                binding_sha256=str(row.get('binding_sha256') or ''),
                recorded_at=str(row.get('recorded_at') or ''),
                note=str(row.get('note') or ''),
            )
        )
    return out


def last_gate_verdict_for_pr(pr: int, verdicts: Iterable[GateVerdict]) -> GateVerdict | None:
    last: GateVerdict | None = None
    for entry in verdicts:
        if entry.pr != pr:
            continue
        last = entry
    return last


def resolution_covers_integrity(
    resolution: DataFaultResolution,
    integrity: VkFixtureIntegrity,
) -> bool:
    if not integrity.ok:
        return False
    return (
        resolution.repo_head_sha == integrity.repo_head_sha
        and resolution.snapshot_sha256 == integrity.snapshot_sha256
        and resolution.binding_sha256 == integrity.binding_sha256
    )


def latest_matching_resolution(
    pr: int,
    resolutions: Iterable[DataFaultResolution],
    integrity: VkFixtureIntegrity,
) -> DataFaultResolution | None:
    match: DataFaultResolution | None = None
    for row in resolutions:
        if row.pr != pr:
            continue
        if resolution_covers_integrity(row, integrity):
            match = row
    return match


def harness_fault_pending(
    pr: int,
    verdicts: Iterable[GateVerdict],
    resolutions: Iterable[DataFaultResolution],
    integrity: VkFixtureIntegrity,
) -> bool:
    """True when the last Gate B entry is DATA_FAULT and no verified resolution covers current data."""
    last = last_gate_verdict_for_pr(pr, verdicts)
    if not last or last.verdict != DATA_FAULT_VERDICT:
        return False
    if latest_matching_resolution(pr, resolutions, integrity):
        return False
    return True


def blocked_reason(
    pr: int,
    *,
    fixit: bool = False,
    verdicts: Iterable[GateVerdict],
    resolutions: Iterable[DataFaultResolution],
    integrity: VkFixtureIntegrity,
) -> str | None:
    if fixit and harness_fault_pending(pr, verdicts, resolutions, integrity):
        return 'harness/data fault: PR paused for the harness fix, no coder round'
    return None


def append_data_fault_resolution(
    path: Path,
    *,
    pr: int,
    integrity: VkFixtureIntegrity,
    note: str = '',
) -> DataFaultResolution:
    if not integrity.ok:
        raise ValueError('refused: integrity proof failed; cannot record data-fault resolution')
    row = DataFaultResolution(
        pr=pr,
        repo_head_sha=integrity.repo_head_sha,
        snapshot_sha256=integrity.snapshot_sha256,
        binding_sha256=integrity.binding_sha256,
        recorded_at=datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        note=note,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'kind': 'data_fault_resolution',
        'pr': row.pr,
        'repo_head_sha': row.repo_head_sha,
        'snapshot_sha256': row.snapshot_sha256,
        'binding_sha256': row.binding_sha256,
        'recorded_at': row.recorded_at,
        'note': row.note,
    }
    with path.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(payload, sort_keys=True) + '\n')
    return row


def record_verified_data_fault_resolution(
    pr: int,
    resolutions_path: Path,
    *,
    repo_root: Path | None = None,
    note: str = '',
) -> DataFaultResolution:
    integrity = verify_vk_fixture_integrity(repo_root)
    return append_data_fault_resolution(
        resolutions_path,
        pr=pr,
        integrity=integrity,
        note=note,
    )
