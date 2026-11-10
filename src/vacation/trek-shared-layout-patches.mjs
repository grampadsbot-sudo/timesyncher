const TAB_ROW_OVERFLOW_NEEDLE = 'maxWidth:1120,width:"100%",boxSizing:"border-box",margin:"0 auto",padding:"20px 16px",overflowX:"clip"},children:[n.jsx("div",{style:{display:"flex",gap:3,marginBottom:20,marginLeft:-8,marginRight:-8,width:"calc(100% + 16px)",overflowX:"visible",padding:"2px 0",flexWrap:"wrap",justifyContent:"center"}';
const TAB_ROW_OVERFLOW_PATCH = 'maxWidth:1120,width:"100%",minWidth:0,boxSizing:"border-box",margin:"0 auto",padding:"20px 16px",overflowX:"clip"},children:[n.jsx("div",{style:{display:"flex",gap:3,marginBottom:20,minWidth:0,maxWidth:"100%",overflowX:"clip",padding:"2px 0",flexWrap:"wrap",justifyContent:"center"}';
const TAB_ROW_OVERFLOW_FULLWIDTH_NEEDLE = 'maxWidth:"100%",width:"100%",minWidth:0,boxSizing:"border-box",margin:"0 auto",padding:"20px 16px",overflowX:"clip"},children:[n.jsx("div",{style:{display:"flex",gap:3,marginBottom:20,minWidth:0,maxWidth:"100%",overflowX:"clip"';

const DETAIL_DAYS_GRID_NEEDLE = 'gridTemplateColumns:Mi(Dt)?"88px minmax(150px, 1fr) 128px":"88px 104px minmax(150px, 1fr) 128px"';
const DETAIL_DAYS_GRID_PATCH = 'gridTemplateColumns:Mi(Dt)?"minmax(72px,auto) minmax(0,1fr) minmax(88px,auto)":"minmax(72px,auto) minmax(72px,auto) minmax(0,1fr) minmax(88px,auto)",width:"100%",minWidth:0,maxWidth:"100%",boxSizing:"border-box"';
const DAY_PILL_ROW_NEEDLE = 'display:"flex",gap:6,overflowX:"auto",paddingBottom:2},children:Qa.map';
const DAY_PILL_ROW_PATCH = 'display:"flex",gap:6,overflowX:"auto",paddingBottom:2,flexWrap:"wrap",maxWidth:"100%",minWidth:0,boxSizing:"border-box"},children:Qa.map';
const DAY_TIMELINE_GRID_NEEDLE = 'display:"grid",gridTemplateColumns:"74px 22px 1fr",gap:10,alignItems:"start"';
const DAY_TIMELINE_GRID_NARROW_PATCH =
  'display:"grid",gridTemplateColumns:"minmax(52px,64px) 22px minmax(0,1fr)",gap:8,alignItems:"start",minWidth:0,maxWidth:"100%"';
const DAY_TIMELINE_GRID_PATCH =
  'display:"grid",gridTemplateColumns:"minmax(72px,80px) 22px minmax(0,1fr)",gap:8,alignItems:"start",minWidth:0,maxWidth:"100%"';
