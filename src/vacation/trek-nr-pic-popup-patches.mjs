const NR_LIFECYCLE_NEEDLE =
  'Nr=({items:G,scopeKey:Re,compact:zt=!1})=>{const[ua,Rn]=I.useState(null),[Pn,Zn]=I.useState(null),[sr,Xr]=I.useState(""),[zr,Mo]=I.useState(null);if(!G.length)return null;const Is=gr=>{zr&&window.clearTimeout(zr),Mo(window.setTimeout(()=>Rn(gr),1e3))},Hl=()=>{zr&&window.clearTimeout(zr),Mo(null),Rn(null)},';
const NR_LIFECYCLE_PATCH =
  'Nr=({items:G,scopeKey:Re,compact:zt=!1})=>{const[ua,Rn]=I.useState(null),[Pn,Zn]=I.useState(null),[sr,Xr]=I.useState(""),[zr,Mo]=I.useState(null);const tsNrClose=()=>{zr&&window.clearTimeout(zr),Mo(null),Rn(null),Zn(null),Xr("")};I.useEffect(()=>{if(ua==null)return;const onKey=wn=>{wn.key==="Escape"&&tsNrClose()};const onPtr=wn=>{const el=wn.target;if(el&&el.closest&&(el.closest(\'[data-ts-pic-popup="1"]\')||el.closest(\'[data-ts-pic-thumb-wrap="1"]\')))return;tsNrClose()};document.addEventListener("keydown",onKey);document.addEventListener("pointerdown",onPtr,!0);return()=>{document.removeEventListener("keydown",onKey);document.removeEventListener("pointerdown",onPtr,!0)}},[ua,zr]);if(!G.length)return null;const Is=gr=>{if(zt)return;zr&&window.clearTimeout(zr),Mo(window.setTimeout(()=>Rn(gr),1e3))},Hl=tsNrClose,';

const NR_THUMB_WRAP_NEEDLE = 'return n.jsxs("div",{onMouseEnter:()=>Is(gr.id),onMouseLeave:Hl,style:{position:"relative",width:zt?42:58,minWidth:zt?42:58,overflow:"visible"},children:[';
const NR_THUMB_WRAP_PATCH =
  'return n.jsxs("div",{"data-ts-pic-thumb-wrap":"1",onMouseEnter:()=>Is(gr.id),onMouseLeave:Hl,style:{position:"relative",width:zt?42:58,minWidth:zt?42:58,overflow:"visible"},children:[';

const NR_THUMB_CLICK_NEEDLE =
  'onClick:wn=>{gr.kind!=="video"&&wn.preventDefault()},style:{display:"block",width:zt?42:58,height:zt?42:58,borderRadius:zt?8:10,overflow:"hidden",border:"1px solid #e5e7eb",background:"#f8fafc",position:"relative",boxShadow:"0 1px 2px rgba(15,23,42,0.06)"},"aria-label":gr.kind==="video"?`Play ${gr.originalName}`:gr.originalName,children:[';
const NR_THUMB_CLICK_PATCH =
  'onClick:wn=>{if(zt){wn.preventDefault();wn.stopPropagation();ua===gr.id?Hl():Rn(gr.id)}else if(gr.kind!=="video")wn.preventDefault()},style:{display:"block",width:zt?42:58,height:zt?42:58,borderRadius:zt?8:10,overflow:"hidden",border:"1px solid #e5e7eb",background:"#f8fafc",position:"relative",boxShadow:"0 1px 2px rgba(15,23,42,0.06)",cursor:zt?"pointer":"default"},"aria-label":gr.kind==="video"?`Play ${gr.originalName}`:gr.originalName,children:[';

const NR_THUMB_HREF_NEEDLE = 'href:gr.kind==="video"?gr.url:void 0,target:"_blank",rel:"noreferrer",onClick:wn=>{';
const NR_THUMB_HREF_PATCH =
  'href:gr.kind==="video"&&!zt?gr.url:void 0,target:gr.kind==="video"&&!zt?"_blank":void 0,rel:gr.kind==="video"&&!zt?"noreferrer":void 0,onClick:wn=>{';

