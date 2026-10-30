import { boundMediaPlayUrlBundleInject } from './thing-media-bind.mjs';

const HA_INJECT_NEEDLE = ',tsDetailCapturePayload=Dt=>{';
const HA_INJECT_PATCH = (inject) => `,${inject},tsDetailCapturePayload=Dt=>{`;

const HA_INJECT_ALT_NEEDLE = ',tsItinLine=G=>{';

const PC_NEEDLE = 'Pc=G=>ha(G).icon||wl(G)';
const PC_PATCH = 'Pc=G=>{const ic=String(ha(G).icon||"").trim();return ic&&ic!=="?"?ic:wl(G)}';

const PLAY_VIDEO_NEEDLE =
  'gr.kind==="video"&&n.jsxs("a",{href:gr.url,target:"_blank",rel:"noreferrer",style:{display:"inline-flex",gap:4,alignItems:"center",marginTop:4,fontSize:11,fontWeight:900,color:"#0f766e",textDecoration:"none"},children:[n.jsx(gs,{size:12})," Play video"]})';
const PLAY_VIDEO_PATCH =
  '(()=>{const tsPlay=tsBoundMediaPlayUrl(gr);return tsPlay&&gr.kind==="video"?n.jsxs("a",{href:tsPlay,target:"_blank",rel:"noreferrer",style:{display:"inline-flex",gap:4,alignItems:"center",marginTop:4,fontSize:11,fontWeight:900,color:"#0f766e",textDecoration:"none"},children:[n.jsx(gs,{size:12})," Play video"]}):null})()';

const EDIT_CAPTION_NEEDLE =
  '}),n.jsx("button",{type:"button","aria-label":"Edit caption",onClick:()=>{Zn(gr.id),Xr(gr.caption||"")},style:{width:28,height:28,borderRadius:999,border:"1px solid #e5e7eb",background:"#f9fafb",color:"#374151",display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"pointer"},children:n.jsx(Gs,{size:13})})]})]})';
const EDIT_CAPTION_PATCH =
  '}),Ce&&n.jsx("button",{type:"button","aria-label":"Edit caption",onClick:()=>{Zn(gr.id),Xr(gr.caption||"")},style:{width:28,height:28,borderRadius:999,border:"1px solid #e5e7eb",background:"#f9fafb",color:"#374151",display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:"pointer"},children:n.jsx(Gs,{size:13})})]})]})';

const TIMELINE_TIME_EMPTY_NEEDLE = 'ua.time?Yo(ua.time):""';
const TIMELINE_TIME_EMPTY_PATCH = 'ua.time?Yo(ua.time):"TBD"';

export function patchUi734Round1(source = '') {
  let js = String(source || '');
  if (!js.includes('tsBoundMediaPlayUrl=gr=>')) {
    const inject = boundMediaPlayUrlBundleInject();
    if (js.includes(HA_INJECT_NEEDLE)) {
      js = js.replace(HA_INJECT_NEEDLE, HA_INJECT_PATCH(inject));
    } else if (js.includes(HA_INJECT_ALT_NEEDLE)) {
      js = js.replace(HA_INJECT_ALT_NEEDLE, `,${inject},tsItinLine=G=>{`);
    } else {
      throw new Error('ui #734 patch missed inject anchor for tsBoundMediaPlayUrl');
    }
  }
  if (js.includes(PC_NEEDLE)) js = js.replace(PC_NEEDLE, PC_PATCH);
  if (js.includes(PLAY_VIDEO_NEEDLE)) js = js.replace(PLAY_VIDEO_NEEDLE, PLAY_VIDEO_PATCH);
  if (js.includes(EDIT_CAPTION_NEEDLE)) js = js.replace(EDIT_CAPTION_NEEDLE, EDIT_CAPTION_PATCH);
  if (js.includes(TIMELINE_TIME_EMPTY_NEEDLE)) {
    js = js.replaceAll(TIMELINE_TIME_EMPTY_NEEDLE, TIMELINE_TIME_EMPTY_PATCH);
  }
  if (!js.includes('tsBoundMediaPlayUrl=gr=>')) {
    throw new Error('ui #734 tsBoundMediaPlayUrl inject did not apply');
  }
  if (!js.includes('Ce&&n.jsx("button",{type:"button","aria-label":"Edit caption"')) {
    throw new Error('ui #734 view-only edit caption patch did not apply');
  }
  if (!js.includes('tsPlay=tsBoundMediaPlayUrl(gr)')) {
    throw new Error('ui #734 play video URL patch did not apply');
  }
  if (!js.includes('ic&&ic!=="?"?ic:wl(G)')) {
    throw new Error('ui #734 logo fallback Pc patch did not apply');
  }
  if (!js.includes('ua.time?Yo(ua.time):"TBD"')) {
    throw new Error('ui #734 timeline TBD patch did not apply');
  }
  return js;
}

export { patchUi734Round2 } from './trek-ui-734-round2-patch.mjs';
