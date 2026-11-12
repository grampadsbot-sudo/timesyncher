export function listRowDateRange({ category, thing = {}, trip = {}, days = [], dayIds = [], depZone = '', arrZone = '' } = {}) {
  const proseCalendarDate = /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/;
  const englishMonthIndex = (() => {
    const byLabel = new Map();
    for (let month = 0; month < 12; month += 1) {
      const anchor = new Date(Date.UTC(2020, month, 15));
      for (const style of ['short', 'long']) {
        const label = new Intl.DateTimeFormat('en', { month: style, timeZone: 'UTC' }).format(anchor);
        byLabel.set(label.toLowerCase(), month + 1);
      }
    }
    return byLabel;
  })();
  const row = { ...thing.sourceRecord, ...thing };
  const date = (value) => {
    const match = String(value ?? '').match(/^\d{4}-\d{2}-\d{2}/);
    if (!match) return null;
    const stamp = Date.parse(`${match[0]}T00:00:00Z`);
    return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === match[0] ? stamp : null;
  };
  const first = days.find((day) => Number(day.day_number) === 1);
  const base = date(trip.start_date) ?? date(first?.date);
  const dayOf = (value) => {
    const stamp = date(value);
    return stamp !== null && base !== null ? Math.round((stamp - base) / 86400000) + 1 : null;
  };
  const selected = dayIds.map((id) => days.find((day) => String(day.id) === String(id)))
    .filter(Boolean).map((day) => Number(day.day_number)).filter(Number.isFinite).sort((a, b) => a - b);
  const number = (value) => value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
  const writtenDate = (value) => {
    const text = String(value ?? '');
    const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (iso) return iso[0];
    const named = text.match(proseCalendarDate);
    if (!named) return '';
    const month = englishMonthIndex.get(named[1].toLowerCase());
    if (!month) return '';
    const proseIso = `${named[3]}-${String(month).padStart(2, '0')}-${String(named[2]).padStart(2, '0')}`;
    const stamp = Date.parse(`${proseIso}T00:00:00Z`);
    return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
  };
  const range = (start, end, startLabel, endLabel) => {
    const left = start == null ? '' : `Day ${start} ${startLabel}`;
    const right = end == null ? '' : `${end === start ? '' : `Day ${end} `}${endLabel}`;
    return [left, right].filter(Boolean).join(' - ');
  };
  if (category === 'hotel') {
    const start = dayOf(row.checkInDate ?? row.check_in_date) ?? selected[0] ?? null;
    const end = dayOf(row.checkOutDate ?? row.check_out_date) ?? (selected.length ? selected.at(-1) + 1 : null);
    return range(start, end, 'Check-in', 'Check-out');
  }
  if (category === 'car') {
    const start = dayOf(row.pickupDate ?? row.pickup_date ?? row.start_date ?? writtenDate(row.startTime))
      ?? number(row.pickupDay) ?? selected[0] ?? null;
    const end = dayOf(row.returnDate ?? row.dropoffDate ?? row.return_date ?? row.end_date ?? writtenDate(row.endTime))
      ?? number(row.dropoffDay) ?? selected.at(-1) ?? null;
    return range(start, end, 'Pickup', 'Drop-off');
  }
  if (category !== 'flight') return '';
  const text = [row.externalId, row.ccabKey, row.sourceRecord?.ccabKey, row.details, row.notes].filter(Boolean).join('; ');
  const clock = '(\\d{1,2}:\\d{2}(?::\\d{2})?\\s*(?:AM|PM)?(?:\\s+(?:[A-Z]{2,5}|[A-Za-z_]+/[A-Za-z_]+))?)';
  const pair = text.match(new RegExp(`(\\d{4}-\\d{2}-\\d{2})[ T]+${clock}\\s*[-–—]\\s*(?:(\\d{4}-\\d{2}-\\d{2})[ T]+)?${clock}(?:\\s*\\+(\\d+))?`, 'i'));
  const prose = text.match(new RegExp(`leaving\\s+(\\d{4}-\\d{2}-\\d{2})\\s+at\\s+${clock}\\s+and\\s+landing\\s+at\\s+${clock}`, 'i'));
  const depDate = row.departureDate ?? row.departure_date ?? row.start_date ?? (writtenDate(row.departure) || pair?.[1] || prose?.[1]);
  const depTime = row.departureTime ?? row.startTime ?? row.departure ?? row.start_time ?? row.place_time ?? pair?.[2] ?? prose?.[2];
  const arrTime = row.arrivalTime ?? row.endTime ?? row.arrival ?? row.end_time ?? pair?.[4] ?? prose?.[3];
  const minutes = (value) => {
    const match = String(value ?? '').match(/(?:T|^)(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
    if (!match) return null;
    let hour = Number(match[1]);
    if (Number(match[2]) > 59 || hour > (match[3] ? 12 : 23) || (match[3] && hour < 1)) return null;
    if (match[3]) hour = hour % 12 + (/pm/i.test(match[3]) ? 12 : 0);
    return hour * 60 + Number(match[2]);
  };
  const start = dayOf(depDate) ?? number(row.departureDay) ?? selected[0] ?? null;
  const format = (value, zone, eventDay, fallback) => {
    const mins = minutes(value);
    if (mins == null) return '';
    const suffix = String(value ?? '').match(/\s([A-Z]{2,5}|[A-Za-z_]+\/[A-Za-z_]+)$/i)?.[1];
    let tz = String(zone || (suffix && !/^(AM|PM)$/i.test(suffix) ? suffix : '') || fallback).trim();
    const zones = { PT: 'America/Los_Angeles', ET: 'America/New_York', CT: 'America/Chicago', MT: 'America/Denver' };
    tz = zones[tz.toUpperCase()] || tz;
    if (tz.includes('/')) {
      const stamp = base !== null && eventDay !== null ? base + (eventDay - 1) * 86400000 + 43200000 : null;
      if (stamp !== null) {
        try { tz = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(stamp).find((part) => part.type === 'timeZoneName')?.value || ''; }
        catch { tz = ''; }
      } else tz = '';
    }
    const hour = Math.floor(mins / 60);
    return `${hour % 12 || 12}:${String(mins % 60).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}${tz ? ` ${tz}` : ''}`;
  };
  const depart = format(depTime, row.departureTimezone || row.departureTimeZone, start, depZone);
  const provisionalArrival = format(arrTime, row.arrivalTimezone || row.arrivalTimeZone, start, arrZone);
  const offsets = { PST: -480, PDT: -420, MST: -420, MDT: -360, CST: -360, CDT: -300, EST: -300, EDT: -240, UTC: 0, GMT: 0 };
  const depOffset = offsets[depart.split(' ').at(-1)];
  const arrOffset = offsets[provisionalArrival.split(' ').at(-1)];
  const overnight = depOffset != null && arrOffset != null && minutes(arrTime) != null && minutes(depTime) != null
    && minutes(arrTime) - arrOffset < minutes(depTime) - depOffset;
  const offset = pair?.[5] != null ? Number(pair[5]) : overnight ? 1 : 0;
  const end = dayOf(row.arrivalDate ?? row.arrival_date ?? row.end_date ?? (writtenDate(row.arrival) || pair?.[3]))
    ?? number(row.arrivalDay) ?? (selected.length > 1 ? selected.at(-1) : start == null ? null : start + offset);
  const arrive = format(arrTime, row.arrivalTimezone || row.arrivalTimeZone, end, arrZone);
  return range(depart ? start : null, arrive ? end : null, `Depart ${depart}`, `Arrive ${arrive}`);
}

export function patchListRowDates(source = '') {
  if (source.includes('"data-ts-travel-list-header":"1"')) return source;
  const start = source.indexOf('Oe=(G,Re,zt=!1)=>');
  const header = source.indexOf('sr=n.jsxs("span",{"data-ts-thing-header":"1"', start);
  const end = source.indexOf(',Xr=fo(G)', header);
  if (start < 0 || header < 0 || end < 0) throw new Error('list dates header anchors missing');
  const original = source.slice(header + 3, end);
  const travel = 'n.jsxs("span",{"data-ts-thing-header":"1","data-ts-travel-list-header":"1",style:{display:"flex",flexDirection:"column",gap:6,width:"100%",minWidth:0},children:[n.jsxs("span",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,minWidth:0,width:"100%"},children:[n.jsxs("span",{"data-ts-logo-name-pair":"1",style:{display:"inline-flex",alignItems:"center",gap:6,minWidth:0,flex:"1 1 0"},children:[n.jsx(dc,{item:G}),n.jsx("span",{"data-ts-list-row-name":"1",style:{minWidth:0,whiteSpace:"normal",overflowWrap:"anywhere"},children:n.jsx("strong",{children:ua})})]}),n.jsx("span",{"data-ts-list-price":"1",style:{whiteSpace:"nowrap",flexShrink:0,color:"#0f766e",fontWeight:900},children:bn(G)?eu(G)[1]:ie(G)?ie(G)+(Zi(G)?" / night":" total"):""})]}),n.jsxs("span",{"data-ts-list-dates-row":"1",style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:4,width:"100%",minWidth:0},children:[n.jsx("span",{"data-ts-list-row-rating":"1",style:{display:"flex",flexDirection:"row",flexWrap:"nowrap",alignItems:"center",justifyContent:"flex-start",flexShrink:0},dangerouslySetInnerHTML:{__html:tsRowStars},role:tsRowStars?"img":void 0,"aria-label":tsRowStars?tsStarRatingAria(tsRowRating):void 0}),n.jsx("span",{"data-ts-list-date-range":"1",style:{whiteSpace:"nowrap",textAlign:"right",marginLeft:"auto",fontSize:"clamp(7px,2.55vw,11px)",fontWeight:700},children:tsListDateRange({category:It(G),thing:{...G,...ha(G),...(Zi(G)?{checkInDate:Ar(G),checkOutDate:hn(G)}:{})},trip:la,days:Qa,dayIds:Yi(G),depZone:bn(G)?tsFltLegTz(G).depAbbr:"",arrZone:bn(G)?tsFltLegTz(G).arrAbbr:""})})]})]})';
  const props = (expression) => expression.slice('n.jsxs("span",'.length, -1);
  const rowEnd = source.indexOf(',tt=G=>', end);
  if (rowEnd < 0) throw new Error('list dates row boundary missing');
  const body = source.slice(end, rowEnd).replaceAll('"data-ts-thing-key":Qt(G),', '"data-ts-thing-key":Qt(G),"data-ts-list-row":(bn(G)||Zi(G)||Mi(G))?"1":void 0,');
  const patched = source.slice(0, header) + `sr=n.jsxs("span",(bn(G)||Zi(G)||Mi(G))?${props(travel)}:${props(original)})` + body + source.slice(rowEnd);
  if (patched.includes('tsListDateRange=function listRowDateRange')) return patched;
  return patched.replace('Oe=(G,Re,zt=!1)=>', `tsListDateRange=${listRowDateRange.toString()},Oe=(G,Re,zt=!1)=>`);
}
