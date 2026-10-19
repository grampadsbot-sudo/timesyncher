import atexit
import builtins
import os
import shutil
import sys
import tempfile

_LIVE_LOGS = os.path.expanduser("~/tsv-dispatch/logs")
_orig_open = builtins.open
_WORKTREE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = _WORKTREE


def insert_path():
    if os.environ.get("TSV_DISPATCH_ISOLATED"):
        live = os.path.expanduser("~/tsv-dispatch")
        sys.path[:] = [p for p in sys.path if p and p != live]
    while ROOT in sys.path:
        sys.path.remove(ROOT)
    sys.path.insert(0, ROOT)


def _running_unittests():
    if os.environ.get("TSV_DISPATCH_ISOLATED"):
        return False
    argv = " ".join(sys.argv)
    if "unittest" in argv or sys.argv[0].endswith("unittest"):
        return True
    if any(f.startswith("test_") and f.endswith(".py") for f in sys.argv[:1]):
        return True
    return False


def _install_live_log_guard():
    def guarded_open(file, mode="r", *args, **kwargs):
        m = mode or "r"
        if any(x in m for x in ("w", "a", "+")):
            path = os.path.abspath(os.fspath(file))
            if path.startswith(_LIVE_LOGS + os.sep) or path == _LIVE_LOGS:
                raise AssertionError("test suite must not write live dispatch logs: %s" % path)
        return _orig_open(file, mode, *args, **kwargs)

    builtins.open = guarded_open


def _ensure_isolated():
    tmp = tempfile.mkdtemp(prefix="tsv-dispatch-test-")
    os.environ["TSV_DISPATCH_ROOT"] = tmp
    os.environ["TSV_DISPATCH_LOGS"] = os.path.join(tmp, "logs")
    os.makedirs(os.environ["TSV_DISPATCH_LOGS"], exist_ok=True)
    os.environ["TSV_DISPATCH_ISOLATED"] = "1"
    atexit.register(lambda: shutil.rmtree(tmp, ignore_errors=True))
    _install_live_log_guard()
    insert_path()


if _running_unittests():
    _ensure_isolated()
