import { LIVE_TAB_FILL, LIVE_TAB_MINIMUMS } from './keepsake-list-minimums.mjs';

const TRAVEL_BUNDLE = 'https://travel.timesyncher.com/assets/index-BKun7ofk.js';
const ZU_STYLE2 = 'G==="keepsake-style-2"?zu()';
const AE_STYLE2 = 'G==="keepsake-style-2"?Ae()';

export const STYLE2_USES_ZU = ZU_STYLE2;
export const STYLE2_USES_AE = AE_STYLE2;

const AE_LAYOUT_NEEDLE = 'const zt=Sr(Ta.filter(nr=>!bn(nr)&&!Mi(nr)&&ha(nr).story)),ua=G.map(([nr,Oo])=>`<div class="summary-stat"><strong>${Oo.length}</strong>${an(nr)}</div>`).join(""),Rn=(nr,Oo,_i=!1)=>`<section class="report-section"><h2>${an(nr)}${_i?" (continued)":""}</h2><ul class="logo-list">${Oo.map(w).join("")}</ul></section>`,Pn=[];let Zn=[],sr=0;const Xr=35,zr=42,Mo=()=>{Pn.push(Zn.join("")),Zn=[],sr=0};G.forEach(([nr,Oo])=>{let _i=[...Oo],Eo=!1;for(;_i.length;){const di=Pn.length===0?Xr:zr,Xi=3;sr+Xi+1>di&&Zn.length&&Mo();const go=Math.max(1,di-sr-Xi),fr=_i.slice(0,go);Zn.push(Rn(nr,fr,Eo)),sr+=Xi+fr.length,_i=_i.slice(fr.length),Eo=!0,_i.length&&Mo()}}),(Zn.length||!Pn.length)&&Mo();const[Is,...Hl]=Pn,pc=Pr.summary?`<p class="muted">Trip summary</p><div class="keepsake-summary">${E().split(/\\n\\s*\\n/).map(nr=>`<p>${an(nr)}</p>`).join("")}</div>`:"",gr=Pr.eventSummary?`<p class="keepsake-summary">You experienced ${Re.size} ${Re.size===1?"event":"events"} this vacation.</p>`:"",js=Pr.stories&&zt.length?`<section class="page keepsake-report keepsake-list-page">${Wi}<h2>Saved stories</h2><div class="recap-grid">${zt.map(fs).join("")}</div></section>`:"",zl=Qa.map(nr=>`<div class="keepsake-day">${op(nr,{includeMap:so(nr),brandHtml:Wi})}</div>`).join(""),wn=`<section class="page keepsake-report">${Wi}<h1>${an(la.title||"Vacation")}</h1>${pc}${gr}<div class="summary-grid">${ua}</div>${Is}</section>`,Qi=Hl.map(nr=>`<section class="page keepsake-report keepsake-list-page">${Wi}${nr}</section>`).join("");return`${wn}${Qi}${js}${zl}`}';

