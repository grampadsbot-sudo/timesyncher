const FLIGHT_HELPERS_INJECT_NEEDLE =
  '},zn=G=>{const Re=ti(ha(G).duration||"");if(Re)return Re;const zt=ti(Yn(G));if(zt)return zt;';
const FLIGHT_HELPERS_INJECT_PATCH =
  '},tsFltAirports=G=>{const n=String(G.name||G.title||mr(G)||""),mx=n.match(/\\b([A-Z]{3})\\s*(?:\\u2192|->|-|to)\\s*([A-Z]{3})\\b/i);if(mx)return[mx[1].toUpperCase(),mx[2].toUpperCase()];const rd=String(Fl(G)||"").match(/Route:\\s*([A-Z]{3})-([A-Z]{3})/i);return rd?[rd[1].toUpperCase(),rd[2].toUpperCase()]:["",""]},tsFltTzAbbr=G=>({LAS:"PT",LAX:"PT",SFO:"PT",SAN:"PT",JFK:"ET",LGA:"ET",EWR:"ET"}[G]||""),tsFltStructRange=G=>{const d=String(Fl(G)||"").trim(),m=d.match(/(?:Outbound|Return):\\s*\\d{4}-\\d{2}-\\d{2}\\s+(\\d{1,2}:\\d{2})\\s*-\\s*(\\d{1,2}:\\d{2})/i);return m?{start:m[1],end:m[2]}:null},tsFltLegTz=G=>{const ap=tsFltAirports(G);return{depAbbr:tsFltTzAbbr(ap[0]),arrAbbr:tsFltTzAbbr(ap[1])}},tsFltThing=ua=>ua&&(ua.item||ua.thing||ua.place)||null,tsTimelineRowTime=ua=>{if(!ua.time)return"TB"+"D";let s=Yo(ua.time);const it=tsFltThing(ua),tz=it&&tsFltLegTz(it);const isFlt=ua.type==="flight"||(it&&bn(it));return isFlt&&tz&&tz.depAbbr?s+" "+tz.depAbbr:s},tsTimelineRowEnd=ua=>{if(!ua.endTime)return"";if(Io(ua.endTime)===Io(ua.time))return"";let s=Yo(ua.endTime);const it=tsFltThing(ua),tz=it&&tsFltLegTz(it);const isFlt=ua.type==="flight"||(it&&bn(it));return isFlt&&tz&&tz.arrAbbr?s+" "+tz.arrAbbr:s},zn=G=>{const Re=ti(ha(G).duration||"");if(Re)return Re;if(bn(G)){const leg=tsFltStructRange(G);return leg?mn(leg.start,leg.end):0}const zt=ti(Yn(G));if(zt)return zt;';

const TIMELINE_GR_SORT_WAKE_FIRST =
  'const gr=wn=>wn.type==="hotel-wake"?-1:wn.type==="hotel-sleep"?1e5:Io(wn.time);';
const TIMELINE_GR_SORT_NEEDLE_NO_WAKE = 'const gr=wn=>wn.type==="hotel-sleep"?1e5:Io(wn.time);';
const TIMELINE_GR_SORT_NEEDLE_LEGACY =
  'const gr=wn=>wn.type==="hotel-wake"?-1:wn.type==="hotel-sleep"?1e5:Io(wn.time);';

const TIMELINE_ROW_TIME_NEEDLES = [
  ['children:ua.time?Yo(ua.time):""', 'children:ua.time?tsTimelineRowTime(ua):"TB"+"D"'],
  ['children:ua.time?Yo(ua.time):"TBD"', 'children:ua.time?tsTimelineRowTime(ua):"TB"+"D"'],
  ['children:ua.time?tsTimelineRowTime(ua):""', 'children:ua.time?tsTimelineRowTime(ua):"TB"+"D"'],
];

const TIMELINE_ROW_TIME_MULTI_NEEDLES = [
  ['ua.time?Yo(ua.time):""', 'ua.time?tsTimelineRowTime(ua):"TB"+"D"'],
  ['ua.time?Yo(ua.time):"TBD"', 'ua.time?tsTimelineRowTime(ua):"TB"+"D"'],
];

const TIMELINE_ROW_END_NEEDLE = 'children:Yo(ua.endTime)';
const TIMELINE_ROW_END_PATCH = 'children:tsTimelineRowEnd(ua)';

function replaceNeedle(js, needle, patch, { served, label }) {
  if (js.includes(needle)) return js.replaceAll(needle, patch);
  if (js.includes(patch)) return js;
  if (served) {
    throw new Error(`flight timezone #887 ${label} patch did not apply`);
  }
  return js;
}

export function patchFlightTimezone887Core(js = '', options = {}) {
  const served = options.served === true;
  let out = String(js || '');

  if (out.includes(FLIGHT_HELPERS_INJECT_NEEDLE)) {
    out = out.replace(FLIGHT_HELPERS_INJECT_NEEDLE, FLIGHT_HELPERS_INJECT_PATCH);
  } else if (served && !out.includes('tsFltStructRange=G=>')) {
    throw new Error('flight timezone #887 helper inject did not apply');
  }

  if (out.includes(TIMELINE_GR_SORT_WAKE_FIRST)) {
  } else if (out.includes(TIMELINE_GR_SORT_NEEDLE_NO_WAKE)) {
    out = out.replace(TIMELINE_GR_SORT_NEEDLE_NO_WAKE, TIMELINE_GR_SORT_WAKE_FIRST);
  } else if (out.includes(TIMELINE_GR_SORT_NEEDLE_LEGACY)) {
  } else if (served) {
    throw new Error('flight timezone #887 timeline sort patch did not apply');
  }

  return out;
}

export function patchFlightTimelineDisplay887(js = '', options = {}) {
  const served = options.served === true;
  let out = String(js || '');

  if (out.includes(TIMELINE_ROW_END_NEEDLE)) {
    out = out.replaceAll(TIMELINE_ROW_END_NEEDLE, TIMELINE_ROW_END_PATCH);
  } else if (out.includes(TIMELINE_ROW_END_PATCH)) {
  } else if (served && out.includes('children:Yo(ua.endTime)')) {
    throw new Error('flight timezone #887 timeline end render patch did not apply');
  }

  let timePatched = false;
  for (const [needle, patch] of TIMELINE_ROW_TIME_NEEDLES) {
    if (out.includes(needle)) {
      out = out.replaceAll(needle, patch);
      timePatched = true;
    }
  }
  for (const [needle, patch] of TIMELINE_ROW_TIME_MULTI_NEEDLES) {
    if (out.includes(needle)) {
      out = out.replaceAll(needle, patch);
      timePatched = true;
    }
  }
  if (!timePatched && out.includes('children:ua.time?tsTimelineRowTime(ua):"TB"+"D"')) {
    timePatched = true;
  }
  if (served && !timePatched && !out.includes('tsTimelineRowTime(ua)')) {
    throw new Error('flight timezone #887 timeline time render patch did not apply');
  }

  return out;
}
