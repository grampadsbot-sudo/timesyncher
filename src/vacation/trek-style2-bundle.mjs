const TRAVEL_BUNDLE = 'https://travel.timesyncher.com/assets/index-BKun7ofk.js';
const ZU_STYLE2 = 'G==="keepsake-style-2"?zu()';
const AE_STYLE2 = 'G==="keepsake-style-2"?Ae()';

export const STYLE2_USES_ZU = ZU_STYLE2;
export const STYLE2_USES_AE = AE_STYLE2;

const AE_LAYOUT_NEEDLE = 'const zt=Sr(Ta.filter(nr=>!bn(nr)&&!Mi(nr)&&ha(nr).story)),ua=G.map(([nr,Oo])=>`<div class="summary-stat"><strong>${Oo.length}</strong>${an(nr)}</div>`).join(""),Rn=(nr,Oo,_i=!1)=>`<section class="report-section"><h2>${an(nr)}${_i?" (continued)":""}</h2><ul class="logo-list">${Oo.map(w).join("")}</ul></section>`,Pn=[];let Zn=[],sr=0;const Xr=35,zr=42,Mo=()=>{Pn.push(Zn.join("")),Zn=[],sr=0};G.forEach(([nr,Oo])=>{let _i=[...Oo],Eo=!1;for(;_i.length;){const di=Pn.length===0?Xr:zr,Xi=3;sr+Xi+1>di&&Zn.length&&Mo();const go=Math.max(1,di-sr-Xi),fr=_i.slice(0,go);Zn.push(Rn(nr,fr,Eo)),sr+=Xi+fr.length,_i=_i.slice(fr.length),Eo=!0,_i.length&&Mo()}}),(Zn.length||!Pn.length)&&Mo();const[Is,...Hl]=Pn,pc=Pr.summary?`<p class="muted">Trip summary</p><div class="keepsake-summary">${E().split(/\\n\\s*\\n/).map(nr=>`<p>${an(nr)}</p>`).join("")}</div>`:"",gr=Pr.eventSummary?`<p class="keepsake-summary">You experienced ${Re.size} ${Re.size===1?"event":"events"} this vacation.</p>`:"",js=Pr.stories&&zt.length?`<section class="page keepsake-report keepsake-list-page">${Wi}<h2>Saved stories</h2><div class="recap-grid">${zt.map(fs).join("")}</div></section>`:"",zl=Qa.map(nr=>`<div class="keepsake-day">${op(nr,{includeMap:so(nr),brandHtml:Wi})}</div>`).join(""),wn=`<section class="page keepsake-report">${Wi}<h1>${an(la.title||"Vacation")}</h1>${pc}${gr}<div class="summary-grid">${ua}</div>${Is}</section>`,Qi=Hl.map(nr=>`<section class="page keepsake-report keepsake-list-page">${Wi}${nr}</section>`).join("");return`${wn}${Qi}${js}${zl}`}';

const AE_LAYOUT_PATCH = 'const zt=Sr(Ta.filter(nr=>!bn(nr)&&!Mi(nr)&&ha(nr).story&&fo(nr).filter(Oo=>!/bind[- ]?proof|neon file bind proof/i.test(`${Oo.filename||Oo.original_name||""} ${Oo.caption||""} ${Oo.url||Oo.public_url||""}`)).some(Oo=>Oo.kind==="photo"||Oo.kind==="video"))),ua=G.map(([nr,Oo])=>`<div class="summary-stat"><strong>${Oo.length}</strong>${an(nr)}</div>`).join(""),Rn=(nr,Oo,_i=!1)=>`<section class="report-section"><h2>${an(nr)}${_i?" (continued)":""}</h2><ul class="logo-list">${Oo.map(w).join("")}</ul></section>`,Pn=[];let Zn=[],sr=0;const Xr=35,zr=42,Mo=()=>{Pn.push(Zn.join("")),Zn=[],sr=0};G.forEach(([nr,Oo])=>{let _i=[...Oo],Eo=!1;for(;_i.length;){const di=Pn.length===0?Xr:zr,Xi=3;sr+Xi+1>di&&Zn.length&&Mo();const go=Math.max(1,di-sr-Xi),fr=_i.slice(0,go);Zn.push(Rn(nr,fr,Eo)),sr+=Xi+fr.length,_i=_i.slice(fr.length),Eo=!0,_i.length&&Mo()}}),(Zn.length||!Pn.length)&&Mo();const Vd=G.map(([nr,Oo])=>`<section class="report-section" data-directory-bucket="${an(nr)}"><h2>${an(nr)}</h2><ul class="logo-list">${Oo.map(w).join("")}</ul></section>`).join(""),pc=Pr.summary?`<p class="muted">Trip summary</p><div class="keepsake-summary">${E().split(/\\n\\s*\\n/).map(nr=>`<p>${an(nr)}</p>`).join("")}</div>`:"",gr=Pr.eventSummary?`<p class="keepsake-summary">You experienced ${Re.size} ${Re.size===1?"event":"events"} this vacation.</p>`:"",js=Pr.stories&&zt.length?`<section class="page keepsake-report keepsake-list-page" data-stories-up-front="1">${Wi}<h2>Saved stories</h2><div class="recap-grid">${zt.map(nr=>`<article class="story-card" data-story-card="1" data-story-media-only="1"><h3>${an(Bs(mr(nr)))}</h3>${fo(nr).filter(Oo=>!/bind[- ]?proof|neon file bind proof/i.test(`${Oo.filename||Oo.original_name||""} ${Oo.caption||""} ${Oo.url||Oo.public_url||""}`)).map(Ba).join("")}${ha(nr).story?`<div class="body"><p>${an(ha(nr).story)}</p></div>`:""}</article>`).join("")}</div></section>`:"",zl=Qa.map(nr=>`<div class="keepsake-day">${op(nr,{includeMap:so(nr),brandHtml:Wi})}</div>`).join(""),wn=`<section class="page keepsake-report" data-page="1" data-trip-directory="1">${Wi}<h1>${an(la.title||"Vacation")}</h1>${pc}${gr}<div class="summary-grid">${ua}</div>${Vd}</section>`,Qi=Pn.map(nr=>`<section class="page keepsake-report keepsake-list-page" data-post-itinerary="1">${Wi}${nr}</section>`).join("");return`${wn}${js}${zl}${Qi}`}';

