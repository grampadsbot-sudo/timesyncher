#!/usr/bin/env python3

from __future__ import annotations

import json
import mimetypes
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
SHARED_ENTRY = "/vacation-app-next.html"
VACATION_APP_ENTRY = "/vacation-app.html"

GATE_B_SLUG = "8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y"
NYC_PR225_SLUG = "intake-c15be2f6d7bf"


def rewrite_path(pathname: str) -> str | None:
    if pathname in ("/shared", "/shared/"):
        return VACATION_APP_ENTRY
    if re.fullmatch(r"/shared/[^/]+/journey/?", pathname):
        return SHARED_ENTRY
    if re.fullmatch(r"/shared/[^/]+/report/daily(?:\.pdf)?/?", pathname):
        return SHARED_ENTRY
    if re.fullmatch(r"/edit-access/?", pathname):
        return SHARED_ENTRY
    if pathname.startswith("/shared/"):
        return SHARED_ENTRY
    return None


def load_gate_b_fixture() -> dict | None:
    json_path = ROOT / "scripts" / "fixtures" / "gate-b-approved-shared-trip.json"
    if json_path.is_file():
        return json.loads(json_path.read_text(encoding="utf-8"))
    return None


def shared_trip_json(token: str) -> tuple[int, bytes, str]:
    if token == GATE_B_SLUG:
        payload = load_gate_b_fixture()
        if payload is None:
            import subprocess

            script = (
                "import { buildGateBApprovedSharedTrip } from './scripts/fixtures/gate-b-approved-shared-trip.mjs';"
                "console.log(JSON.stringify(buildGateBApprovedSharedTrip()));"
            )
            proc = subprocess.run(
                ["node", "--input-type=module", "-e", script],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
            if proc.returncode != 0:
                return 500, b"{}", "application/json; charset=utf-8"
            return 200, proc.stdout.encode("utf-8"), "application/json; charset=utf-8"
        return 200, json.dumps(payload).encode("utf-8"), "application/json; charset=utf-8"
    if token == NYC_PR225_SLUG:
        import subprocess

        script = (
            "import { finalizeServedSharedTripPayload } from './src/vacation/shared-trip-served-page.mjs';"
            "import { applyCapturedLogos } from './src/vacation/thing-logo-capture.mjs';"
            "import { buildNycPr225SharedTrip } from './scripts/fixtures/nyc-pr225-shared-trip.mjs';"
            "console.log(JSON.stringify(finalizeServedSharedTripPayload(applyCapturedLogos(buildNycPr225SharedTrip()))));"
        )
        proc = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            return 404, b"{}", "application/json; charset=utf-8"
        return 200, proc.stdout.encode("utf-8"), "application/json; charset=utf-8"
    return 404, b'{"error":"not found"}', "application/json; charset=utf-8"


class Handler(BaseHTTPRequestHandler):
    server_version = "TSVServeDist/1.0"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        pathname = unquote(parsed.path)

        shared_api = re.fullmatch(r"/api/shared/([^/]+)/?", pathname)
        if shared_api:
            status, body, ctype = shared_trip_json(shared_api.group(1))
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if pathname == "/api/version":
            body = b'{"ok":true,"sha":"serve-dist-local"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        dest = rewrite_path(pathname)
        if dest:
            pathname = dest

        rel = pathname.lstrip("/")
        file_path = (DIST / rel).resolve()
        if not str(file_path).startswith(str(DIST.resolve())) or not file_path.is_file():
            self.send_error(404, "not found")
            return

        data = file_path.read_bytes()
        ctype = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    if not DIST.is_dir():
        sys.stderr.write(f"missing dist directory: {DIST}\n")
        sys.exit(1)
    port = int(os.environ.get("PORT", "8765"))
    host = os.environ.get("HOST", "127.0.0.1")
    httpd = ThreadingHTTPServer((host, port), Handler)
    sys.stderr.write(f"serving {DIST} at http://{host}:{port}/\n")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
