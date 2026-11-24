#!/usr/bin/env python3
import json
import os
import sys
import urllib.error
import urllib.request

root = os.environ.get("TSV_DISPATCH_ROOT") or os.path.expanduser("~/tsv-dispatch")
sys.path.insert(0, root)
from tsv_common import GH, GH_TOKEN_FILE, read_secret


def credential():
    sys.stdin.read()
    token = read_secret(os.environ.get("GH_TOKEN_FILE") or GH_TOKEN_FILE)
    sys.stdout.write("username=x-access-token\npassword=%s\n" % token)


def main():
    if len(sys.argv) < 2:
        sys.stderr.write("github client needs a command\n")
        return 1
    command = sys.argv[1]
    if command == "credential":
        credential()
        return 0
    if len(sys.argv) < 3:
        sys.stderr.write("github client needs a path\n")
        return 1
    method = command.upper()
    path = sys.argv[2]
    data = None
    if method in ("POST", "PATCH", "PUT"):
        incoming = sys.stdin.read()
        if incoming.strip():
            data = json.loads(incoming)
    gh = GH()
    if method == "RAW":
        body = gh.req("GET", path, raw=True, accept="application/vnd.github.raw+json")
        if isinstance(body, str):
            sys.stdout.buffer.write(body.encode())
        else:
            sys.stdout.buffer.write(body or b"")
        return 0
    version = os.environ.get("TSV_GH_API_VERSION") or ""
    if version:
        result = req_version(gh, method, path, data, version)
    else:
        result = gh.req(method, path, data=data)
    json.dump(result if result is not None else {}, sys.stdout)
    return 0


def req_version(gh, method, path, data, version):
    url = path if path.startswith("http") else "https://api.github.com" + path
    req = urllib.request.Request(url, method=method, data=None if data is None else json.dumps(data).encode(),
        headers={"Authorization": "Bearer " + gh.tok, "Accept": "application/vnd.github+json", "User-Agent": "tsv-independence",
                 "X-GitHub-Api-Version": version})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as error:
        detail = "GitHub %s %s -> HTTP %s %s" % (method, path.split("?")[0], error.code, error.read()[:200].decode("utf-8", "replace"))
        if gh.tok:
            detail = detail.replace(gh.tok, "[redacted]")
        raise RuntimeError(detail)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        sys.stderr.write("%s\n" % error)
        raise SystemExit(1)