const SI_NYC_TAIL = ',[/guided walking|audio history/i,[40.7794,-73.9632]]]';
const SI_VEGAS_TAIL = ',[/guided walking|audio history/i,[40.7794,-73.9632]],[/bellagio|conservatory/i,[36.1126,-115.1767]],[/shake shack/i,[36.1097,-115.1739]],[/carbone/i,[36.1073,-115.1766]],[/cosmopolitan|eggslut/i,[36.1097,-115.1739]],[/lotus of siam/i,[36.1436,-115.1415]],[/las vegas strip|las vegas/i,[36.1147,-115.1729]]]';

/** Product Ae() honors Keepsakes Config. zu() is the stub that omitted ON sections. */
export function patchStyleTwoToConfigRenderer(source = '') {
  const js = String(source || '');
  if (!js.includes(ZU_STYLE2)) {
    throw new Error('Refusing to serve TREK bundle: Style two still not the zu() site we patch to Ae().');
  }
  let patched = js.replace(ZU_STYLE2, AE_STYLE2);
  if (patched.includes(AE_LAYOUT_NEEDLE)) {
    patched = patched.replace(AE_LAYOUT_NEEDLE, AE_LAYOUT_PATCH);
  }
  if (patched.includes(SI_NYC_TAIL) && !patched.includes('[/bellagio|conservatory/i,[36.1126,-115.1767]]')) {
    patched = patched.replace(SI_NYC_TAIL, SI_VEGAS_TAIL);
  }
  return patched;
}

export function assertPatchedStyleTwo(source = '') {
  const js = String(source || '');
  if (!js.includes(AE_STYLE2)) {
    throw new Error('Style two dispatch is not Ae().');
  }
  if (!js.includes('data-trip-directory="1"') || !js.includes('data-directory-bucket=')) {
    throw new Error('Style two Ae() p1 directory patch did not apply.');
  }
  if (!js.includes('data-post-itinerary="1"')) {
    throw new Error('Style two Ae() post-trip list patch did not apply.');
  }
  if (!js.includes('data-story-media-only="1"') || js.includes('${zt.map(fs).join("")}')) {
    throw new Error('Style two Ae() pics-only stories patch did not apply.');
  }
  if (!js.includes('neon file bind proof') || !js.includes('fo(nr).filter(Oo=>')) {
    throw new Error('Style two Ae() junk-media story filter did not apply.');
  }
  if (!js.includes('[/bellagio|conservatory/i,[36.1126,-115.1767]]')) {
    throw new Error('Style two day-map geocode patch did not apply.');
  }
  return true;
}

export default async function handler(req, res) {
  const response = await fetch(TRAVEL_BUNDLE, { headers: { accept: 'application/javascript,*/*' } });
  if (!response.ok) {
    res.statusCode = 502;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(`Unable to fetch product TREK bundle (${response.status}).`);
    return;
  }
  const source = await response.text();
  let patched;
  try {
    patched = patchStyleTwoToConfigRenderer(source);
    assertPatchedStyleTwo(patched);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(error.message || 'Style two bundle patch failed.');
    return;
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(patched);
}
