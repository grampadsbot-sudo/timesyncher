import { VK_PRINT_LAST_LOCKUP_INNER, VK_VISIBLE_NAME } from './vk-brand-lockup.mjs';

const HERO_BRAND_NEEDLE =
  'n.jsxs("div",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,marginBottom:12,fontSize:11,fontWeight:700,letterSpacing:2.4,textTransform:"uppercase",opacity:.72},children:[n.jsx("span",{children:"TimeSyncher"}),n.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:34,height:34,borderRadius:9,background:"#000"},children:n.jsx("img",{src:"/icons/timesyncher-icon-white-transparent.png",alt:"TimeSyncher",width:"22",height:"22"})}),n.jsx("span",{children:"Vacation"})]})';

const FOOTER_BRAND_NEEDLE =
  'n.jsxs("div",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,padding:"8px 16px",borderRadius:20,background:"var(--bg-card, white)",border:"1px solid var(--border-faint, #e5e7eb)",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"},children:[n.jsx("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:700,letterSpacing:1.8,textTransform:"uppercase"},children:"TimeSyncher"}),n.jsx("span",{style:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24},children:n.jsx("img",{src:"/icons/timesyncher-icon-black-transparent.png",alt:"TimeSyncher",width:"20",height:"20"})}),n.jsx("span",{style:{fontSize:11,color:"#9ca3af",fontWeight:700,letterSpacing:1.8,textTransform:"uppercase"},children:"Vacation"}),n.jsx("span",{style:{fontSize:11,color:"#c4c9d1"},children:"· AI-assisted vacation itinerary planning"})]})';

const HEADER_BAR_NEEDLE =
  'return n.jsxs("div",{style:{minHeight:"100vh",width:"100%",maxWidth:"100vw",overflowX:"hidden",background:"var(--bg-secondary, #f3f4f6)",fontFamily:"-apple-system, BlinkMacSystemFont, \'SF Pro Text\', system-ui, sans-serif"},children:[';

const HEADER_BAR_PATCH =
  `return n.jsxs("div",{style:{minHeight:"100vh",width:"100%",maxWidth:"100vw",overflowX:"hidden",background:"var(--bg-secondary, #f3f4f6)",fontFamily:"-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif"},children:[n.jsx("div",{"data-ts-shared-header":"1","data-shared-trip-header":"1",style:{position:"sticky",top:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"8px 12px",background:"#fff",color:"#111827",borderBottom:"1px solid #e5e7eb",boxSizing:"border-box",width:"100%",maxWidth:"100vw",minWidth:0},children:[n.jsx("a",{className:"wordmark vk-shared-wordmark",href:"/","aria-label":"Vacay Keepsake home","data-vk-wordmark":"1",style:{display:"flex",alignItems:"center",gap:10,flexShrink:0,minWidth:0,color:"inherit",textDecoration:"none"},children:[n.jsx("img",{src:"/brand/vk-book-logo.svg",alt:"",width:28,height:30,style:{flex:"0 0 auto"}}),n.jsxs("span",{style:{fontFamily:"'Cormorant Garamond',Georgia,serif",fontSize:22,lineHeight:1,letterSpacing:"-0.5px"},children:["vacay ",n.jsx("i",{style:{fontWeight:500},children:"keepsake"}),n.jsx("small",{style:{display:"block",fontFamily:"'DM Sans',Arial,sans-serif",fontWeight:500,fontSize:6,letterSpacing:"2.2px",lineHeight:1,marginTop:6,textAlign:"center",textTransform:"uppercase"},children:"THE ART OF REMEMBERING"})]})]}),n.jsx("div",{"data-trip-switcher-root":"1",style:{display:"flex",alignItems:"center",justifyContent:"flex-end",flex:"1 1 auto",minWidth:0,maxWidth:"min(58vw,360px)",marginLeft:"auto"},children:n.jsx("select",{"data-trip-switcher":"1","aria-label":"Switch trip",defaultValue:la.title||"Vacation",onChange:G=>{const v=String(G.target.value||"").trim();if(!v)return;try{const raw=window.localStorage.getItem("vk-trip-switcher-map");const map=raw?JSON.parse(raw):{};const slug=map[v];if(slug)window.location.href="/shared/"+encodeURIComponent(slug)+"/"}catch{}},style:{width:"100%",maxWidth:"100%",minWidth:0,fontSize:12,fontWeight:700,padding:"6px 8px",borderRadius:8,border:"1px solid #e5e7eb",background:"#fff",color:"#111827"},children:n.jsx("option",{value:la.title||"Vacation",children:la.title||"Vacation"})})})]})}),`;

const LAST_PAGE_INNER_NEEDLE =
  '<span>TimeSyncher</span><img class="ts-logo" src="/icons/timesyncher-icon-black-transparent.png" alt="" /><span>Vacation</span>';

const LAST_PAGE_ATTR_NEEDLE = 'data-brand-lockup="timesyncher-hourglass-vacation"';

const STR_REPLACEMENTS = [
  ['TimeSyncher Vacation logo', 'Vacay Keepsake logo'],
  ['TimeSyncher saves its best guess from the timeline order.', `${VK_VISIBLE_NAME} saves its best guess from the timeline order.`],
  ['the TimeSyncher conversation as the traveler', `the ${VK_VISIBLE_NAME} conversation as the traveler`],
  ['title:`TimeSyncher Vacation Day ${gn.day_number}`', 'title:`${(la.title||"Vacation").replace(/^TimeSyncher Vacation\\s*[—–-]\\s*/i,"").trim()||"Vacation"} Day ${gn.day_number}`'],
  ['alt:"TimeSyncher"', 'alt:"Vacay Keepsake"'],
  ['/icons/timesyncher-icon-white-transparent.png', '/brand/vk-book-logo.svg'],
  ['/icons/timesyncher-icon-black-transparent.png', '/brand/vk-book-logo.svg'],
];

export function patchVk890Rebrand(source = '') {
  let js = String(source || '');
  if (js.includes(HERO_BRAND_NEEDLE)) {
    js = js.replace(HERO_BRAND_NEEDLE, 'null');
  } else if (js.includes('children:"TimeSyncher"}),n.jsx("span",{style:{display:"inline-flex"')) {
    throw new Error('vk #890 hero brand lockup needle mismatch');
  }
  if (js.includes(FOOTER_BRAND_NEEDLE)) {
    js = js.replace(FOOTER_BRAND_NEEDLE, 'null');
  }
  if (js.includes(HEADER_BAR_NEEDLE)) {
    js = js.replace(HEADER_BAR_NEEDLE, HEADER_BAR_PATCH);
  }
  if (js.includes(LAST_PAGE_ATTR_NEEDLE)) {
    js = js.replaceAll(LAST_PAGE_ATTR_NEEDLE, 'data-brand-lockup="vacay-keepsake-book"');
  }
  if (js.includes(LAST_PAGE_INNER_NEEDLE)) {
    js = js.replaceAll(LAST_PAGE_INNER_NEEDLE, VK_PRINT_LAST_LOCKUP_INNER);
  }
  for (const [from, to] of STR_REPLACEMENTS) {
    if (js.includes(from)) js = js.split(from).join(to);
  }
  return js;
}
