import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Craig 09:26 PT + tsv-ui-spec a3896550: composer includes visible send. */
const CANONICAL_APP_UI_SPEC_FALLBACK = `The app is a Grok-like text interface:
- The ONLY controls are a text box (the composer) with a file-add button, a speak button, and a visible send button.
- When the customer has fewer than 2 vacations, the header is FULLY HIDDEN: not rendered, or display:none, taking zero height.
- When the customer has 2 or more vacations, the header holds ONLY a vacation dropdown (no logos, brand bars, or other chrome).
- Once the vacation website has content, it shows ON TOP, with a resizable divider between it and the chat below, plus a full-screen control in the site area that expands the site to fill the viewport and can be toggled back.
- NOTHING else. FAIL on clutter (logos, pills, nav bars, stamps, empty boxes, the Open navigation/Settings menu, or extra buttons). Send, file-add, and speak are required composer controls, not clutter.
- App shell only (header, composer row, site/chat slider). Vendor brand logos inside vacation site content rows (Hyatt, Westin, Hertz on Hotels/Cars) are allowed trip content, not app chrome.`;

export function loadAppScreenSpecText() {
  const path = join(process.cwd(), 'features', 'screens', 'app.md');
  if (existsSync(path)) {
    return { text: readFileSync(path, 'utf8'), source: 'features/screens/app.md' };
  }
  return { text: CANONICAL_APP_UI_SPEC_FALLBACK, source: 'canonical_fallback_0926_pt' };
}
