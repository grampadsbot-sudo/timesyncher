# Vacation client (`apps/vacation-client`)

Clean-room React preview for shared-trip UI (`vacation-app-next.html`). Not the served TREK bundle until P3 cutover.

## Setup

```bash
cd apps/vacation-client
npm ci
```

## Commands

| Script | Command | Purpose |
| --- | --- | --- |
| Dev server | `npm run dev` | Vite dev server |
| Production build | `npm run build` | Vite build (does not type-check) |
| Typecheck | `npm run typecheck` | `tsc --noEmit` (strict) |
| Lint | `npm run lint` | ESLint on `src/**/*.{ts,tsx}` |
| Unit tests | `npm test` | All `test/*.unit.mjs`; layout via `shell-layout.mjs` when `CHROME_PATH` is set |

From repo root after building the client:

```bash
node apps/vacation-client/test/shell-layout.mjs
```

Requires Chrome/Chromium at `CHROME_PATH` (defaults to `/usr/local/bin/google-chrome`).

## CI

The `unit-tests` job runs `npm ci`, `typecheck`, `lint`, and `test` inside `apps/vacation-client`. Offline CI skips headless layout unless Chrome is configured; layout proof also runs in shared-trip chrome gates (see `features/vacation-client-screens.md`).
