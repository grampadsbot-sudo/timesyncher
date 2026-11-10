import { patchDayTimelineStoredTimes887 } from './trek-day-timeline-time-887-patches.mjs';
import { patchFlightTimezone887Core, patchFlightTimelineDisplay887 } from './trek-flight-timezone-887-patches.mjs';

export { patchFlightTimelineDisplay887 };

export const CONFLICT_LOOP_NEEDLE =
  'for(const wn of ua){const Qi=Io(wn.time);if(Qi===99999){js.push(wn);continue}const nr=Io(wn.endTime);if(nr===99999){js.push(wn);continue}const Oo=nr<=Qi?nr+1440:nr,_i=zl.find(di=>Qi<di.end&&Oo>di.start),Eo=wn.type==="airport-restaurant"&&_i&&["flight","travel"].includes(_i.type);_i&&wn.type!=="travel"&&wn.type!=="travel-to-thing"&&!Eo?js.push({...wn,isConflict:!0,conflictWith:_i.title}):(js.push(wn),zl.push({start:Qi,end:Oo,title:wn.title,type:wn.type}))}';

export const CONFLICT_LOOP_PATCH =
  'for(const wn of ua){const Qi=Io(wn.time);if(Qi===99999){js.push(wn);continue}const nr=Io(wn.endTime);const Oo=nr===99999?Qi+1:nr<=Qi?nr+1440:nr;const _i=zl.find(di=>Qi<di.end&&Oo>di.start),Eo=wn.type==="airport-restaurant"&&_i&&["flight","travel"].includes(_i.type);_i&&wn.type!=="travel"&&wn.type!=="travel-to-thing"&&wn.type!=="hotel-wake"&&wn.type!=="hotel-sleep"&&!Eo?js.push({...wn,isConflict:!0,conflictWith:_i.title}):(js.push(wn),nr!==99999&&zl.push({start:Qi,end:Oo,title:wn.title,type:wn.type}))}';

const CAR_DAY_LOOP_NEEDLE = 'for(const wn of zt){if(!wn)continue;const Qi=xl(mr(wn)||wn.name||wn.description||"")||xl(wn.name||wn.description||"");if(Qi&&/flight/i.test(wn.name||"")){';
const CAR_DAY_LOOP_PATCH = 'for(const wn of zt){if(Mi(wn)&&Ds(wn)){const tsCarDays=Yi(wn).map(ua=>ve(ua)).filter(Boolean);if(tsCarDays.length){const tsCarStart=Math.min(...tsCarDays),tsCarEnd=Math.max(...tsCarDays);if(G.day_number===tsCarStart){const tsCarTm=Ui(wn,G.id)||Xi(wn)||"";tsCarTm&&ua.push({type:"place",time:tsCarTm,endTime:Ur(wn,G.id)||"",title:`Pickup: ${(ha(wn).rentalCompany||mr(wn))}`,item:wn,status:hs(wn)})}if(G.day_number===tsCarEnd&&tsCarEnd!==tsCarStart){const tsCarTm=Ui(wn,G.id)||Xi(wn)||"";tsCarTm&&ua.push({type:"place",time:tsCarTm,endTime:Ur(wn,G.id)||"",title:`Drop-off: ${(ha(wn).rentalCompany||mr(wn))}`,item:wn,status:hs(wn)})}}}if(!wn)continue;if(Mi(wn))continue;const Qi=xl(mr(wn)||wn.name||wn.description||"")||xl(wn.name||wn.description||"");if(Qi&&/flight/i.test(wn.name||"")){';

const FLIGHT_DAY_TIMELINE_NEEDLE = 'if(Qi&&/flight/i.test(wn.name||"")){';
const FLIGHT_DAY_TIMELINE_PATCH = 'if(Qi&&bn(wn)&&Ds(wn)&&/flight/i.test(wn.name||"")){';

const MR_FLIGHT_TITLE_STRIP_NEEDLE = 'return bn(G)?String(Re).replace(/^\\s*Flight option:\\s*/i,""):Re';
const MR_FLIGHT_TITLE_STRIP_PATCH = 'return Re';

const MR_TITLE_BIND_NEEDLE =
  'mr=G=>{var zt;const Re=((zt=le[Qt(G)])==null?void 0:zt.title)??(G.title||G.name||"");return Re}';
const MR_TITLE_BIND_PATCH =
  'mr=G=>{var tsOv,tsPl,tsPid;tsPid=G&&(G.place_id??(G.place&&G.place.id));tsPl=tsPid?((typeof Ft<"u"&&Ft.get(tsPid))||((Gt||[]).find(p=>p&&String(p.id)===String(tsPid)))||null):null;tsOv=le[Qt(G)]||{};const Re=String((tsPl&&(tsPl.name||tsPl.title))||tsOv.name||G.name||"").trim();return Re}';

export function applyFlightDayTimelinePatches(js, { served }) {
  let out = patchFlightTimezone887Core(js, { served });
  if (out.includes(CAR_DAY_LOOP_NEEDLE)) out = out.replace(CAR_DAY_LOOP_NEEDLE, CAR_DAY_LOOP_PATCH);
  else if (served && !out.includes('Pickup: ${(ha(wn).rentalCompany||mr(wn))}')) {
    throw new Error('car pickup/drop-off day timeline patch did not apply');
  }
  if (out.includes(FLIGHT_DAY_TIMELINE_NEEDLE)) {
    out = out.replace(FLIGHT_DAY_TIMELINE_NEEDLE, FLIGHT_DAY_TIMELINE_PATCH);
  } else if (served && !out.includes('bn(wn)&&Ds(wn)&&/flight/i.test(wn.name||"")')) {
    throw new Error('day timeline flight synthesis must bind to timeline-picked flights');
  }
  if (out.includes(MR_FLIGHT_TITLE_STRIP_NEEDLE)) {
    out = out.replace(MR_FLIGHT_TITLE_STRIP_NEEDLE, MR_FLIGHT_TITLE_STRIP_PATCH);
  } else if (served && out.includes('Flight option:\\s*')) {
    throw new Error('flight title strip patch did not apply');
  }
  if (out.includes(MR_TITLE_BIND_NEEDLE)) {
    out = out.replace(MR_TITLE_BIND_NEEDLE, MR_TITLE_BIND_PATCH);
  } else if (served && !out.includes('tsPl.name||tsPl.title))||tsOv.name||G.name')) {
    throw new Error('stored place name mr() binding patch did not apply');
  }
  out = patchDayTimelineStoredTimes887(out, { served });
  if (out.includes(CONFLICT_LOOP_NEEDLE)) {
    out = out.replace(CONFLICT_LOOP_NEEDLE, CONFLICT_LOOP_PATCH);
  } else if (served && !out.includes('nr===99999?Qi+1')) {
    throw new Error('day timeline in-transit conflict loop patch did not apply');
  }
  return out;
}