const DAY_TIMELINE_TIME_NEEDLE = 'n.jsxs("div",{style:{fontSize:11,fontWeight:700,color:ua.isConflict?"#b91c1c":ua.time?"#111827":"#9ca3af",textAlign:"right",paddingTop:Zn?8:2},children:[ua.time?Yo(ua.time):';
const DAY_TIMELINE_TIME_SINGLE_LINE = '!ua.endTime&&!ua.isConflict?n.jsx("div",{"data-ts-timeline-time":"1",style:{fontSize:11,fontWeight:700,color:ua.time?"#111827":"#9ca3af",textAlign:"right",whiteSpace:"nowrap",alignSelf:"baseline"},children:ua.time?tsTimelineRowTime(ua):"TB"+"D"}):';
const DAY_TIMELINE_TIME_SINGLE_LINE_LEGACY = 'ua.time&&!ua.endTime&&!ua.isConflict?n.jsx("div",{"data-ts-timeline-time":"1",style:{fontSize:11,fontWeight:700,color:"#111827",textAlign:"right",whiteSpace:"nowrap",alignSelf:"baseline"},children:Yo(ua.time)}):';
const DAY_TIMELINE_TITLE_WRAP_NEEDLE = '}:{paddingTop:1},children:[ua.isConflict&&n.jsxs(';
const DAY_TIMELINE_TITLE_WRAP_BASELINE = '}:{paddingTop:1,alignSelf:!ua.endTime&&!ua.isConflict?"baseline":"start"},children:[ua.isConflict&&n.jsxs(';
const CONFLICT_LABEL_NEEDLE = 'ua.isConflict&&n.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,color:"#b91c1c",fontSize:11,fontWeight:900,marginBottom:6},children:[n.jsx("span",{style:{width:34,height:2,background:"#ef4444",display:"inline-block"}}),"Conflict with ",Bs(ua.conflictWith||"another timeline item")]}),n.jsx("button",{"data-ts-timeline-title":"1"';
const CONFLICT_LABEL_CLIP_NEEDLE = 'ua.isConflict&&n.jsxs("div",{"data-ts-conflict-label":"1",style:{display:"flex",alignItems:"center",gap:8,flexWrap:"nowrap",width:"100%",minWidth:0,color:"#b91c1c",fontSize:11,fontWeight:900,marginBottom:6,lineHeight:1.35,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},children:[n.jsx("span",{style:{width:34,height:2,background:"#ef4444",display:"inline-block",flexShrink:0}}),"Conflict with ",Bs(ua.conflictWith||"another timeline item")]}),n.jsx("button",{"data-ts-timeline-title":"1"';
const CONFLICT_LABEL_PATCH = 'ua.isConflict&&n.jsxs("div",{"data-ts-conflict-label":"1",style:{display:"flex",alignItems:"flex-start",gap:8,flexWrap:"wrap",width:"100%",minWidth:0,color:"#b91c1c",fontSize:11,fontWeight:900,marginBottom:6,lineHeight:1.35,whiteSpace:"normal",overflow:"visible",wordBreak:"break-word"},children:[n.jsx("span",{style:{width:34,height:2,background:"#ef4444",display:"inline-block",flexShrink:0,marginTop:6}}),"Conflict with ",Bs(ua.conflictWith||"another timeline item")]}),n.jsx("button",{"data-ts-timeline-title":"1"';

export function patchConflictTimelineLabel(js = '', options = {}) {
  const served = options.served === true;
  let out = String(js || '');
  if (out.includes(CONFLICT_LABEL_CLIP_NEEDLE)) out = out.replace(CONFLICT_LABEL_CLIP_NEEDLE, CONFLICT_LABEL_PATCH);
  else if (out.includes(CONFLICT_LABEL_NEEDLE)) out = out.replace(CONFLICT_LABEL_NEEDLE, CONFLICT_LABEL_PATCH);
  else if (served && !out.includes('data-ts-conflict-label":"1"')) {
    throw new Error('conflict timeline label patch did not apply');
  } else if (served && out.includes('data-ts-conflict-label":"1",style:{display:"flex",alignItems:"center",gap:8,flexWrap:"nowrap"')) {
    throw new Error('conflict timeline label must wrap at 390');
  }
  return out;
}