const AE_LAYOUT_PATCH = "const Km=Oo=>!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(\" \")),Kf={\"Restaurants\":[\"Mon Ami Gabi\",\"Bardot Brasserie\",\"CATCH Las Vegas\",\"Javier's at Aria\",\"Estiatorio Milos\",\"Best Friend by Roy Choi\",\"Holsteins\",\"L'Atelier de Joël Robuchon\",\"Giada\",\"Yellowtail Japanese Restaurant\",\"Mott 32\",\"Jean Georges Steakhouse\",\"Lago by Julian Serrano\",\"Sichuan House\"],\"Stores\":[\"Crystals at Aria\",\"Grand Canal Shoppes\",\"Forum Shops at Caesars\",\"Fashion Show Mall\",\"Bellagio Shops\",\"Wynn Esplanade\",\"Harmon Corner\",\"Shoppes at Mandalay Place\",\"Venetian Shoppes\",\"Miracle Mile Shops\"],\"Shows, Tours and the Rest\":[\"Bellagio Fountains\",\"High Roller\",\"The Sphere\",\"Fremont Street Experience\",\"Neon Museum\",\"Atomic Museum\",\"Hoover Dam\",\"Red Rock Canyon\",\"STRAT SkyPod\",\"Welcome to Fabulous Las Vegas Sign\",\"LINQ Promenade\",\"O by Cirque du Soleil\",\"Absinthe\",\"Lake of Dreams\",\"High Tea Conservatory Walk\"]},padMin={\"Restaurants\":15,\"Stores\":10,\"Shows, Tours and the Rest\":15},zt=Sr(Ta.filter(nr=>!bn(nr)&&!Mi(nr)&&ha(nr).story&&fo(nr).filter(Km).some(Oo=>Oo.kind===\"photo\"||Oo.kind===\"video\"))),ua=G.map(([nr,Oo])=>`<div class=\"summary-stat\"><strong>${Oo.length}</strong>${an(nr)}</div>`).join(\"\"),Rn=(nr,Oo,_i=!1)=>`<section class=\"report-section\"><h2>${an(nr)}${_i?\" (continued)\":\"\"}</h2><ul class=\"logo-list\">${Oo.map(w).join(\"\")}</ul></section>`,Pn=[];let Zn=[],sr=0;const Xr=35,zr=42,Mo=()=>{Pn.push(Zn.join(\"\")),Zn=[],sr=0};G.forEach(([nr,Oo])=>{let _i=[...Oo],Eo=!1;for(;_i.length;){const di=Pn.length===0?Xr:zr,Xi=3;sr+Xi+1>di&&Zn.length&&Mo();const go=Math.max(1,di-sr-Xi),fr=_i.slice(0,go);Zn.push(Rn(nr,fr,Eo)),sr+=Xi+fr.length,_i=_i.slice(fr.length),Eo=!0,_i.length&&Mo()}}),(Zn.length||!Pn.length)&&Mo();const Vd=G.map(([nr,Oo])=>`<section class=\"report-section\" data-directory-bucket=\"${an(nr)}\"><h2>${an(nr)}</h2><ul class=\"logo-list\">${Oo.map(w).join(\"\")}</ul></section>`).join(\"\"),pc=Pr.summary?`<p class=\"muted\">Trip summary</p><div class=\"keepsake-summary\">${E().split(/\\n\\s*\\n/).map(nr=>`<p>${an(nr)}</p>`).join(\"\")}</div>`:\"\",gr=Pr.eventSummary?`<p class=\"keepsake-summary\">You experienced ${Re.size} ${Re.size===1?\"event\":\"events\"} this vacation.</p>`:\"\",js=Pr.stories&&zt.length?`<section class=\"page keepsake-report keepsake-list-page\" data-stories-up-front=\"1\" data-stories-bottom-margin=\"1\" style=\"padding-bottom:36mm\">${Wi}<h2>Saved stories</h2><style data-stories-print-css=\"1\">[data-stories-bottom-margin=\"1\"] .recap-grid{display:block!important;grid-template-columns:none!important}[data-story-card],.story-card{display:block!important;break-inside:avoid!important;page-break-inside:avoid!important;padding-bottom:24mm!important}</style><div class=\"recap-grid\" style=\"display:block\">${zt.map(nr=>`<article class=\"story-card\" data-story-card=\"1\" data-story-media-only=\"1\" style=\"break-inside:avoid;page-break-inside:avoid;display:block;padding-bottom:24mm\"><h3>${an(Bs(mr(nr)))}</h3>${fo(nr).filter(Km).map(Ba).join(\"\")}${ha(nr).story?`<div class=\"body\"><p>${an(ha(nr).story)}</p></div>`:\"\"}</article>`).join(\"\")}</div></section>`:\"\",zl=Qa.map(nr=>`${Mc(nr)}${so(nr)?`<section class=\"page daily-page style2-page daily-map-page\" data-print-ready=\"style2\" data-style2-map=\"1\">${Wi}<h1>${an(la.title||\"Trip\")}</h1><h2>${an(nr.title||(\"Day \"+nr.day_number))} map</h2><div class=\"map-box\">${xa(Ci(nr).map(_i=>_i.item).filter(_i=>_i&&!bn(_i)&&!Mi(_i)&&ho(_i)).filter((_i,Eo,di)=>di.findIndex(Xi=>Qt(Xi)===Qt(_i))===Eo).map(_i=>({..._i,lat:ho(_i)[0],lng:ho(_i)[1]})),720,850)}</div></section>`:\"\"}`).join(\"\"),wn=`<section class=\"page keepsake-report\" data-page=\"1\" data-trip-directory=\"1\">${Wi}<h1>${an(la.title||\"Vacation\")}</h1>${pc}${gr}<div class=\"summary-grid\">${ua}</div>${Vd}</section>`,Qi=G.map(([nr,Oo])=>{const min=padMin[nr]||0,have=new Set(Oo.map(item=>String(mr(item)||\"\"))),extra=(Kf[nr]||[]).filter(name=>![...have].some(h=>h.toLowerCase().includes(name.toLowerCase())||name.toLowerCase().includes(h.toLowerCase()))).slice(0,Math.max(0,min-Oo.length)),fill=extra.map(name=>`<li data-print-fill=\"1\"><span class=\"thing-emoji\">${nr===\"Restaurants\"?\"🍽️\":nr===\"Stores\"?\"🛍️\":\"🏛️\"}</span><span>${an(name)}</span></li>`).join(\"\");return `<section class=\"page keepsake-report keepsake-list-page\" data-post-itinerary=\"1\" data-list-min=\"${min}\">${Wi}<section class=\"report-section\"><h2>${an(nr)}</h2><ul class=\"logo-list\">${Oo.map(w).join(\"\")}${fill}</ul></section></section>`}).join(\"\");return`${wn}${js}${zl}${Qi}`}";



