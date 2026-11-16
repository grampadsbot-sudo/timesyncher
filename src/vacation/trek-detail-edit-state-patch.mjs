const STATE_NEEDLE = '[Sa,Kt]=I.useState(!1);I.useLayoutEffect(()=>{if(!["flights","hotels","cars"]';
const STATE_PATCH = '[Sa,Kt]=I.useState(!1),[tsEd,tsSetEd]=I.useState(()=>typeof window<"u"&&window.innerWidth>=760);I.useLayoutEffect(()=>{if(!["flights","hotels","cars"]';
const PANEL_START = 'Dt&&n.jsx("div",{"data-ts-detail-overlay":"1"';
const PANEL_START_LEGACY = 'Dt&&n.jsx("div",{style:{position:"fixed",inset:0,zIndex:1e4';
const PANEL_END = ',n.jsxs("div",{style:{maxWidth:1120';

export function patchDetailEditState(source = '') {
  if (source.includes('[tsEd,tsSetEd]=')) return source;
  if (!source.includes(STATE_NEEDLE)) throw new Error('detail edit state needle missing');
  let out = source.replace(STATE_NEEDLE, STATE_PATCH);
  let start = out.indexOf(PANEL_START);
  if (start < 0) start = out.indexOf(PANEL_START_LEGACY);
  const end = start < 0 ? -1 : out.indexOf(PANEL_END, start);
  if (start < 0 || end < 0) throw new Error('detail edit panel boundary missing');
  const panel = out.slice(start, end)
    .replaceAll('Ce&&!Sa', 'Ce&&!tsEd')
    .replaceAll('Ce&&Sa', 'Ce&&tsEd')
    .replaceAll('Kt(!0)', 'tsSetEd(!0)')
    .replaceAll('Kt(!1)', 'tsSetEd(!1)');
  if (panel.includes('Kt(') || /(?<![\w$.])Sa(?![\w$])/.test(panel)) throw new Error('detail edit panel still uses the wide-layout flag');
  out = out.slice(0, start) + panel + out.slice(end);
  return out;
}
