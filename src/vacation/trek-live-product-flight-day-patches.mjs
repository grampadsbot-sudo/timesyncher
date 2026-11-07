const CAR_DAY_LOOP_NEEDLE = 'for(const wn of zt){if(!wn)continue;const Qi=xl(mr(wn)||wn.name||wn.description||"")||xl(wn.name||wn.description||"");if(Qi&&/flight/i.test(wn.name||"")){';
const CAR_DAY_LOOP_PATCH = 'for(const wn of zt){if(Mi(wn)&&Ds(wn)){const tsCarDays=Yi(wn).map(ua=>ve(ua)).filter(Boolean);if(tsCarDays.length){const tsCarStart=Math.min(...tsCarDays),tsCarEnd=Math.max(...tsCarDays);if(G.day_number===tsCarStart){const tsCarTm=Ui(wn,G.id)||Xi(wn)||"";tsCarTm&&ua.push({type:"place",time:tsCarTm,endTime:Ur(wn,G.id)||ri(tsCarTm,45),title:`Pickup: ${(ha(wn).rentalCompany||mr(wn))}`,item:wn,status:hs(wn)})}if(G.day_number===tsCarEnd&&tsCarEnd!==tsCarStart){const tsCarTm=Ui(wn,G.id)||Xi(wn)||"";tsCarTm&&ua.push({type:"place",time:tsCarTm,endTime:Ur(wn,G.id)||ri(tsCarTm,45),title:`Drop-off: ${(ha(wn).rentalCompany||mr(wn))}`,item:wn,status:hs(wn)})}}}if(!wn)continue;if(Mi(wn))continue;const Qi=xl(mr(wn)||wn.name||wn.description||"")||xl(wn.name||wn.description||"");if(Qi&&/flight/i.test(wn.name||"")){';

const FLIGHT_DAY_TIMELINE_NEEDLE = 'if(Qi&&/flight/i.test(wn.name||"")){';
const FLIGHT_DAY_TIMELINE_PATCH = 'if(Qi&&bn(wn)&&Ds(wn)&&/flight/i.test(wn.name||"")){';

const MR_FLIGHT_TITLE_STRIP_NEEDLE = 'return bn(G)?String(Re).replace(/^\\s*Flight option:\\s*/i,""):Re';
const MR_FLIGHT_TITLE_STRIP_PATCH = 'return Re';

export function applyFlightDayTimelinePatches(js, { served }) {
  let out = js;
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
  return out;
}
