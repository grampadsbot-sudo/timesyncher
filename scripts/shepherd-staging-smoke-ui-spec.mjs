import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Craig 09:26 PT canonical app UI (used when features/screens/app.md is absent). */
const CANONICAL_APP_UI_SPEC_FALLBACK = `The app is a Grok-like text interface:
- The ONLY controls are a text box (the composer) with a file-add button and a speak button.
- The header is EMPTY unless the customer has 2 or more vacations, in which case it holds ONLY a vacation dropdown.
- Once the vacation website has content, it shows ON TOP, with a control slider (a resizable divider) in the middle between it and the chat below.
- NOTHING else. FAIL on any other element: logos, pills, nav bars, stamps, empty boxes, the Open navigation/Settings menu, or any other buttons.
- App shell only (header, composer row, site/chat slider). Vendor brand logos inside vacation site content rows (Hyatt, Westin, Hertz on Hotels/Cars) are allowed trip content, not app chrome.`;

export function loadAppScreenSpecText() {
  const path = join(process.cwd(), 'features', 'screens', 'app.md');
  if (existsSync(path)) {
    return { text: readFileSync(path, 'utf8'), source: 'features/screens/app.md' };
  }
  return { text: CANONICAL_APP_UI_SPEC_FALLBACK, source: 'canonical_fallback_0926_pt' };
}