const NR_THUMB_CLICK_V2_NEEDLE =
  'onClick:wn=>{if(gr.kind!=="video"){wn.preventDefault();if(zt){wn.stopPropagation();ua===gr.id?Hl():Rn(gr.id)}}},style:{display:"block",width:zt?42:58,height:zt?42:58,borderRadius:zt?8:10,overflow:"hidden",border:"1px solid #e5e7eb",background:"#f8fafc",position:"relative",boxShadow:"0 1px 2px rgba(15,23,42,0.06)",cursor:zt?"pointer":"default"},"aria-label":gr.kind==="video"?`Play ${gr.originalName}`:gr.originalName,children:[';
const NR_THUMB_CLICK_V2_PATCH =
  'onClick:wn=>{if(zt){wn.preventDefault();wn.stopPropagation();ua===gr.id?Hl():Rn(gr.id)}else if(gr.kind!=="video")wn.preventDefault()},style:{display:"block",width:zt?42:58,height:zt?42:58,borderRadius:zt?8:10,overflow:"hidden",border:"1px solid #e5e7eb",background:"#f8fafc",position:"relative",boxShadow:"0 1px 2px rgba(15,23,42,0.06)",cursor:zt?"pointer":"default"},"aria-label":gr.kind==="video"?`Play ${gr.originalName}`:gr.originalName,children:[';

const NR_POPUP_VIDEO_NEEDLE =
  'gr.kind==="video"?n.jsx("video",{src:gr.url,poster:gr.thumbnailUrl!==gr.url?gr.thumbnailUrl:void 0,muted:!0,preload:"metadata",style:{width:"100%",height:"100%",objectFit:"cover"}})';
const NR_POPUP_VIDEO_PATCH =
  'gr.kind==="video"?n.jsx("video",{src:gr.url,poster:gr.thumbnailUrl!==gr.url?gr.thumbnailUrl:void 0,controls:!0,playsInline:!0,preload:"metadata",style:{width:"100%",height:"100%",objectFit:"cover"}})';

const NR_ESCAPE_NEEDLE = 'const onKey=wn=>{wn.key==="Escape"&&tsNrClose()};';
const NR_ESCAPE_PATCH =
  'const onKey=wn=>{if(wn.key!=="Escape")return;if(window.__tsPicFsActive||document.fullscreenElement||document.querySelector(\'[data-ts-pic-fs-overlay="1"]\'))return;tsNrClose()};';

const NR_OUTSIDE_DISMISS_NEEDLE =
  'const onPtr=wn=>{const el=wn.target;if(el&&el.closest&&(el.closest(\'[data-ts-pic-popup="1"]\')||el.closest(\'[data-ts-pic-thumb-wrap="1"]\')))return;tsNrClose()};document.addEventListener("keydown",onKey);document.addEventListener("pointerdown",onPtr,!0);return()=>{document.removeEventListener("keydown",onKey);document.removeEventListener("pointerdown",onPtr,!0)}';
