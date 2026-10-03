/** Register LAYOUT spine check (PR-A); VISUAL wired in PR-C. */
import { registerLayoutSpineChecks } from './shepherd-staging-smoke-layout-spine.mjs';

export async function registerLayoutVisualSpineChecks(spineCtx) {
  await registerLayoutSpineChecks(spineCtx);
}
