import re
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

def render_files(files, *, truncated=False, fetch_error=False):
    if fetch_error or truncated or not isinstance(files, (list, tuple)) or len(files) >= 3000:
        return ["<changed-file list unavailable or truncated>"]
    if any(not isinstance(f, str) or not f.strip() for f in files):
        return ["<changed-file list unreadable>"]
    return [f for f in files if RENDER.search(f)]

if __name__ == "__main__":
    import sys
    for f in sys.argv[1:]: print(("RENDER  " if RENDER.search(f) else "backend ") + f)
