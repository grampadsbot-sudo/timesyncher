"""TSV dispatch helpers mirrored in-repo for harness verification (issue #398, #501)."""

from __future__ import annotations

import json
import os
import re
import subprocess
import tarfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Iterable, Mapping

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


from pregate_one import (  # noqa: E402
    SKIPPED_BACKEND_ONLY,
    apply_gateb_commit_status,
    compare_log_fields,
    compare_result_out,
    gateb_commit_state,
    log_compare_result,
    pregate_one_finalize_verdict,
)

from gateb_exemption import (  # noqa: E402
    changed_paths_eligible_for_exemption,
    data_contract_lines_equal,
    gateb_exempt_commit_description,
)


def pregate_one_compare_run_dir(
    compare: Mapping[str, Any] | None,
    *,
    default: str = '',
) -> str:
    base = compare if isinstance(compare, dict) else {}
    nested = compare_result_out(compare)
    for candidate in (base.get('out'), nested.get('out'), default):
        if isinstance(candidate, str) and candidate:
            return candidate
    return default


def _pregate_one_resolved_verdict(
    compare: Mapping[str, Any] | None,
    verdict: str | None,
) -> str | None:
    if verdict is not None:
        return verdict
    if not isinstance(compare, dict):
        return None
    direct = compare.get('verdict')
    if direct:
        return str(direct)
    overall = compare.get('overall')
    if overall:
        return str(overall)
    return None


def pregate_one(
    compare: Mapping[str, Any] | None,
    *,
    log: Callable[[str], None],
    set_status: Callable[..., Any],
    verdict: str | None = None,
    default_run_dir: str = '',
    description: str = '',
    **status_kwargs: Any,
) -> tuple[str, str]:
    resolved = _pregate_one_resolved_verdict(compare, verdict)
    state = pregate_one_finalize_verdict(
        resolved,
        compare,
        log=log,
        set_status=set_status,
        description=description,
        **status_kwargs,
    )
    return state, pregate_one_compare_run_dir(compare, default=default_run_dir)
def _load_json_file(path):
    with open(path) as fh: return json.load(fh)

def _row_id(v):
    for k in ("id", "placeId", "rowId"):
        if v.get(k) is not None: return str(v.get(k))
    return ""

def _capture_rows(fixture_obj):
    if isinstance(fixture_obj, dict):
        if isinstance(fixture_obj.get("places"), list):
            return {str(p.get("id")): p for p in fixture_obj.get("places") if isinstance(p, dict) and p.get("id") is not None}
        for k in ("searchPlaces", "things", "rows"):
            if isinstance(fixture_obj.get(k), dict): return {str(rid): p for rid, p in fixture_obj[k].items() if isinstance(p, dict)}
            if isinstance(fixture_obj.get(k), list): return {_row_id(p): p for p in fixture_obj[k] if isinstance(p, dict) and _row_id(p)}
    return {}

def _data_text(v): return re.sub(r"\s+", " ", str(v or "")).strip()

def _blank(v):
    return v is None or v == "" or v == [] or v == {}

def _effective_capture_row(fixture_obj, rid, row):
    merged = dict(row) if isinstance(row, dict) else {}
    top = fixture_obj.get("thingOverrides") if isinstance(fixture_obj, dict) else None
    hit = top.get("place:" + str(rid)) if isinstance(top, dict) else None
    if isinstance(hit, dict):
        merged.update(hit)
    return merged

def _review_texts(p):
    if not isinstance(p, dict): return []
    src = p.get("sourceRecord") if isinstance(p.get("sourceRecord"), dict) else {}
    vals = []
    for obj in (p, src):
        for k in ("review1", "review2", "review3", "review4"):
            vals.append(_data_text(obj.get(k)).lower())
        reviews = obj.get("reviews")
        if isinstance(reviews, list):
            for x in reviews:
                if isinstance(x, dict): vals.append(_data_text(x.get("text") or x.get("review") or x.get("body")).lower())
                else: vals.append(_data_text(x).lower())
    return sorted(v for v in vals if v)

def _logo_text(p):
    if not isinstance(p, dict): return ""
    src = p.get("sourceRecord") if isinstance(p.get("sourceRecord"), dict) else {}
    return _data_text(p.get("logoUrl") or src.get("logoUrl") or src.get("logo") or src.get("faviconUrl"))