const NR_OUTSIDE_DISMISS_PATCH =
  'const tsPicOutsideHit=wn=>{const el=wn.target;return el&&el.closest&&(el.closest(\'[data-ts-pic-popup="1"]\')||el.closest(\'[data-ts-pic-thumb-wrap="1"]\'))};let tsPicTouch0=null,tsPicScrollHint=false;const onTouchStart=wn=>{if(tsPicOutsideHit(wn))return;const t=wn.changedTouches&&wn.changedTouches[0];if(!t)return;tsPicTouch0={x:t.clientX,y:t.clientY};tsPicScrollHint=false};const onTouchMove=wn=>{if(!tsPicTouch0||tsPicScrollHint)return;const t=wn.changedTouches&&wn.changedTouches[0];if(!t)return;if(Math.hypot(t.clientX-tsPicTouch0.x,t.clientY-tsPicTouch0.y)>12)tsPicScrollHint=true};const onTouchEnd=wn=>{if(tsPicOutsideHit(wn)){tsPicTouch0=null;return}if(tsPicScrollHint){tsPicTouch0=null;return}const t=wn.changedTouches&&wn.changedTouches[0];if(!t||!tsPicTouch0){tsPicTouch0=null;return}if(Math.hypot(t.clientX-tsPicTouch0.x,t.clientY-tsPicTouch0.y)>12){tsPicTouch0=null;return}tsPicTouch0=null;tsNrClose()};const onPtr=wn=>{if(wn.pointerType==="touch")return;if(tsPicOutsideHit(wn))return;tsNrClose()};document.addEventListener("keydown",onKey);document.addEventListener("touchstart",onTouchStart,{capture:true,passive:true});document.addEventListener("touchmove",onTouchMove,{capture:true,passive:true});document.addEventListener("touchend",onTouchEnd,{capture:true,passive:true});document.addEventListener("pointerdown",onPtr,!0);return()=>{document.removeEventListener("keydown",onKey);document.removeEventListener("touchstart",onTouchStart,{capture:true,passive:true});document.removeEventListener("touchmove",onTouchMove,{capture:true,passive:true});document.removeEventListener("touchend",onTouchEnd,{capture:true,passive:true});document.removeEventListener("pointerdown",onPtr,!0)}';

export function applyNrPicPopupPatches(js, { served } = {}) {
  let out = String(js || '');
  if (out.includes(NR_LIFECYCLE_NEEDLE)) out = out.replace(NR_LIFECYCLE_NEEDLE, NR_LIFECYCLE_PATCH);
  else if (served && !out.includes('data-ts-pic-thumb-wrap="1"')) {
    throw new Error('Nr pic-popup lifecycle patch did not apply');
  }
  if (out.includes(NR_ESCAPE_NEEDLE)) out = out.replace(NR_ESCAPE_NEEDLE, NR_ESCAPE_PATCH);
  else if (served && !out.includes('window.__tsPicFsActive')) {
    throw new Error('Nr pic-popup fullscreen escape patch did not apply');
  }
  if (out.includes(NR_OUTSIDE_DISMISS_NEEDLE)) out = out.replace(NR_OUTSIDE_DISMISS_NEEDLE, NR_OUTSIDE_DISMISS_PATCH);
  else if (served && !out.includes('tsPicScrollHint')) {
    throw new Error('Nr pic-popup outside dismiss patch did not apply');
  }
  if (out.includes(NR_THUMB_WRAP_NEEDLE)) out = out.replace(NR_THUMB_WRAP_NEEDLE, NR_THUMB_WRAP_PATCH);
  else if (served && !out.includes('data-ts-pic-thumb-wrap="1"')) {
    throw new Error('Nr pic-popup thumb wrap patch did not apply');
  }
  if (out.includes(NR_THUMB_CLICK_NEEDLE)) out = out.replace(NR_THUMB_CLICK_NEEDLE, NR_THUMB_CLICK_PATCH);
  if (out.includes(NR_THUMB_CLICK_V2_NEEDLE)) out = out.replace(NR_THUMB_CLICK_V2_NEEDLE, NR_THUMB_CLICK_V2_PATCH);
  if (served && !out.includes('if(zt){wn.preventDefault();wn.stopPropagation();ua===gr.id?Hl():Rn(gr.id)}')) {
    throw new Error('Nr compact thumb click-toggle patch did not apply');
  }
  if (out.includes(NR_THUMB_HREF_NEEDLE)) out = out.replace(NR_THUMB_HREF_NEEDLE, NR_THUMB_HREF_PATCH);
  else if (served && !out.includes('gr.kind==="video"&&!zt?gr.url')) {
    throw new Error('Nr video thumb href patch did not apply');
  }
  if (out.includes(NR_POPUP_VIDEO_NEEDLE)) out = out.replace(NR_POPUP_VIDEO_NEEDLE, NR_POPUP_VIDEO_PATCH);
  else if (served && !out.includes('controls:!0,playsInline:!0,preload:"metadata"')) {
    throw new Error('Nr inline video controls patch did not apply');
  }
  return out;
}
