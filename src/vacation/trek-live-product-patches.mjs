export const LIST_LOGO_PATCH = '_l=G=>{const Re=ha(G),raw=String(Re.logoUrl||Re.iconUrl||G.logoUrl||"").trim();if(!raw||/^data:image\\/svg\\+xml/i.test(raw))return "";if(/\\/ts-thing-media\\//i.test(raw)&&!/\\/ts-thing-logos\\//i.test(raw))return "";return raw}';

const LIST_LOGO_NEEDLE = '_l=G=>{if(qr(G))return pDe;const Re=ha(G);return Re.logoUrl||Re.iconUrl||G.logoUrl||oi(cc(G))}';
const LIST_LOGO_PATCH_NEEDLE = '_l=G=>{const Re=ha(G),raw=String(Re.logoUrl||Re.iconUrl||G.logoUrl||"");if(raw&&!/^data:image\\/svg\\+xml/i.test(raw))return raw;return ""}';

const REST_ALL_TAGS_NEEDLE = 'q==="restaurants"&&n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[ci.length>0&&n.jsxs("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2},children:[n.jsx("button",{onClick:()=>qt([])';
const REST_ALL_TAGS_PATCH = 'q==="restaurants"&&n.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[n.jsxs("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2},children:[n.jsx("button",{onClick:()=>qt([])';

const LOGO_SELECTOR_NEEDLE = 'children:["Type",n.jsx("select",{value:It(Dt),onChange:G=>Xa(Dt,"category",G.target.value),style:he,children:Fa.map(G=>n.jsx("option",{value:G,children:Jn(G)},G))})]})]}),n.jsxs("div",{style:{display:"grid",gridTemplateColumns:zi(Dt)?';
const LOGO_SELECTOR_PATCH = 'children:["Type",n.jsx("select",{value:It(Dt),onChange:G=>Xa(Dt,"category",G.target.value),style:he,children:Fa.map(G=>n.jsx("option",{value:G,children:Jn(G)},G))})]})]}),n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"minmax(220px, 1fr) 160px",gap:8,alignItems:"end"},children:[n.jsxs("label",{style:Hn,children:["Logo URL",n.jsx("input",{value:String(ha(Dt).logoUrl||""),onChange:G=>Xa(Dt,"logoUrl",G.target.value),placeholder:"https://…",style:De})]}),fo(Dt).filter(Oo=>Oo&&Oo.kind!=="video").length>0&&n.jsxs("label",{style:Hn,children:["Logo from media",n.jsx("select",{value:String(ha(Dt).logoUrl||""),onChange:G=>Xa(Dt,"logoUrl",G.target.value),style:he,children:[n.jsx("option",{value:"",children:"None"},""),...fo(Dt).filter(Oo=>Oo&&Oo.kind!=="video").map(Oo=>n.jsx("option",{value:String(Oo.url||Oo.public_url||Oo.thumbnailUrl||""),children:String(Oo.originalName||Oo.caption||"Photo")},String(Oo.id||Oo.url)))]})]})]}),n.jsxs("div",{style:{display:"grid",gridTemplateColumns:zi(Dt)?';

export function stripHotelBrandNameGuessing(source = '') {
  let js = String(source || '');
  js = js.replace(/:\/hotel\|[^"]+\.test\(c\)\?"🧳":/g, ':/hotel|lodging|accommodation/.test(c)?"🧳":');
  js = js.replace(/:\/hotel\|[^"]+i\.test\(Re\)\?"hotel":/g, ':/hotel|lodging|accommodation/i.test(Re)?"hotel":');
  return js;
}

export function applyLiveProductPatches(patched = '') {
  let js = stripHotelBrandNameGuessing(String(patched || ''));
  if (js.includes(LIST_LOGO_NEEDLE)) js = js.replace(LIST_LOGO_NEEDLE, LIST_LOGO_PATCH);
  else if (js.includes(LIST_LOGO_PATCH_NEEDLE)) js = js.replace(LIST_LOGO_PATCH_NEEDLE, LIST_LOGO_PATCH);
  if (js.includes(REST_ALL_TAGS_NEEDLE)) js = js.replace(REST_ALL_TAGS_NEEDLE, REST_ALL_TAGS_PATCH);
  if (js.includes(LOGO_SELECTOR_NEEDLE)) js = js.replace(LOGO_SELECTOR_NEEDLE, LOGO_SELECTOR_PATCH);
  return js;
}

export function patchThingDetailRatings(source = '') {
  let js = String(source || '');
  const ratingEndMarker = 'placeholder:"Tripadvisor/OpenTable/Booking",style:De})]})]})';
  const ratingStarts = [
    'vo(Dt)&&n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:8},children:[',
    '["googleRating","yelpRating","thirdPartyRating"].some(k=>/\\d/.test(String(No(Dt,k)||"")))&&n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:8},children:[',
  ];
  const ratingPatch = 'n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:8},children:[["googleRating","Google rating"],["yelpRating","Yelp rating"],["thirdPartyRating","Other rating"]].map(([k,label])=>n.jsxs("label",{style:Hn,children:[label,n.jsx("input",{value:No(Dt,k),onChange:G=>Xa(Dt,k,G.target.value),placeholder:"",style:De})]},k))})';
  for (const ratingStart of ratingStarts) {
    const start = js.indexOf(ratingStart);
    const ratingEnd = start >= 0 ? js.indexOf(ratingEndMarker, start) : -1;
    if (start >= 0 && ratingEnd > start) {
      js = js.slice(0, start) + ratingPatch + js.slice(ratingEnd + ratingEndMarker.length);
      break;
    }
  }
  const reviewStart = js.indexOf('vo(Dt)&&[1,2,3].map(G=>n.jsxs("label",{style:Hn,children:["5-star review quote "');
  const reviewEnd = reviewStart >= 0 ? js.indexOf(']},G))]', reviewStart) : -1;
  if (reviewStart >= 0 && reviewEnd > reviewStart) {
    const reviewPatch = '[1,2,3].filter(G=>String(Ps(Dt,G)||"").trim()).map(G=>n.jsxs("label",{style:Hn,children:["Review ",G,n.jsx("textarea",{value:Ps(Dt,G),onChange:Re=>Xa(Dt,`review${G}`,Re.target.value),style:ur})]},G))]';
    js = js.slice(0, reviewStart) + reviewPatch + js.slice(reviewEnd + ']},G))]'.length);
  }
  return js.replaceAll('placeholder:"4.6"', 'placeholder:""').replaceAll('placeholder:"4.4"', 'placeholder:""');
}