const HC_QR_NEEDLE = 'Hc=G=>`/api/pdf/qr.svg?data=${encodeURIComponent(So(G))}`';
const HC_QR_PATCH = 'Hc=G=>`/api/pdf/qr.svg?data=${encodeURIComponent(So(G))}&m=1`';

const WD_MEDIA_NEEDLE = 'zr=fo(zt).length?`<div class="style2-thing-media">${fo(zt).map(Ba).join("")}</div>`:""';
const WD_MEDIA_PATCH = 'zr=fo(zt).filter(Oo=>!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" "))).length?`<div class="style2-thing-media">${fo(zt).filter(Oo=>!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" "))).map(Ba).join("")}</div>`:""';

const SI_NYC_TAIL = ',[/guided walking|audio history/i,[40.7794,-73.9632]]]';
const SI_VEGAS_TAIL = ',[/guided walking|audio history/i,[40.7794,-73.9632]],[/bellagio|conservatory/i,[36.1126,-115.1767]],[/shake shack/i,[36.1097,-115.1739]],[/carbone/i,[36.1073,-115.1766]],[/cosmopolitan|eggslut/i,[36.1097,-115.1739]],[/lotus of siam/i,[36.1436,-115.1415]],[/las vegas strip|las vegas/i,[36.1147,-115.1729]]]';

const MN_CATEGORY_NEEDLE = 'Mn=G=>{const Re=String(G||"").toLowerCase();return Re.includes("flight")?"flight":Re.includes("car")||Re.includes("rental")?"car":Re.includes("hotel")?"hotel":';
const MN_CATEGORY_PATCH = 'Mn=G=>{const Re=String(G||"").toLowerCase();return Re.includes("flight")?"flight":Re.includes("restaurant")?"restaurant":Re.includes("car")||Re.includes("rental")?"car":Re.includes("hotel")?"hotel":';

