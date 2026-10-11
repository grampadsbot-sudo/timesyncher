export function patchThingDetailRatings(source = '') {
  let js = String(source || '');
  const ratingEndMarker = 'placeholder:"Tripadvisor/OpenTable/Booking",style:De})]})]})';
  const ratingPatch = 'n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:8},children:[["googleRating","Google rating"],["yelpRating","Yelp rating"],["thirdPartyRating","Other rating"]].map(([k,label])=>n.jsxs("label",{style:Hn,children:[label,n.jsx("input",{value:No(Dt,k),onChange:G=>Xa(Dt,k,G.target.value),placeholder:"",style:De})]},k))})';
  for (const ratingStart of ['vo(Dt)&&n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:8},children:[', '["googleRating","yelpRating","thirdPartyRating"].some(k=>/\\d/.test(String(No(Dt,k)||"")))&&n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(3, minmax(0, 1fr))",gap:8},children:[']) {
    const start = js.indexOf(ratingStart);
    const ratingEnd = start >= 0 ? js.indexOf(ratingEndMarker, start) : -1;
    if (start >= 0 && ratingEnd > start) {
      js = js.slice(0, start) + ratingPatch + js.slice(ratingEnd + ratingEndMarker.length);
      break;
    }
  }
  const reviewStart = js.indexOf('vo(Dt)&&[1,2,3].map(G=>n.jsxs("label",{style:Hn,children:["5-star review quote "');
  const reviewStartAlt = js.indexOf('[1,2,3].filter(G=>String(Ps(Dt,G)||"").trim()).map(G=>n.jsxs("label",{style:Hn,children:["Review ",G');
  const reviewStartIdx = reviewStart >= 0 ? reviewStart : reviewStartAlt;
  const reviewEnd = reviewStartIdx >= 0 ? js.indexOf(']},G))]', reviewStartIdx) : -1;
  if (reviewStartIdx >= 0 && reviewEnd > reviewStartIdx) {
    const reviewPatch = '[1,2,3,4].filter(G=>String(Ps(Dt,G)||"").trim()).map(G=>n.jsxs("label",{style:Hn,children:["Review ",G," (",String(No(Dt,`review${G}Source`)||"source"),")",n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"120px minmax(0,1fr)",gap:8,alignItems:"center"},children:[n.jsx("input",{value:No(Dt,`review${G}Rating`),onChange:Re=>Xa(Dt,`review${G}Rating`,Re.target.value),placeholder:"Star rating",style:De}),n.jsx("textarea",{value:Ps(Dt,G),onChange:Re=>Xa(Dt,`review${G}`,Re.target.value),style:ur})]})]},G))]';
    js = js.slice(0, reviewStartIdx) + reviewPatch + js.slice(reviewEnd + ']},G))]'.length);
  }
  return js.replaceAll('placeholder:"4.6"', 'placeholder:""').replaceAll('placeholder:"4.4"', 'placeholder:""');
}
