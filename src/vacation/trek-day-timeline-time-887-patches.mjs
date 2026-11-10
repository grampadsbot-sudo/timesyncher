const TIMELINE_HOTEL_EXIT_TYPE = 'hotel-' + 'check' + 'out';

const UR_FABRICATE_NEEDLE =
  'Ur=(G,Re)=>{const zt=io(G,Re),ua=Ui(G,Re);return ua&&zt?ri(ua,zt):""}';
const UR_STORED_END_LEGACY_NEEDLE =
  'Ur=(G,Re)=>{const zt=Re?Li(G)[String(Re)]:null,ua=ha(G),Rn=String((zt==null?void 0:zt.endTime)||(zt==null?void 0:zt.arrivalTime)||ua.endTime||ua.arrivalTime||Xt(G)||"").trim(),Pn=String(Ui(G,Re)||"").trim();return Rn&&(!Pn||Io(Rn)!==Io(Pn))?Rn:""}';
const UR_STORED_END_PATCH =
  'Ur=(G,Re)=>{const zt=Re?Li(G)[String(Re)]:null,ua=ha(G);let Rn=String((zt==null?void 0:zt.endTime)||(zt==null?void 0:zt.arrivalTime)||ua.endTime||ua.arrivalTime||Xt(G)||"").trim();if(!Rn&&bn(G)){const leg=tsFltStructRange(G);leg&&leg.end&&(Rn=String(leg.end).trim())}const Pn=String(Ui(G,Re)||"").trim();return Rn&&(!Pn||Io(Rn)!==Io(Pn))?Rn:""}';

const CHECKIN_END_NEEDLE =
  'ua.push({type:"hotel-event",time:_i,endTime:ri(_i,30),title:`Check-in: ${mr(wn)}`,item:wn,status:"timeline"})';
const CHECKIN_END_PATCH =
  'ua.push({type:"hotel-event",time:_i,endTime:"",title:`Check-in: ${mr(wn)}`,item:wn,status:"timeline"})';

const CHECKOUT_END_NEEDLE =
  'ua.push({type:"' +
  TIMELINE_HOTEL_EXIT_TYPE +
  '",time:Qi,endTime:ri(Qi,60),title:`Check-out: ${mr(wn)}`,item:wn,status:"timeline"})';
const CHECKOUT_END_PATCH =
  'ua.push({type:"' +
  TIMELINE_HOTEL_EXIT_TYPE +
  '",time:Qi,endTime:"",title:`Check-out: ${mr(wn)}`,item:wn,status:"timeline"})';

const FLIGHT_PUSH_NEEDLE =
  'ua.push({type:"flight",time:Qi.start,endTime:Qi.end,title:mr(wn),item:wn,status:hs(wn)})';
const FLIGHT_PUSH_PATCH =
  'ua.push({type:"flight",time:Ui(wn,G.id)||Tt(wn)||(tsFltStructRange(wn)||{}).start||Qi.start,endTime:Ur(wn,G.id),title:mr(wn),item:wn,status:hs(wn)})';

const TRAVEL_TO_END_NEEDLE =
  'endTime:(nr==null?void 0:nr.start)||Qi.start,title:"Travel to airport"';
const TRAVEL_TO_END_PATCH = 'endTime:"",title:"Travel to airport"';

const TRAVEL_FROM_END_NEEDLE =
  'endTime:ri((Oo==null?void 0:Oo.end)||Qi.end,90),title:"Travel from airport"';
const TRAVEL_FROM_END_PATCH = 'endTime:"",title:"Travel from airport"';

const TIMELINE_END_RENDER_NEEDLE =
  'ua.endTime?n.jsxs(n.Fragment,{children:[n.jsx("br",{}),n.jsx("span",{style:{fontWeight:500,color:ua.isConflict?"#ef4444":"#9ca3af"},children:Yo(ua.endTime)})]}):null';
const TIMELINE_END_RENDER_PATCH =
  'ua.endTime&&Io(ua.endTime)!==Io(ua.time)?n.jsxs(n.Fragment,{children:[n.jsx("br",{}),n.jsx("span",{style:{fontWeight:500,color:ua.isConflict?"#ef4444":"#9ca3af"},children:tsTimelineRowEnd(ua)})]}):null';

const CAR_END_RI_NEEDLE = 'endTime:Ur(wn,G.id)||ri(tsCarTm,45)';
const CAR_END_STORED_PATCH = 'endTime:Ur(wn,G.id)||""';

function replaceNeedle(js, needle, patch, { served, label }) {
  if (js.includes(patch)) return js;
  if (js.includes(needle)) return js.replace(needle, patch);
  if (served) {
    throw new Error(`day timeline #887 ${label} patch did not apply`);
  }
  return js;
}

export function patchDayTimelineStoredTimes887(js = '', options = {}) {
  const served = options.served === true;
  let out = String(js || '');

  out = replaceNeedle(out, UR_FABRICATE_NEEDLE, UR_STORED_END_PATCH, { served, label: 'Ur stored end' });
  out = replaceNeedle(out, UR_STORED_END_LEGACY_NEEDLE, UR_STORED_END_PATCH, { served, label: 'Ur stored end legacy' });
  out = replaceNeedle(out, CHECKIN_END_NEEDLE, CHECKIN_END_PATCH, { served, label: 'check-in end' });
  out = replaceNeedle(out, CHECKOUT_END_NEEDLE, CHECKOUT_END_PATCH, { served, label: 'check-out end' });
  out = replaceNeedle(out, FLIGHT_PUSH_NEEDLE, FLIGHT_PUSH_PATCH, { served, label: 'flight row' });
  out = replaceNeedle(out, TRAVEL_TO_END_NEEDLE, TRAVEL_TO_END_PATCH, { served, label: 'travel to airport end' });
  out = replaceNeedle(out, TRAVEL_FROM_END_NEEDLE, TRAVEL_FROM_END_PATCH, { served, label: 'travel from airport end' });
  out = replaceNeedle(out, TIMELINE_END_RENDER_NEEDLE, TIMELINE_END_RENDER_PATCH, { served, label: 'timeline end render' });

  if (out.includes(CAR_END_RI_NEEDLE)) {
    out = out.replaceAll(CAR_END_RI_NEEDLE, CAR_END_STORED_PATCH);
  } else if (served && out.includes('ri(tsCarTm,45)')) {
    throw new Error('day timeline #887 car end ri() patch did not apply');
  }

  return out;
}
