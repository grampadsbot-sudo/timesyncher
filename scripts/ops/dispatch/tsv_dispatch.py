"""TSV dispatch helpers mirrored in-repo for harness verification."""

from __future__ import annotations

import json
import os
import re
import subprocess
import tarfile
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Callable, Iterable

BUDGET_DRIVER_REL = 'scripts/gateb_head_budget_lines.mjs'
BUDGET_MODULE_REL = 'src/vacation/shared-trip-api-budget.mjs'
HARNESS_BUDGET_BUILD = 'HARNESS_BUDGET_BUILD'

_IMPORT_RE = re.compile(r"""^(?:import\s+(?:[\w*{}\s,]+\s+from\s+)?|export\s+.*?\sfrom\s+)['"]([^'"]+)['"]""", re.MULTILINE)
_MODULE_NOT_FOUND_RE = re.compile(
    r"Cannot find module '([^']+)'|ERR_MODULE_NOT_FOUND[^\n]*\n[^\n]*'([^']+)'",
    re.IGNORECASE,
)


class HeadBudgetBuildError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        missing_module: str | None = None,
        returncode: int | None = None,
        stderr: str = '',
    ) -> None:
        super().__init__(message)
        self.message = message
        self.missing_module = missing_module
        self.returncode = returncode
        self.stderr = stderr


def repo_root(start: Path | None = None) -> Path:
    here = (start or Path(__file__)).resolve()
    for parent in [here, *here.parents]:
        if (parent / 'package.json').is_file() and (parent / 'scripts' / 'fixtures').is_dir():
            return parent
    raise FileNotFoundError('timesyncher repo root not found from tsv_dispatch.py')


def _git_show_bytes(repo_root: Path, rev: str, path: str) -> bytes:
    proc = subprocess.run(
        ['git', '-C', str(repo_root), 'show', f'{rev}:{path}'],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        raise FileNotFoundError(f'{rev}:{path} not found in git')
    return proc.stdout


def _git_archive_extract(repo_root: Path, rev: str, archive_path: str, dest: Path) -> None:
    proc = subprocess.run(
        ['git', '-C', str(repo_root), 'archive', rev, archive_path],
        capture_output=True,
        check=True,
    )
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=BytesIO(proc.stdout), mode='r:*') as archive:
        archive.extractall(dest, filter='data')


def _posix_norm(path: PurePosixPath) -> str:
    parts: list[str] = []
    for part in path.parts:
        if part in ('', '.'):
            continue
        if part == '..':
            if parts:
                parts.pop()
            continue
        parts.append(part)
    return '/'.join(parts)


def _resolve_import(base_file: PurePosixPath, spec: str) -> str | None:
    if spec.startswith('.'):
        target = PurePosixPath(_posix_norm(base_file.parent / spec))
        text = str(target)
        if text.endswith('.mjs') or text.endswith('.js'):
            return text
        return f'{text}.mjs'
    return None


def _archive_roots_for_file(file_path: str, roots: set[str]) -> None:
    if file_path.startswith('src/'):
        return
    parts = PurePosixPath(file_path).parts
    if parts and parts[0] == 'apps' and len(parts) >= 4 and parts[2] == 'src':
        roots.add('/'.join(parts[:4]))
        return
    if len(parts) >= 2:
        roots.add('/'.join(parts[:2]))
        return
    if parts:
        roots.add(parts[0])


def budget_archive_paths(repo_root: Path, head_sha: str) -> tuple[str, ...]:
    """Paths for git archive so gateb_head_budget_lines can import the head budget module."""
    roots: set[str] = {'src'}
    queue: list[str] = [BUDGET_MODULE_REL]
    seen: set[str] = set()
    while queue:
        rel = queue.pop()
        if rel in seen:
            continue
        seen.add(rel)
        try:
            text = _git_show_bytes(repo_root, head_sha, rel).decode('utf-8')
        except FileNotFoundError:
            continue
        base = PurePosixPath(rel)
        for spec in _IMPORT_RE.findall(text):
            resolved = _resolve_import(base, spec)
            if not resolved:
                continue
            _archive_roots_for_file(resolved, roots)
            if resolved not in seen:
                queue.append(resolved)
    return tuple(sorted(roots))


def materialize_budget_driver(repo_root: Path, head_sha: str, dest: Path) -> Path:
    driver = dest / BUDGET_DRIVER_REL
    driver.parent.mkdir(parents=True, exist_ok=True)
    try:
        payload = _git_show_bytes(repo_root, head_sha, BUDGET_DRIVER_REL)
    except FileNotFoundError:
        fallback = repo_root / BUDGET_DRIVER_REL
        if not fallback.is_file():
            raise
        payload = fallback.read_bytes()
    driver.write_bytes(payload)
    driver.chmod(driver.stat().st_mode | 0o111)
    return driver


