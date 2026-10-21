#!/usr/bin/env python3
"""Host-side structural checks for capture-replay-runtime.patch (no runtime install)."""
import ast
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

SUPPORT = Path(__file__).resolve().parent
MANIFEST = SUPPORT / 'capture-replay-runtime-manifest.json'
PATCH = SUPPORT / 'capture-replay-runtime.patch'


def nonfunction_ast_dumps(source: str) -> list[str]:
    module = ast.parse(source)
    return [ast.dump(node, include_attributes=False) for node in module.body if not isinstance(node, ast.FunctionDef)]


def function_ast_map(source: str) -> dict[str, str]:
    module = ast.parse(source)
    return {
        node.name: ast.dump(node, include_attributes=False)
        for node in module.body
        if isinstance(node, ast.FunctionDef)
    }


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print('usage: verify_capture_replay_runtime_patch.py <runtime-dispatcher.py>', file=sys.stderr)
        return 2
    runtime = Path(argv[1])
    manifest = json.loads(MANIFEST.read_text())
    raw = runtime.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != manifest['runtime_dispatcher_sha256']:
        print('runtime sha256 %s != manifest %s' % (digest, manifest['runtime_dispatcher_sha256']), file=sys.stderr)
        return 2
    reference = raw.decode()
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        name = manifest['runtime_path']
        target = work / name
        target.write_bytes(raw)
        proc = subprocess.run(
            ['patch', '-p0', '--fuzz=0', str(target), '-i', str(PATCH)],
            capture_output=True,
            text=True,
            cwd=work,
        )
        if proc.returncode != 0:
            print(proc.stdout, proc.stderr, file=sys.stderr)
            return 3
        patched = target.read_text()
        ast.parse(patched)
        subprocess.run([sys.executable, '-m', 'py_compile', name], check=True, cwd=work)
    if hashlib.sha256(patched.encode()).hexdigest() != manifest['patched_runtime_sha256']:
        print('patched sha256 mismatch', file=sys.stderr)
        return 4
    whitelist = set(manifest['patched_function_sha256'])
    if nonfunction_ast_dumps(reference) != nonfunction_ast_dumps(patched):
        print('nonfunction AST mismatch', file=sys.stderr)
        return 5
    ref_funcs = function_ast_map(reference)
    pat_funcs = function_ast_map(patched)
    for name, ref_dump in ref_funcs.items():
        if name in whitelist:
            continue
        if pat_funcs.get(name) != ref_dump:
            print('function AST changed outside whitelist: %s' % name, file=sys.stderr)
            return 6
    print('verify_capture_replay_runtime_patch OK runtime=%s' % runtime)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