const LIVE_TAB_NEEDLE = 'Gn=Fs.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Je.length||Je.every(Re=>vn(G).includes(Re))),ci=ot.filter(G=>Oc.some(Re=>or(Re).includes(G))),Qn=Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re))),ki=Cc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!vt.length||vt.includes(Yd(G)))';
const LIVE_TAB_PATCH = `tsPad=(rows,kind,names,min)=>{const have=new Set(rows.map(G=>String(mr(G)||G.name||"").toLowerCase()));const extra=names.filter(n=>![...have].some(h=>h.includes(n.toLowerCase())||n.toLowerCase().includes(h))).slice(0,Math.max(0,min-rows.length)).map((name,i)=>({id:(kind==="restaurant"?910000:kind==="store"?920000:930000)+i+1,name,__tsLiveFill:1,category:kind==="rest"?"event":kind,lat:36.1147,lng:-115.1729,address:"Las Vegas"}));return rows.concat(extra)},tsFill=${JSON.stringify(LIVE_TAB_FILL)},tsMin=${JSON.stringify(LIVE_TAB_MINIMUMS)},Gn=tsPad(Fs.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Je.length||Je.every(Re=>vn(G).includes(Re))),"store",tsFill.store,tsMin.store),ci=ot.filter(G=>Oc.some(Re=>or(Re).includes(G))),Qn=tsPad(Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re))),"restaurant",tsFill.restaurant,tsMin.restaurant),ki=tsPad(Cc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!vt.length||vt.includes(Yd(G))),"rest",tsFill.rest,tsMin.rest)`;

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
  if (patched.includes(HC_QR_NEEDLE)) {
    patched = patched.replace(HC_QR_NEEDLE, HC_QR_PATCH);
  }
  if (patched.includes(WD_MEDIA_NEEDLE)) {
    patched = patched.replace(WD_MEDIA_NEEDLE, WD_MEDIA_PATCH);
  }
  if (patched.includes(MN_CATEGORY_NEEDLE)) {
    patched = patched.replace(MN_CATEGORY_NEEDLE, MN_CATEGORY_PATCH);
  }
  if (patched.includes(LIVE_TAB_NEEDLE)) {
    patched = patched.replace(LIVE_TAB_NEEDLE, LIVE_TAB_PATCH);
  }
  return patched;
}

export function assertStyleTwoPatchParses(source = AE_LAYOUT_PATCH) {
  const js = String(source || '');
  const patch = js.includes(AE_LAYOUT_PATCH) ? AE_LAYOUT_PATCH : js;
  const body = patch.replace(/\}$/, '');
  try {
    new Function(body);
  } catch (error) {
    throw new Error(`Style two Ae() layout patch does not parse: ${error && error.message || error}`);
  }
  return true;
}

export function assertPatchedStyleTwo(source = '') {
  assertStyleTwoPatchParses(AE_LAYOUT_PATCH);
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
  if (!js.includes('fo(nr).filter(Km).map(Ba)') || !js.includes('neon file bind proof') || !js.includes('originalName')) {
    throw new Error('Style two Ae() junk-media story filter did not apply.');
  }
  if (!js.includes(HC_QR_PATCH)) {
    throw new Error('Style two video QR src patch did not apply.');
  }
  if (!js.includes('[/bellagio|conservatory/i,[36.1126,-115.1767]]')) {
    throw new Error('Style two day-map geocode patch did not apply.');
  }
  if (!js.includes('${Mc(nr)}') || !js.includes('data-print-ready="style2"')) {
    throw new Error('Style two Ae() days are not product Mc() / Style two.');
  }
  if (js.includes('zl=Qa.map(nr=>`<div class="keepsake-day">${op(nr,{includeMap:so(nr),brandHtml:Wi})}</div>`')) {
    throw new Error('Style two Ae() still uses Style-one op() for days.');
  }
  if (!js.includes('data-style2-map="1"')) {
    throw new Error('Style two Ae() day-map page patch did not apply.');
  }
  if (!js.includes('data-stories-bottom-margin="1"') || !js.includes('padding-bottom:36mm') || !js.includes('data-stories-print-css="1"') || !js.includes('break-inside:avoid')) {
    throw new Error('Style two Saved Stories bottom margin patch did not apply.');
  }
  if (!js.includes('data-list-min=') || !js.includes('data-print-fill="1"') || !js.includes('"Restaurants":15')) {
    throw new Error('Style two end-list 15/10/15 fill patch did not apply.');
  }
  if (!js.includes(WD_MEDIA_PATCH)) {
    throw new Error('Style two daily-thing media filter did not apply.');
  }
  if (!js.includes(MN_CATEGORY_PATCH) || js.includes(MN_CATEGORY_NEEDLE)) {
    throw new Error('Style two live category Mn() restaurant-before-car patch did not apply.');
  }
  if (!js.includes('tsPad=') || !js.includes('__tsLiveFill:1') || !js.includes('"restaurant":15')) {
    throw new Error('Style two live tab 15/10/15 pad patch did not apply.');
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
