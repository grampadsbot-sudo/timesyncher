import ast
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def classify(worktree, dispatch_root, gateb_root, base_ref='origin/migrate/trek-source'):
    tree = ast.parse((Path(dispatch_root) / 'tsv_dispatch.py').read_text())
    assignment = next(n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'STRICT_UI_RE' for t in n.targets))
    ns = {'re': re}
    exec(compile(ast.Module(body=[assignment], type_ignores=[]), '<canonical-strict-ui>', 'exec'), ns)
    ui_path = Path(gateb_root) / 'ui_paths.py'
    ui_ns = {'__name__': 'scope_ui_paths'}
    exec(compile(ui_path.read_text(), str(ui_path), 'exec'), ui_ns)
    def git(*args):
        r = subprocess.run(['git', '-C', str(worktree), *args], capture_output=True, check=True)
        return r.stdout
    mb = git('merge-base', 'HEAD', base_ref).decode().strip()
    if not re.fullmatch(r'[0-9a-f]{40,64}', mb):
        raise ValueError('merge-base did not produce an exact SHA')
    raw = git('diff', '--name-only', '-z', '--no-renames', mb, '--')
    raw += git('diff', '--name-only', '-z', '--no-renames', 'HEAD', '--')
    raw += git('ls-files', '--others', '--exclude-standard', '-z')
    paths = sorted(set(x.decode('utf-8', 'strict') for x in raw.split(b'\0') if x))
    if any(p.startswith('/') or '..' in Path(p).parts for p in paths):
        raise ValueError('invalid changed path')
    ui = [p for p in paths if ns['STRICT_UI_RE'].search(p) or ui_ns['render_files']([p])]
    return {'verdict': 'RUN' if ui else 'NOT_RUN_BACKEND_ONLY', 'merge_base': mb, 'paths': paths, 'render_paths': ui}


def main():
    try:
        result = classify(sys.argv[1], Path.home() / 'tsv-dispatch', Path.home() / 'tsv-gateb')
    except Exception as exc:
        print(json.dumps({'verdict': 'NO_VERDICT', 'reason': type(exc).__name__ + ': ' + str(exc)}))
        return 2
    print(json.dumps(result))
    return 0 if result['render_paths'] else 10


if __name__ == '__main__':
    sys.exit(main())
