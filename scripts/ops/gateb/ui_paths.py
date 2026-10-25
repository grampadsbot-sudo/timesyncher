import re
import sys

RENDER = re.compile(r"""(
    ^[^/]+\.html$
  | ^src/vacation/
  | (^|/)(styles|images|fonts)/
  | \.(css|scss|html|svg|png|jpe?g|webp|ico|woff2?)\b
  | (^|/)(vite|tailwind|postcss)\.config\.(js|mjs|cjs|ts)$
  | \.css$
  | ^public/
  | ^apps/vacation-client/
  | ^vacation-app-next\.html$
  | ^src/onboarding/(eula-page[\w-]*|eula-accept-page-render|eula-markdown)\.mjs$
  | ^src/vacation/(shared-trip-served-page|shared-trip-live-tab-lists|shared-trip-live-app-fields|shared-trip-oe-list-row-patch|timeline-icons)\.mjs$
  | ^src/vacation/(trek-[\w-]+|trip-map-initial-view|trip-map-hook)\.mjs$
  | ^scripts/(strip-served-trek-bundle|write-shared-assets|rebake_served_trek_bundle)\.mjs$
  | ^src/vacation/(keepsake-style2[\w-]*|keepsake-product-overrides|pdf-[\w-]+)\.mjs$
  | ^(vite\.config\.mjs|package\.json|package-lock\.json|vercel\.json|\.vercelignore)$
)""", re.X | re.I)

LINUX_ARGV_MAX = 128 * 1024


def render_files(files, *, truncated=False, fetch_error=False):
    if fetch_error or truncated or not isinstance(files, (list, tuple)) or len(files) >= 3000:
        return ["<changed-file list unavailable or truncated>"]
    if any(not isinstance(f, str) or not f.strip() for f in files):
        return ["<changed-file list unreadable>"]
    return [f for f in files if RENDER.search(f)]


def pr_touches_app_ui(changed_paths):
    ui = render_files(list(changed_paths or []))
    return [p for p in ui if not p.startswith("<")]


def decode_path_blob(data):
    if not data:
        return []
    text = data.decode("utf-8") if isinstance(data, (bytes, bytearray)) else str(data)
    if "\0" in text:
        parts = text.split("\0")
    else:
        parts = text.splitlines()
    return [p.strip() for p in parts if p.strip()]


def read_paths_file(path):
    with open(path, "rb") as fh:
        return decode_path_blob(fh.read())


def read_paths_stdin():
    return decode_path_blob(sys.stdin.buffer.read())


def argv_bytes(argv):
    total = 0
    for arg in argv:
        total += len(arg.encode("utf-8")) + 1
    return total


def classify_lines(paths):
    for f in paths:
        prefix = "RENDER  " if RENDER.search(f) else "backend "
        print(prefix + f)


def parse_cli(argv):
    paths = []
    paths_file = None
    use_stdin = False
    i = 1
    while i < len(argv):
        arg = argv[i]
        if arg in ("-h", "--help"):
            print("usage: ui_paths.py [--stdin | --paths-file PATH] [PATH ...]")
            raise SystemExit(0)
        if arg == "--stdin":
            use_stdin = True
            i += 1
            continue
        if arg == "--paths-file":
            i += 1
            if i >= len(argv):
                print("ui_paths.py: --paths-file requires a path", file=sys.stderr)
                raise SystemExit(2)
            paths_file = argv[i]
            i += 1
            continue
        if arg.startswith("-"):
            print("ui_paths.py: unknown option %s" % arg, file=sys.stderr)
            raise SystemExit(2)
        paths.append(arg)
        i += 1
    if use_stdin and paths_file:
        print("ui_paths.py: use only one of --stdin or --paths-file", file=sys.stderr)
        raise SystemExit(2)
    if use_stdin:
        paths = read_paths_stdin()
    elif paths_file:
        paths = read_paths_file(paths_file)
    elif paths and argv_bytes(argv) > LINUX_ARGV_MAX:
        print(
            "ui_paths.py: argv exceeds %d bytes; pass paths via --stdin or --paths-file"
            % LINUX_ARGV_MAX,
            file=sys.stderr,
        )
        raise SystemExit(2)
    return paths


if __name__ == "__main__":
    classify_lines(parse_cli(sys.argv))
