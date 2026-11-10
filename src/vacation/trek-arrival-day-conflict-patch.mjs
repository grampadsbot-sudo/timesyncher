const CONFLICT_LOOP_TAIL_NEEDLE =
  '_i&&wn.type!=="travel"&&wn.type!=="travel-to-thing"&&!Eo?js.push({...wn,isConflict:!0,conflictWith:_i.title}):(js.push(wn),zl.push({start:Qi,end:Oo,title:wn.title,type:wn.type}))}return js.filter(wn=>{';

const CONFLICT_LOOP_TAIL_PATCH =
  '_i&&wn.type!=="travel"&&wn.type!=="travel-to-thing"&&!Eo?js.push({...wn,isConflict:!0,conflictWith:_i.title}):(js.push(wn),zl.push({start:Qi,end:Oo,title:wn.title,type:wn.type}))}const tsLandFlight=js.find(wn=>wn.type==="flight"&&wn.endTime&&Io(wn.endTime)!==99999);if(tsLandFlight){const tsLand=Io(tsLandFlight.endTime);for(let tsIdx=0;tsIdx<js.length;tsIdx+=1){const row=js[tsIdx];if(row.isConflict)continue;if(!row.time||Io(row.time)===99999)continue;const rowType=String(row.type||"");if(rowType==="travel"||rowType==="travel-to-thing"||rowType==="flight"||rowType==="transport"||rowType==="hotel-wake"||rowType==="hotel-sleep"||rowType==="hotel-checkout")continue;if(Io(row.time)<tsLand)js[tsIdx]={...row,isConflict:!0,conflictWith:tsLandFlight.title||"your flight"};}}return js.filter(wn=>{';

const CONFLICT_LABEL_WRAP_NEEDLE =
  '"data-ts-conflict-label":"1",style:{display:"flex",alignItems:"center",gap:8,flexWrap:"nowrap",width:"100%",minWidth:0,color:"#b91c1c",fontSize:11,fontWeight:900,marginBottom:6,lineHeight:1.35,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},children:[n.jsx("span",{style:{width:34,height:2,background:"#ef4444",display:"inline-block",flexShrink:0}}),"Conflict with ",Bs(ua.conflictWith||"another timeline item")]';

const CONFLICT_LABEL_WRAP_PATCH =
  '"data-ts-conflict-label":"1",style:{display:"flex",alignItems:"flex-start",gap:8,flexWrap:"wrap",width:"100%",minWidth:0,maxWidth:"100%",boxSizing:"border-box",color:"#b91c1c",fontSize:11,fontWeight:900,marginBottom:6,lineHeight:1.35,overflowWrap:"anywhere",wordBreak:"break-word"},children:[n.jsx("span",{style:{width:34,height:2,background:"#ef4444",display:"inline-block",flexShrink:0,marginTop:6}}),n.jsx("span",{"data-ts-conflict-text":"1",style:{minWidth:0,flex:"1 1 0",maxWidth:"100%"},children:["Conflict with ",Bs(ua.conflictWith||"another timeline item")]})]';

export function patchArrivalDayTimelineConflicts(js, { served } = {}) {
  let out = String(js || '');
  if (out.includes(CONFLICT_LOOP_TAIL_NEEDLE)) {
    out = out.replace(CONFLICT_LOOP_TAIL_NEEDLE, CONFLICT_LOOP_TAIL_PATCH);
  } else if (served && !out.includes('tsLandFlight=js.find(wn=>wn.type==="flight"')) {
    throw new Error('arrival-day landing conflict patch did not apply');
  }
  if (out.includes(CONFLICT_LABEL_WRAP_NEEDLE)) {
    out = out.replace(CONFLICT_LABEL_WRAP_NEEDLE, CONFLICT_LABEL_WRAP_PATCH);
  } else if (served && !out.includes('data-ts-conflict-text":"1"')) {
    throw new Error('conflict label wrap patch did not apply');
  }
  return out;
}
