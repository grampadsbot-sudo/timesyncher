const HEADER_BRAND_NEEDLE = 'n.jsxs("div",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,marginBottom:12,fontSize:11,fontWeight:700,letterSpacing:2.4,textTransform:"uppercase",opacity:.72},children:[n.jsx("span",{children:"TimeSyncher"}),n.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:34,height:34,borderRadius:9,background:"#000"},children:n.jsx("img",{src:"/icons/timesyncher-icon-white-transparent.png",alt:"TimeSyncher",width:"22",height:"22"})}),n.jsx("span",{children:"Vacation"})]})';

const HEADER_BRAND_PATCH = 'n.jsxs("div",{"data-ts-header-brand":"1",style:{display:"inline-grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:5,marginBottom:12,fontSize:11,fontWeight:700,letterSpacing:2.4,textTransform:"uppercase",opacity:.72},children:[n.jsx("span",{style:{justifySelf:"end"},children:"TimeSyncher"}),n.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:34,height:34,borderRadius:9,background:"#000"},children:n.jsx("img",{src:"/icons/timesyncher-icon-white-transparent.png",alt:"TimeSyncher",width:"22",height:"22"})}),n.jsx("span",{style:{justifySelf:"start"},children:"Vacation"})]})';

export function patchHeaderBrandLogoCentre(source = '') {
  const js = String(source || '');
  if (js.includes(HEADER_BRAND_NEEDLE)) return js.replace(HEADER_BRAND_NEEDLE, HEADER_BRAND_PATCH);
  if (js.includes(HEADER_BRAND_PATCH)) return js;
  throw new Error('trek bundle missing header brand needle for logo centering patch');
}
