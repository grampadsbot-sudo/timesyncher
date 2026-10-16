const SHARED_TRIP_HEADER_BRAND_NEEDLE =
  'dn?n.jsxs("div",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,marginBottom:12,fontSize:11,fontWeight:700,letterSpacing:2.4,textTransform:"uppercase",opacity:.72},children:[n.jsx("span",{children:"TimeSyncher"}),n.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:34,height:34,borderRadius:9,background:"#000"},children:n.jsx("img",{src:"/icons/timesyncher-icon-white-transparent.png",alt:"TimeSyncher",width:"22",height:"22"})}),n.jsx("span",{children:"Vacation"})]})';

const SHARED_TRIP_HEADER_BRAND_PATCH =
  'dn?n.jsxs("div",{"data-ts-shared-header":"1","data-shared-trip-header":"1",style:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,marginBottom:12,fontSize:11,fontWeight:700,letterSpacing:2.4,textTransform:"uppercase",opacity:.72},children:[n.jsx("span",{style:{display:"inline-flex",alignItems:"center",lineHeight:1},children:"TimeSyncher"}),n.jsx("span",{"data-ts-logo-chip":"1","data-ts-header-logo-chip":"1","aria-hidden":"true",style:{width:34,height:34,minWidth:34,minHeight:34,borderRadius:9,background:"#000",display:"inline-grid",placeItems:"center",boxSizing:"border-box",flex:"0 0 auto",alignSelf:"center",lineHeight:0,overflow:"hidden"},children:n.jsx("img",{className:"tiny-logo",src:"/icons/timesyncher-icon-white-transparent.png",alt:"",loading:"lazy",style:{maxWidth:"100%",maxHeight:"100%",width:"auto",height:"auto",objectFit:"contain",objectPosition:"center center",display:"block"}})}),n.jsx("span",{style:{display:"inline-flex",alignItems:"center",lineHeight:1},children:"Vacation"})]})';

export function patchSharedTripHeaderLogo(source = '', options = {}) {
  const served = options.served === true;
  let js = String(source || '');
  if (js.includes(SHARED_TRIP_HEADER_BRAND_PATCH)) return js;
  if (js.includes(SHARED_TRIP_HEADER_BRAND_NEEDLE)) {
    js = js.replace(SHARED_TRIP_HEADER_BRAND_NEEDLE, SHARED_TRIP_HEADER_BRAND_PATCH);
  } else if (served && !js.includes('"data-ts-header-logo-chip":"1"')) {
    throw new Error('shared trip header logo centering patch did not apply');
  }
  return js;
}

export { SHARED_TRIP_HEADER_BRAND_NEEDLE, SHARED_TRIP_HEADER_BRAND_PATCH };
