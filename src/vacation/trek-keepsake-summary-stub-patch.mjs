const KEEPSAKE_SUMMARY_E_NEEDLE =
  'E=()=>String(le.__keepsakeSummary||"").trim()||`${la.title||"This vacation"} brought together your day-by-day plan, meals, shows, shopping, hotels, and saved notes into one printable trip summary. This is an initial take that can be revised through the Vacay Keepsake conversation as the traveler adds memories, corrections, and voice-note updates.`';

const KEEPSAKE_SUMMARY_E_REPLACEMENT =
  'E=()=>{const s=String(le.__keepsakeSummary||"").trim();const b=/brought together your day-by-day plan, meals, shows, shopping, hotels, and saved notes/i;if(s&&!b.test(s))return s;const d=String(la.description||"").trim();return d&&!b.test(d)?d:""}';

export function patchKeepsakeSummaryStub(source = '') {
  const js = String(source || '');
  const count = js.split(KEEPSAKE_SUMMARY_E_NEEDLE).length - 1;
  if (count === 0) return js;
  if (count !== 1) {
    throw new Error(`keepsake summary stub patch matched ${count} time(s); expected 1`);
  }
  return js.replace(KEEPSAKE_SUMMARY_E_NEEDLE, KEEPSAKE_SUMMARY_E_REPLACEMENT);
}