export function patchSharedTabRowOverflow(source = '', options = {}) {
  const served = options.served === true;
  let js = String(source || '');
  if (js.includes(TAB_ROW_OVERFLOW_NEEDLE)) js = js.replace(TAB_ROW_OVERFLOW_NEEDLE, TAB_ROW_OVERFLOW_PATCH);
  else if (js.includes(TAB_ROW_OVERFLOW_FULLWIDTH_NEEDLE)) {
    js = js.replace(TAB_ROW_OVERFLOW_FULLWIDTH_NEEDLE, TAB_ROW_OVERFLOW_PATCH);
  } else if (js.includes('maxWidth:1120,width:"100%",minWidth:0,boxSizing:"border-box",margin:"0 auto",padding:"20px 16px",overflowX:"clip"},children:[n.jsx("div",{style:{display:"flex",gap:3,marginBottom:20,minWidth:0,maxWidth:"100%",overflowX:"visible"')) {
    js = js.replace(
      'maxWidth:1120,width:"100%",minWidth:0,boxSizing:"border-box",margin:"0 auto",padding:"20px 16px",overflowX:"clip"},children:[n.jsx("div",{style:{display:"flex",gap:3,marginBottom:20,minWidth:0,maxWidth:"100%",overflowX:"visible"',
      'maxWidth:1120,width:"100%",minWidth:0,boxSizing:"border-box",margin:"0 auto",padding:"20px 16px",overflowX:"clip"},children:[n.jsx("div",{style:{display:"flex",gap:3,marginBottom:20,minWidth:0,maxWidth:"100%",overflowX:"clip"',
    );
  } else if (served && js.includes('marginLeft:-8,marginRight:-8,width:"calc(100% + 16px)"')) {
    throw new Error('shared tab row overflow patch did not apply');
  }
  return js;
}

export function patchSharedLayoutOverflow(source = '', options = {}) {
  const served = options.served === true;
  let js = String(source || '');
  if (js.includes(DETAIL_DAYS_GRID_NEEDLE)) js = js.replace(DETAIL_DAYS_GRID_NEEDLE, DETAIL_DAYS_GRID_PATCH);
  else if (served && js.includes('88px 104px minmax(150px, 1fr) 128px')) {
    throw new Error('shared thing detail Days/Timeline grid overflow patch did not apply');
  }
  if (js.includes(DAY_PILL_ROW_NEEDLE)) js = js.replace(DAY_PILL_ROW_NEEDLE, DAY_PILL_ROW_PATCH);
  else if (served && !js.includes('flexWrap:"wrap",maxWidth:"100%",minWidth:0,boxSizing:"border-box"},children:Qa.map')) {
    throw new Error('shared day pill row overflow patch did not apply');
  }
  if (js.includes(DAY_TIMELINE_GRID_NARROW_PATCH)) {
    js = js.replace(DAY_TIMELINE_GRID_NARROW_PATCH, DAY_TIMELINE_GRID_PATCH);
  } else if (js.includes(DAY_TIMELINE_GRID_NEEDLE)) {
    js = js.replace(DAY_TIMELINE_GRID_NEEDLE, DAY_TIMELINE_GRID_PATCH);
  } else if (served && js.includes('gridTemplateColumns:"minmax(52px,64px) 22px minmax(0,1fr)"')) {
    throw new Error('shared day timeline grid time column too narrow for TZ labels');
  } else if (served && js.includes('gridTemplateColumns:"74px 22px 1fr"')) {
    throw new Error('shared day timeline grid overflow patch did not apply');
  }
  if (js.includes(DAY_TIMELINE_TIME_SINGLE_LINE_LEGACY)) {
    js = js.replace(DAY_TIMELINE_TIME_SINGLE_LINE_LEGACY, DAY_TIMELINE_TIME_SINGLE_LINE);
  } else if (!js.includes(DAY_TIMELINE_TIME_SINGLE_LINE) && js.includes(DAY_TIMELINE_TIME_NEEDLE)) {
    js = js.replace(DAY_TIMELINE_TIME_NEEDLE, DAY_TIMELINE_TIME_SINGLE_LINE + DAY_TIMELINE_TIME_NEEDLE);
  } else if (
    served &&
    !js.includes(DAY_TIMELINE_TIME_SINGLE_LINE) &&
    !js.includes('!ua.endTime&&!ua.isConflict?n.jsx("div",{"data-ts-timeline-time":"1"')
  ) {
    throw new Error('day timeline single-line time baseline patch did not apply');
  }
  if (js.includes(DAY_TIMELINE_TITLE_WRAP_NEEDLE)) {
    js = js.replace(DAY_TIMELINE_TITLE_WRAP_NEEDLE, DAY_TIMELINE_TITLE_WRAP_BASELINE);
  } else if (served && !js.includes(DAY_TIMELINE_TITLE_WRAP_BASELINE)) {
    throw new Error('day timeline title baseline patch did not apply');
  }
  return js;
}
