const EVENT_OS_STATIC_NEEDLE =
  'Os=["event","family_event","tickets","bar","music","workout","artist","theatre","sightseeing","tour","transport","other"],pl=G=>';
const EVENT_OS_STATIC_PATCH = 'pl=G=>';
const OS_BEFORE_OA_NEEDLE =
  'tn=q==="events"?Cc:q==="stores"?Fs:q==="hotels"?Po:Oc,Oa=Array.from(new Set((q==="events"?';
const OS_BEFORE_OA_PATCH =
  'tn=q==="events"?Cc:q==="stores"?Fs:q==="hotels"?Po:Oc,Os=[...new Set(Cc.filter(G=>!G.__tsLiveFill&&(!ze.length||ze.includes(En(G)))).map(G=>Yd(G)).filter(Boolean))],Oa=Array.from(new Set((q==="events"?';
const OA_AREAS_NEEDLE = 'Oa=Array.from(new Set(tn.map(G=>En(G)).filter(Boolean))).sort()';
const OA_AREAS_PATCH =
  'Oa=Array.from(new Set((q==="events"?Cc.filter(G=>!G.__tsLiveFill&&(!vt.length||vt.includes(Yd(G)))):q==="restaurants"?Oc.filter(G=>!G.__tsLiveFill&&(!Te.length||Te.every(Re=>or(G).includes(Re)))):q==="stores"?Fs.filter(G=>!G.__tsLiveFill&&(!Je.length||Je.every(Re=>vn(G).includes(Re)))):tn).map(G=>En(G)).filter(Boolean))).sort()';
const EVENTS_LIST_END_NEEDLE = 'tsPad(ki).map(G=>Oe(G))]}),dn&&q==="cars"';
const EVENTS_LIST_END_PATCH =
  'tsPad(ki).map(G=>Oe(G)),tsPad(ki).length===0&&n.jsx("div",{style:{background:"var(--bg-card, white)",border:"1px solid var(--border-faint, #e5e7eb)",borderRadius:12,padding:14,color:"#6b7280",fontSize:13,fontWeight:700},children:"No events match those filters."})]}),dn&&q==="cars"';

export function patchEventsEmptyListMessage(source = '') {
  let js = String(source || '');
  if (js.includes(EVENTS_LIST_END_NEEDLE)) js = js.replace(EVENTS_LIST_END_NEEDLE, EVENTS_LIST_END_PATCH);
  return js;
}

const KI_STALE_NEEDLE =
  'ki=tsPad(Cc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!vt.length||vt.includes(Yd(G)))),';
const KI_STALE_PATCH =
  'ki=tsPad(Cc.filter(G=>{const za=ze.filter(Re=>Oa.includes(Re));const tp=vt.filter(Re=>Os.includes(Re));return(!za.length||za.includes(En(G)))&&(!tp.length||tp.includes(Yd(G)));})),';

const CI_CHIP_NEEDLE =
  'ci=[...new Set(tsListThings(Oc).flatMap(Re=>or(Re).map(zt=>String(zt||"").trim()).filter(Boolean)))],';
const CI_CHIP_PATCH =
  'ci=[...new Set(Oc.filter(G=>!G.__tsLiveFill&&(!ze.length||ze.includes(En(G)))&&(!Te.length||Te.every(Re=>or(G).includes(Re)))).flatMap(Re=>or(Re).map(zt=>String(zt||"").trim()).filter(Boolean)))],';

const STORE_CHIP_NEEDLE =
  '$n=[...new Set(tsListThings(Fs).flatMap(Re=>vn(Re).map(zt=>String(zt||"").trim()).filter(Boolean)))],';
const STORE_CHIP_PATCH =
  '$n=[...new Set(Fs.filter(G=>!G.__tsLiveFill&&(!ze.length||ze.includes(En(G)))&&(!Je.length||Je.every(Re=>vn(G).includes(Re)))).flatMap(Re=>vn(Re).map(zt=>String(zt||"").trim()).filter(Boolean)))],';

const QN_STALE_NEEDLE =
  'Qn=tsPad(Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re)))),';
const QN_STALE_PATCH =
  'Qn=tsPad(Oc.filter(G=>{const za=ze.filter(Re=>Oa.includes(Re));const tp=Te.filter(Re=>ci.includes(Re));return(!za.length||za.includes(En(G)))&&(!tp.length||tp.every(Re=>or(G).includes(Re)));})),';

const GN_STALE_NEEDLE =
  'Gn=tsPad(Fs.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Je.length||Je.every(Re=>vn(G).includes(Re)))),';
const GN_STALE_PATCH =
  'Gn=tsPad(Fs.filter(G=>{const za=ze.filter(Re=>Oa.includes(Re));const tp=Je.filter(Re=>$n.includes(Re));return(!za.length||za.includes(En(G)))&&(!tp.length||tp.every(Re=>vn(G).includes(Re)));})),';

export function patchSharedTabCrossFilters(source = '') {
  let js = String(source || '');
  if (js.includes(EVENT_OS_STATIC_NEEDLE)) js = js.replace(EVENT_OS_STATIC_NEEDLE, EVENT_OS_STATIC_PATCH);
  if (js.includes(OA_AREAS_NEEDLE)) js = js.replace(OA_AREAS_NEEDLE, OA_AREAS_PATCH);
  if (js.includes(OS_BEFORE_OA_NEEDLE)) js = js.replace(OS_BEFORE_OA_NEEDLE, OS_BEFORE_OA_PATCH);
  if (js.includes(CI_CHIP_NEEDLE)) js = js.replace(CI_CHIP_NEEDLE, CI_CHIP_PATCH);
  if (js.includes(STORE_CHIP_NEEDLE)) js = js.replace(STORE_CHIP_NEEDLE, STORE_CHIP_PATCH);
  if (js.includes(QN_STALE_NEEDLE)) js = js.replace(QN_STALE_NEEDLE, QN_STALE_PATCH);
  if (js.includes(GN_STALE_NEEDLE)) js = js.replace(GN_STALE_NEEDLE, GN_STALE_PATCH);
  if (js.includes(KI_STALE_NEEDLE)) js = js.replace(KI_STALE_NEEDLE, KI_STALE_PATCH);
  return js;
}