/**
 * #784: a deleted lane worktree is not unpublished work.
 * lane_autofill.worktree_unpublished returns false before git when the path is
 * missing, and covered_by_result does not treat that as a skip-forever cover.
 * VKPrLoop.tla models that directory as wt = "none" (not Unpub).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dispatch = path.join(os.homedir(), 'tsv-dispatch');
const spec = path.join(dispatch, 'formal', 'VKPrLoop.tla');
const source = path.join(dispatch, 'lane_autofill.py');

assert(fs.existsSync(spec), `missing ${spec}`);
assert(fs.existsSync(source), `missing ${source}`);

const tla = fs.readFileSync(spec, 'utf8');
assert(
  tla.includes('A missing directory is "none"'),
  'VKPrLoop.tla must describe a missing worktree as wt = "none"',
);
assert(
  tla.includes('Deleted worktree (not a directory) returns FALSE'),
  'VKPrLoop.tla must say worktree_unpublished returns FALSE for a deleted directory',
);
assert(
  tla.includes('Unpub =='),
  'Unpub predicate missing',
);

const py = String.raw`
import ast, os, subprocess, sys, tempfile, time
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.expanduser("~/tsv-dispatch"))
import lane_autofill as la

src = Path(la.__file__).read_text()
tree = ast.parse(src)
fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "worktree_unpublished")
body = ast.get_source_segment(src, fn)
dir_at = body.find("os.path.isdir(wt)")
git_at = body.find("subprocess.run")
assert 0 <= dir_at < git_at, "isdir guard must run before git"

calls = []
real_run = subprocess.run
def counting_run(*args, **kwargs):
    calls.append(args[0] if args else kwargs.get("args"))
    return real_run(*args, **kwargs)

with patch.object(la.subprocess, "run", counting_run):
    assert la.worktree_unpublished("") is False
    assert la.worktree_unpublished(None) is False
    missing = "/tmp/vk784-deleted-worktree"
    assert not os.path.exists(missing)
    assert la.worktree_unpublished(missing) is False
    assert calls == [], calls

bare = tempfile.mkdtemp(prefix="vk784-bare-")
wt = tempfile.mkdtemp(prefix="vk784-wt-")
def git(*args, cwd=wt):
    subprocess.check_call(["git", "-C", cwd, *args])

git("init", "-q", "--bare", cwd=bare)
git("init", "-q")
git("config", "user.email", "vk784@example.invalid")
git("config", "user.name", "vk784")
Path(wt, "app.txt").write_text("base\n")
git("add", "app.txt")
git("commit", "-qm", "base")
assert la.worktree_unpublished(wt) is True, "unpushed commit is unpublished"
git("remote", "add", "origin", bare)
git("push", "-q", "origin", "HEAD:refs/heads/main")
assert la.worktree_unpublished(wt) is False, "pushed clean worktree is not unpublished"
Path(wt, "app.txt").write_text("dirty\n")
assert la.worktree_unpublished(wt) is True, "dirty file outside J/ and evidence/ is unpublished"
Path(wt, "app.txt").write_text("base\n")
Path(wt, "J").mkdir()
Path(wt, "J", "RECEIPT.md").write_text("receipt\n")
Path(wt, "evidence").mkdir()
Path(wt, "evidence", "shot.png").write_text("png\n")
assert la.worktree_unpublished(wt) is False, "J/ and evidence/ dirt is not unpublished"

item = {"kind": "pr", "number": 784, "pr": {"head": {"sha": "b" * 40}}}
result = {
    "number": 784,
    "fingerprint": "a" * 40,
    "text": "result done",
    "tag": "vkfill-784",
    "mtime": time.time(),
    "job_dir": missing,
}
with patch.object(la, "result_expired", return_value=False), \
     patch.object(la, "result_worktree", return_value=missing), \
     patch.object(la, "head_awaiting_verdict", return_value=False), \
     patch.object(la, "head_red_or_failed", return_value=False), \
     patch.object(la, "item_fingerprint", return_value="b" * 40):
    covered = la.covered_by_result(item, {784: result}, time.time(), lambda *a: None)
assert covered is False, "deleted worktree must not cover a moved head"

print("ok")
`;

execFileSync('python3', ['-c', py], { stdio: 'inherit' });
console.log('test_vkprloop_missing_worktree: ok');
