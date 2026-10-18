const TIMELINE_ICON_NEEDLE = 'n.jsx("div",{style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,marginTop:ua.isConflict?0:3.5,display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box"},children:Xr?n.jsx("img",{src:Xr,alt:"",loading:"lazy",style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,objectFit:"contain",display:"block",filter:"drop-shadow(0 1px 1px rgba(15,23,42,0.12))"}}):n.jsx("span",{style:{fontSize:ua.isConflict?14:17,lineHeight:1,transform:"translateY(0.5px)"},children:sr})})';
const TIMELINE_ICON_PATCH = 'n.jsx("div",{"data-ts-timeline-icon":"1","data-ts-category-tab-icon":"1","aria-hidden":"true",style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,marginTop:ua.isConflict?0:3.5,display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box"},children:Xr?n.jsx("img",{"data-logo-src":Xr,src:Xr,alt:"",loading:"lazy",style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,objectFit:"contain",display:"block",filter:"drop-shadow(0 1px 1px rgba(15,23,42,0.12))"}}):n.jsx("span",{"data-ts-tab-emoji":"1",style:{display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1,width:ua.isConflict?18:22,height:ua.isConflict?18:22},children:n.jsx("canvas",{width:32,height:32,ref:function(el){tsPaintTabEmoji(el,sr)},style:{width:ua.isConflict?18:22,height:ua.isConflict?18:22,display:"block"}})})})';
const TIMELINE_TITLE_NEEDLE = 'n.jsx("button",{onClick:()=>Ne(Qt(ua.item)),style:{border:0,padding:0,background:"transparent",cursor:"pointer",fontSize:13,fontWeight:600,lineHeight:1.15,color:"#111827",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3,textAlign:"left"},children:Pn})';
const TIMELINE_TITLE_PATCH = 'n.jsx("button",{"data-ts-timeline-title":"1",onClick:()=>Ne(Qt(ua.item)),style:{border:0,padding:0,background:"transparent",cursor:"pointer",fontSize:13,fontWeight:600,lineHeight:1.15,color:"#111827",textDecoration:"underline",textDecorationColor:"#cbd5e1",textUnderlineOffset:3,textAlign:"left"},children:Pn})';
const TIMELINE_TITLE_PAD_NEEDLE = 'style:ua.isConflict?{marginLeft:26,borderLeft:"3px solid #60a5fa",paddingLeft:12,background:"#eff6ff",borderRadius:10,paddingTop:6,paddingBottom:6,paddingRight:10}:{paddingTop:1}';
const TIMELINE_TITLE_PAD_PATCH = 'style:ua.isConflict?{marginLeft:26,borderLeft:"3px solid #60a5fa",paddingLeft:12,background:"#eff6ff",borderRadius:10,paddingTop:6,paddingBottom:6,paddingRight:10,display:"flex",flexDirection:"column",alignItems:"flex-start",gap:4,minWidth:0,width:"100%",boxSizing:"border-box"}:{paddingTop:1}';
const CONFLICT_LABEL_NEEDLE = 'ua.isConflict&&n.jsxs("div",{style:{display:"flex",alignItems:"center",gap:8,color:"#b91c1c",fontSize:11,fontWeight:900,marginBottom:6},children:[n.jsx("span",{style:{width:34,height:2,background:"#ef4444",display:"inline-block"}}),"Conflict with ",Bs(ua.conflictWith||"another timeline item")]}),n.jsx("button",{"data-ts-timeline-title":"1"';
const CONFLICT_LABEL_CLIP_NEEDLE = 'ua.isConflict&&n.jsxs("div",{"data-ts-conflict-label":"1",style:{display:"flex",alignItems:"center",gap:8,flexWrap:"nowrap",width:"100%",minWidth:0,color:"#b91c1c",fontSize:11,fontWeight:900,marginBottom:6,lineHeight:1.35,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},children:[n.jsx("span",{style:{width:34,height:2,background:"#ef4444",display:"inline-block",flexShrink:0}}),"Conflict with ",Bs(ua.conflictWith||"another timeline item")]}),n.jsx("button",{"data-ts-timeline-title":"1"';
const CONFLICT_LABEL_PATCH = 'ua.isConflict&&n.jsxs("div",{"data-ts-conflict-label":"1",style:{display:"flex",alignItems:"center",gap:8,width:"100%",minWidth:0,maxWidth:"100%",boxSizing:"border-box",color:"#b91c1c",fontSize:11,fontWeight:900,marginBottom:6,lineHeight:1.35},children:[n.jsx("span",{style:{width:34,height:2,background:"#ef4444",display:"inline-block",flexShrink:0}}),n.jsxs("span",{style:{minWidth:0,flex:"1 1 0"},children:["Conflict with ",Bs(ua.conflictWith||"another timeline item")]})]}),n.jsx("button",{"data-ts-timeline-title":"1"';

export function patchSharedLiveTimelineRowUi(source = '', options = {}) {
  const served = options.served === true;
  let js = String(source || '');
  if (js.includes(TIMELINE_ICON_NEEDLE)) js = js.replace(TIMELINE_ICON_NEEDLE, TIMELINE_ICON_PATCH);
  if (js.includes(TIMELINE_TITLE_NEEDLE)) js = js.replace(TIMELINE_TITLE_NEEDLE, TIMELINE_TITLE_PATCH);
  if (js.includes(TIMELINE_TITLE_PAD_NEEDLE)) js = js.replace(TIMELINE_TITLE_PAD_NEEDLE, TIMELINE_TITLE_PAD_PATCH);
  if (js.includes(CONFLICT_LABEL_CLIP_NEEDLE)) js = js.replace(CONFLICT_LABEL_CLIP_NEEDLE, CONFLICT_LABEL_PATCH);
  if (js.includes(CONFLICT_LABEL_NEEDLE)) js = js.replace(CONFLICT_LABEL_NEEDLE, CONFLICT_LABEL_PATCH);
  else if (served && !js.includes('data-ts-conflict-label":"1"')) {
    throw new Error('conflict timeline label patch did not apply');
  }
  return js;
}

export { TIMELINE_ICON_NEEDLE };