def link_node_modules(from_root: Path, dest: Path) -> None:
    src = from_root / 'node_modules'
    if not src.is_dir():
        raise FileNotFoundError(f'missing node_modules under {from_root}')
    target = dest / 'node_modules'
    if target.exists() or target.is_symlink():
        target.unlink()
    os.symlink(src.resolve(), target, target_is_directory=True)


def budget_checkout(
    repo_root: Path,
    head_sha: str,
    dest: Path,
    *,
    node_modules_from: Path,
) -> Path:
    """Populate a scratch tree for per-head budget driver runs (archive, not a full clone)."""
    if dest.exists():
        for child in dest.iterdir():
            if child.is_symlink() or child.is_file():
                child.unlink()
            elif child.is_dir():
                subprocess.run(['rm', '-rf', str(child)], check=True)
    else:
        dest.mkdir(parents=True, exist_ok=True)
    for archive_path in budget_archive_paths(repo_root, head_sha):
        _git_archive_extract(repo_root, head_sha, archive_path, dest)
    materialize_budget_driver(repo_root, head_sha, dest)
    link_node_modules(node_modules_from, dest)
    return dest


def parse_missing_module(stderr: str, stdout: str = '') -> str | None:
    hay = f'{stderr}\n{stdout}'
    for pattern in _MODULE_NOT_FOUND_RE.finditer(hay):
        found = pattern.group(1) or pattern.group(2)
        if found:
            return found.strip()
    if 'ERR_MODULE_NOT_FOUND' in hay:
        for line in hay.splitlines():
            if 'Cannot find module' in line or 'ERR_MODULE_NOT_FOUND' in line:
                return line.strip()
    return None


def budget_build_pregate_detail(exc: HeadBudgetBuildError) -> str:
    if exc.missing_module:
        return f'{HARNESS_BUDGET_BUILD}: ERR_MODULE_NOT_FOUND {exc.missing_module}'
    return f'{HARNESS_BUDGET_BUILD}: {exc.message}'


def fill_budget(
    checkout: Path,
    shared_trip: dict,
    *,
    driver_rel: str = BUDGET_DRIVER_REL,
) -> list:
    """Run gateb_head_budget_lines.mjs inside an archive checkout; never silently fall back."""
    import tempfile

    driver = checkout / driver_rel
    if not driver.is_file():
        raise HeadBudgetBuildError(f'missing budget driver in checkout: {driver}')
    trip = dict(shared_trip)
    trip['budget'] = []
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as handle:
        json.dump(trip, handle)
        temp_path = Path(handle.name)
    try:
        proc = subprocess.run(
            ['node', str(driver), str(temp_path)],
            cwd=checkout,
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        temp_path.unlink(missing_ok=True)
    if proc.returncode != 0:
        missing = parse_missing_module(proc.stderr, proc.stdout)
        detail = f'gateb_head_budget_lines exit {proc.returncode}'
        if missing:
            detail = f'{detail}; missing module {missing}'
        raise HeadBudgetBuildError(
            detail,
            missing_module=missing,
            returncode=proc.returncode,
            stderr=proc.stderr,
        )
    try:
        budget = json.loads(proc.stdout)
    except json.JSONDecodeError as err:
        raise HeadBudgetBuildError(f'gateb_head_budget_lines returned invalid JSON: {err}') from err
    if not isinstance(budget, list):
        raise HeadBudgetBuildError('gateb_head_budget_lines did not return a budget array')
    return budget


def head_capture_fixture(
    shared_base: dict,
    *,
    head_sha: str,
    repo_root: Path,
    pr_checkout: Path,
    log: Callable[[str], None] | None = None,
) -> dict:
    """Merge head budget lines into a capture fixture; budget harness failures propagate."""
    checkout_dir = pr_checkout / 'fixture-nyc' / 'checkouts' / head_sha.strip().lower()
    budget_checkout(repo_root, head_sha, checkout_dir, node_modules_from=pr_checkout)
    try:
        budget = fill_budget(checkout_dir, shared_base)
    except HeadBudgetBuildError as exc:
        detail = budget_build_pregate_detail(exc)
        if log:
            log(detail)
        raise HeadBudgetBuildError(detail, missing_module=exc.missing_module, returncode=exc.returncode, stderr=exc.stderr) from exc
    merged = dict(shared_base)
    merged['budget'] = budget
    return merged


def archive_paths_cover_import(repo_root: Path, head_sha: str, archive_paths: Iterable[str]) -> bool:
    """True when every non-src import of the head budget module lies under archive_paths."""
    needed = set(budget_archive_paths(repo_root, head_sha))
    provided = set(archive_paths)
    return needed.issubset(provided)
