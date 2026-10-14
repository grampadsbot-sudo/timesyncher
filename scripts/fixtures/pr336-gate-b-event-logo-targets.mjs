import { PR336_GATE_B_XAI_PLACE_TARGETS } from './pr336-gate-b-xai-place-targets.mjs';

export const PR336_GATE_B_EVENT_LOGO_TARGETS = PR336_GATE_B_XAI_PLACE_TARGETS.filter(
  (target) => target.category === 'event',
);

export const PR336_GATE_B_EVENT_LOGO_ROW_IDS = new Set(
  PR336_GATE_B_EVENT_LOGO_TARGETS.map((target) => target.rowId),
);