def _price_num(v):
    if v in (None, ""): return None
    try: return float(str(v).replace("$", "").replace(",", ""))
    except ValueError: return None

def _capture_row_faults(rid, src, dst):
    faults = []
    src_name = _data_text(src.get("title") or src.get("name"))
    dst_name = _data_text(dst.get("title") or dst.get("name"))
    if src_name and dst_name.lower() != src_name.lower():
        faults.append("DATA-CONTRACT: captured row %s identity mismatch snapshot=%r capture=%r" % (rid, src_name, dst_name))
    for field in ("summary", "description"):
        src_v = _data_text(src.get(field))
        dst_v = _data_text(dst.get(field))
        if src_v and dst_v.lower() != src_v.lower():
            faults.append("DATA-CONTRACT: captured row %s %s mismatch" % (rid, field))
    src_logo, dst_logo = _logo_text(src), _logo_text(dst)
    if src_logo and dst_logo.lower() != src_logo.lower():
        faults.append("DATA-CONTRACT: captured row %s logo mismatch" % rid)
    src_price = _price_num(src.get("price"))
    if src_price is None and isinstance(src.get("sourceRecord"), dict):
        src_price = _price_num(src["sourceRecord"].get("price"))
    if src_price is not None:
        dst_price = _price_num(dst.get("price"))
        if dst_price is None and isinstance(dst.get("sourceRecord"), dict):
            dst_price = _price_num(dst["sourceRecord"].get("price"))
        if dst_price != src_price:
            faults.append("DATA-CONTRACT: captured row %s price mismatch snapshot=%r capture=%r" % (rid, src_price, dst_price))
    if src.get("lat") not in (None, "") and src.get("lng") not in (None, ""):
        try:
            if abs(float(src.get("lat")) - float(dst.get("lat"))) > 1e-4 or abs(float(src.get("lng")) - float(dst.get("lng"))) > 1e-4:
                faults.append("DATA-CONTRACT: captured row %s coordinates mismatch" % rid)
        except (TypeError, ValueError):
            faults.append("DATA-CONTRACT: captured row %s coordinates missing" % rid)
    src_reviews, dst_reviews = _review_texts(src), _review_texts(dst)
    if src_reviews and src_reviews != dst_reviews:
        faults.append("DATA-CONTRACT: captured row %s reviews mismatch" % rid)
    return faults

def _capture_payload_faults(snapshot_path, fixture_path):
    snap = _load_json_file(snapshot_path)
    if not isinstance(snap, dict) or not snap:
        return ["DATA-CONTRACT: data snapshot is empty or not an object"]
    fixture = _load_json_file(fixture_path)
    captured = _capture_rows(fixture)
    if not captured:
        return ["DATA-CONTRACT: captured fixture has no row payload to bind to the snapshot"]
    missing = sorted(str(k) for k in snap if str(k) not in captured)
    if missing:
        return ["DATA-CONTRACT: captured fixture missing snapshot rows: %s" % ", ".join(missing[:12])]
    faults = []
    for rid, src in snap.items():
        if not isinstance(src, dict):
            faults.append("DATA-CONTRACT: snapshot row %s is not an object" % rid); continue
        dst = _effective_capture_row(fixture, rid, captured.get(str(rid)) or {})
        top = fixture.get("thingOverrides") if isinstance(fixture, dict) else None
        key = "place:" + str(rid)
        if not isinstance(top, dict) or not isinstance(top.get(key), dict):
            faults.append("DATA-CONTRACT: captured row %s missing or invalid canonical override" % rid)
        if isinstance(top, dict) and str(rid) in top:
            faults.append("DATA-CONTRACT: captured row %s obsolete bare override alias" % rid)
        faults.extend(_capture_row_faults(rid, src, dst))
        raw = captured[str(rid)]
        raw_expected = {k: v for k, v in src.items() if k in raw}
        if not _blank(raw.get("name")):
            raw_expected["title"] = src.get("title") or src.get("name")
        faults.extend(_capture_row_faults(rid, raw_expected, raw))
        if len(faults) >= 12: break
    return faults
