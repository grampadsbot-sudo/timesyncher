"""TSV dispatch helpers mirrored in-repo for harness verification (issue #398)."""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class VkFixtureIntegrity:
    ok: bool
    repo_head_sha: str
    snapshot_sha256: str
    binding_sha256: str
    contract_errors: tuple[str, ...]


def repo_root(start: Path | None = None) -> Path:
    here = (start or Path(__file__)).resolve()
    for parent in [here, *here.parents]:
        if (parent / 'package.json').is_file() and (parent / 'scripts' / 'fixtures').is_dir():
            return parent
    raise FileNotFoundError('timesyncher repo root not found from tsv_dispatch.py')


def verify_vk_fixture_integrity(root: Path | None = None) -> VkFixtureIntegrity:
    """Run the repo VK contract validators and pin snapshot + binding digests."""
    base = repo_root(root)
    script = base / 'scripts' / 'ops' / 'dispatch' / 'vk_fixture_integrity.mjs'
    proc = subprocess.run(
        ['node', str(script)],
        cwd=base,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode not in (0, 1):
        raise RuntimeError(
            f'vk_fixture_integrity.mjs failed unexpectedly: {proc.stderr.strip() or proc.stdout.strip()}'
        )
    line = proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else '{}'
    data: dict[str, Any] = json.loads(line)
    return VkFixtureIntegrity(
        ok=bool(data.get('ok')),
        repo_head_sha=str(data.get('repoHeadSha') or ''),
        snapshot_sha256=str(data.get('snapshotSha256') or ''),
        binding_sha256=str(data.get('bindingSha256') or ''),
        contract_errors=tuple(data.get('contractErrors') or ()),
    )


def integrity_dict(integrity: VkFixtureIntegrity) -> dict[str, Any]:
    return {
        'ok': integrity.ok,
        'repo_head_sha': integrity.repo_head_sha,
        'snapshot_sha256': integrity.snapshot_sha256,
        'binding_sha256': integrity.binding_sha256,
        'contract_errors': list(integrity.contract_errors),
    }
