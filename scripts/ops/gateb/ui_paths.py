"""TSV render-file rule (Craig via dr eggbot 1:56 PM PT 10/7): only PRs that touch UI or render files get a screen check.
Shared by Hermes gateb_compare.py and the Ubuntu cron (tsv_dispatch.py). Backend-only PRs merge on green CI alone.

Render files =
  client pages ......... root *.html (shared-app.html, vacation-app.html, itinerary.html, index.html, checkout pages ...)
  styles ............... any *.css
  client assets/JS ..... public/** (incl. the served TREK bundle public/assets/*, JourneyBookPDF bundle, icons, images)
  client page modules .. src/onboarding/eula-page*.mjs, eula-accept-page-render.mjs, eula-markdown.mjs
  shared render module . src/vacation/shared-trip-served-page.mjs + shared-trip-live-tab-lists / -live-app-fields /
                         -oe-list-row-patch, timeline-icons.mjs
  served bundle patches  src/vacation/trek-*.mjs, trip-map-initial-view.mjs, trip-map-hook.mjs,
                         scripts/strip-served-trek-bundle.mjs, write-shared-assets.mjs, rebake_served_trek_bundle.mjs
  PDF templates ........ src/vacation/keepsake-style2*.mjs, keepsake-product-overrides.mjs, pdf-*.mjs
  build/serving ........ vite.config.mjs, package.json, package-lock.json, vercel.json, .vercelignore
Everything else (src/vacation/* server logic, routes/*, api/*, db/*, dialog-runners/*, content/*, scripts/*, docs) is backend.
"""
import re
RENDER = re.compile(r"""(
    ^[^/]+\.html$
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

def render_files(files):
    return [f for f in files if RENDER.search(f)]

if __name__ == "__main__":
    import sys
    for f in sys.argv[1:]: print(("RENDER  " if RENDER.search(f) else "backend ") + f)
