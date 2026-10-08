import { readFile } from 'node:fs/promises';
import { assertServedBundleClean, rewriteAppConfigCallers, stripCannedBundle, stripServedQaCopy, SERVED_SO, SO_ORIGIN_NEEDLE } from '../../scripts/strip-served-trek-bundle.mjs';
import {
  applyLiveProductPatches,
  applySharedLiveTabBundlePatches,
  GN_EMPTY_PATCH,
  GN_RENDER_PATCH,
  KI_EMPTY_PATCH,
  KI_RENDER_PATCH,
  patchThingLogoChipAlignment,
  LIST_LOGO_PATCH,
  QN_EMPTY_PATCH,
  QN_RENDER_PATCH,
  REST_TYPE_CHIPS_NEEDLE,
  REST_TYPE_CHIPS_PATCH,
  stripHotelBrandNameGuessing,
} from './trek-live-product-patches.mjs';
import { patchThingDetailRatings } from './trek-thing-detail-ratings-patch.mjs';

const SERVED_BUNDLE = new URL('../../public/assets/index-BKun7ofk.js', import.meta.url);
const ZU_STYLE2 = 'G==="keepsake-style-2"?zu()';
const AE_STYLE2 = 'G==="keepsake-style-2"?Ae(!0)';

// Saved-story flag lives on the Thing. Style one fs() + Style two Ae(true) always embed
// that Thing's bound_media / /ts-thing-media image BYTES (printDataUrl) in THIS print code.
// Drop TREK 1024² @ 3071B placeholder canvases and 960×640 color-card stubs.
// SoTs: saved-story-media-in-print-code-20260916, saved-story-flag-on-thing-20260916.

export const STYLE2_USES_ZU = ZU_STYLE2;
export const STYLE2_USES_AE = AE_STYLE2;

const AE_LAYOUT_NEEDLE = 'const zt=Sr(Ta.filter(nr=>!bn(nr)&&!Mi(nr)&&ha(nr).story)),ua=G.map(([nr,Oo])=>`<div class="summary-stat"><strong>${Oo.length}</strong>${an(nr)}</div>`).join(""),Rn=(nr,Oo,_i=!1)=>`<section class="report-section"><h2>${an(nr)}${_i?" (continued)":""}</h2><ul class="logo-list">${Oo.map(w).join("")}</ul></section>`,Pn=[];let Zn=[],sr=0;const Xr=35,zr=42,Mo=()=>{Pn.push(Zn.join("")),Zn=[],sr=0};G.forEach(([nr,Oo])=>{let _i=[...Oo],Eo=!1;for(;_i.length;){const di=Pn.length===0?Xr:zr,Xi=3;sr+Xi+1>di&&Zn.length&&Mo();const go=Math.max(1,di-sr-Xi),fr=_i.slice(0,go);Zn.push(Rn(nr,fr,Eo)),sr+=Xi+fr.length,_i=_i.slice(fr.length),Eo=!0,_i.length&&Mo()}}),(Zn.length||!Pn.length)&&Mo();const[Is,...Hl]=Pn,pc=Pr.summary?`<p class="muted">Trip summary</p><div class="keepsake-summary">${E().split(/\\n\\s*\\n/).map(nr=>`<p>${an(nr)}</p>`).join("")}</div>`:"",gr=Pr.eventSummary?`<p class="keepsake-summary">You experienced ${Re.size} ${Re.size===1?"event":"events"} this vacation.</p>`:"",js=Pr.stories&&zt.length?`<section class="page keepsake-report keepsake-list-page">${Wi}<h2>Saved stories</h2><div class="recap-grid">${zt.map(fs).join("")}</div></section>`:"",zl=Qa.map(nr=>`<div class="keepsake-day">${op(nr,{includeMap:so(nr),brandHtml:Wi})}</div>`).join(""),wn=`<section class="page keepsake-report">${Wi}<h1>${an(la.title||"Vacation")}</h1>${pc}${gr}<div class="summary-grid">${ua}</div>${Is}</section>`,Qi=Hl.map(nr=>`<section class="page keepsake-report keepsake-list-page">${Wi}${nr}</section>`).join("");return`${wn}${Qi}${js}${zl}`}';

const AE_LAYOUT_PATCH = "const Km=Oo=>!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(\" \")),zt=Sr(Ta.filter(nr=>!bn(nr)&&!Mi(nr)&&ha(nr).story)),ua=Gs.map(([nr,Oo])=>`<div class=\"summary-stat\" data-summary-itinerary=\"1\"><strong>${Oo.length}</strong>${an(nr)}</div>`).join(\"\"),Rn=(nr,Oo,_i=!1)=>`<section class=\"report-section\" data-directory-bucket=\"${an(nr)}\" data-summary-itinerary=\"1\"><h2>${an(nr)}${_i?\" (continued)\":\"\"}</h2><ul class=\"logo-list\">${Oo.map(w).join(\"\")}</ul></section>`,Pn=[];let Zn=[],sr=0;const Xr=22,zr=32,Mo=()=>{Pn.push(Zn.join(\"\")),Zn=[],sr=0};Gs.forEach(([nr,Oo])=>{let _i=[...Oo],Eo=!1;for(;_i.length;){const di=Pn.length===0?Xr:zr,Xi=3;sr+Xi+1>di&&Zn.length&&Mo();const go=Math.max(1,di-sr-Xi),fr=_i.slice(0,go);Zn.push(Rn(nr,fr,Eo)),sr+=Xi+fr.length,_i=_i.slice(fr.length),Eo=!0,_i.length&&Mo()}}),(Zn.length||!Pn.length)&&Mo();const[Is,...Hl]=Pn,pc=Pr.summary?`<p class=\"muted\">Trip summary</p><div class=\"keepsake-summary\">${E().split(/\\n\\s*\\n/).map(nr=>`<p>${an(nr)}</p>`).join(\"\")}</div>`:\"\",gr=Pr.eventSummary?`<p class=\"keepsake-summary\">You experienced ${Re.size} ${Re.size===1?\"event\":\"events\"} this vacation.</p>`:\"\",tsMapsOn=Qa.some(so),tsPrintCss=`<style data-keepsake-print-css=\"1\">@page{size:Letter;margin-top:0;margin-bottom:16mm;margin-left:9mm;margin-right:9mm;@top-left{content:none}@top-right{content:none}@top-center{content:none}@bottom-left{content:none}@bottom-right{content:none}@bottom-center{content:\"Page \" counter(page) \" of \" counter(pages);font-size:10pt;text-align:center}}.page,.daily-page,.keepsake-report,.style2-page{padding:18mm 9mm 12mm 9mm!important;box-sizing:border-box;-webkit-box-decoration-break:clone;box-decoration-break:clone}[data-summary-continued=\"1\"]{padding-top:18mm!important;box-sizing:border-box}.style2-page,.daily-page{height:auto!important;min-height:0!important;overflow:visible!important}.style2-page{display:block!important;text-align:center!important}@media print{.daily-page,.style2-page{height:auto!important;min-height:0!important;overflow:visible!important}.daily-details{display:grid!important;grid-template-columns:1fr 1fr!important}.style2-details,[data-print-ready=style2] .style2-details{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 12px!important;align-items:start!important}}[data-style2-centered-day]{display:block!important;break-after:auto!important;page-break-after:auto!important}.style2-page h1{width:100%}.print-brand,.print-brand .ts-logo,img.pdf-final-logo{display:none!important}[data-print-title=\"1\"],.ts-print-header,h1{string-set:print-title content()}[data-print-chrome-header=\"1\"],.ts-print-header{position:fixed;top:4mm;left:0;right:0;text-align:center;font-size:11pt;font-weight:600;color:#111827;z-index:2147483646;pointer-events:none}[data-print-chrome-footer=\"1\"]{position:fixed;bottom:3mm;left:0;right:0;text-align:center;font-size:10pt;color:#111827;z-index:2147483646;pointer-events:none}.pdf-page-counter,.page-count,.muted.page-count{display:none!important;position:static!important}.style2-thing,.thing.style2-thing{position:relative!important;padding:12px!important;padding-right:12px!important;display:flex!important;flex-direction:column!important}.style2-thing-meta,.style2-thing .style2-thing-meta{position:static!important;top:auto!important;right:auto!important;width:auto!important;max-width:100%!important;margin:0 0 2px!important;text-align:left!important;white-space:normal}.style2-thing .thing-head{min-width:0!important;padding-right:0!important}.style2-thing .thing-head h3,.style2-thing h3{max-width:100%!important;padding-right:0!important;margin-right:0!important;overflow-wrap:break-word;word-break:normal;white-space:normal}[data-last-content-page=\"1\"]{padding-bottom:22mm!important}[data-last-page-logo=\"1\"]{display:flex!important;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:center;gap:10px;text-align:center;width:100%;margin-top:10mm;padding:4mm 0 2mm;break-before:avoid;page-break-before:avoid;break-inside:avoid;page-break-inside:avoid;font-family:Georgia,serif;font-size:13px;font-weight:700;letter-spacing:.04em;color:#111827}[data-last-page-logo=\"1\"] .ts-logo{display:inline-block!important;width:28px;height:28px;margin:0;object-fit:contain;flex:0 0 auto}main.daily-details[data-day-things-flow=\"1\"]{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 12px!important;align-items:start!important;width:100%!important}main.style2-details[data-day-things-flow=\"1\"],[data-print-ready=style2] [data-day-things-flow=\"1\"]{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 12px!important;align-items:start!important;width:100%!important}[data-day-things-flow=\"1\"] .daily-thing{width:auto!important;max-width:100%!important;min-width:0!important;padding-right:12px!important;margin:0 0 8px!important;break-inside:auto;page-break-inside:auto;display:block!important}.style2-details>.thing,.style2-details>.style2-thing,[data-print-ready=style2] [data-day-things-flow=\"1\"]>.thing{display:block!important;width:auto!important;max-width:100%!important;min-width:0!important;margin:0 0 8px!important;break-inside:auto;page-break-inside:auto}[data-stories-two-col=\"1\"] .recap-grid,[data-stories-packed=\"1\"] .recap-grid,.recap-grid[data-stories-grid=\"2\"]{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 12px!important;align-items:start!important}[data-stories-two-col=\"1\"] .story-card,[data-stories-two-col=\"1\"] [data-story-card],[data-stories-packed=\"1\"] .story-card{display:block!important;width:auto!important;max-width:100%!important;min-width:0!important;margin:0 0 8px!important;break-inside:auto;page-break-inside:auto}.style2-page .print-media-card.video,.daily-page .print-media-card.video,.style2-day-media .print-media-card.video,[data-daily-thing-media] .print-media-card.video{display:none!important}.print-media-card{display:block;margin:0 0 8px;vertical-align:top;max-width:100%;width:auto}.print-media-card>img{width:100%!important;max-width:100%!important;height:auto!important;max-height:110px!important;object-fit:contain!important;border-radius:10px;background:#f8fafc}.print-media-card.video>img.print-media-qr{width:72px;height:72px;object-fit:contain;background:#fff}.daily-map-page,[data-day-map-page=\"1\"]{break-before:page!important;page-break-before:always!important;break-after:page!important;page-break-after:always!important;break-inside:avoid!important;page-break-inside:avoid!important;min-height:100vh!important;height:100vh!important;max-height:100vh!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;padding:10mm 6mm 8mm 6mm!important;box-sizing:border-box!important}.daily-map-page h1,.daily-map-page .page-count,.daily-map-page .map-caption,[data-day-map-page=\"1\"] h1,[data-day-map-page=\"1\"] .page-count,[data-day-map-page=\"1\"] .map-caption{display:none!important}.daily-map-page h2,[data-day-map-page=\"1\"] h2{margin:0 0 6px!important;font-size:16px}.daily-map-page .map-box,[data-day-map-page=\"1\"] .map-box,[data-day-map-fill=\"1\"]{flex:1 1 auto!important;height:auto!important;min-height:0!important;width:100%!important;margin:0!important}.daily-map-page .static-print-map,.daily-map-page .leaflet-print-map,[data-day-map-page=\"1\"] .static-print-map,[data-day-map-page=\"1\"] .leaflet-print-map,img.static-print-map{width:100%!important;height:100%!important;object-fit:fill!important}[data-end-continuous=\"1\"]{break-before:auto!important;page-break-before:auto!important;break-after:auto!important;page-break-after:auto!important}.keepsake-day:last-child .daily-page:not(.daily-map-page):not([data-day-map-page]),.keepsake-day:last-of-type .daily-page:not(.daily-map-page):not([data-day-map-page]){min-height:0!important}[data-post-itinerary=\"1\"]{break-before:page!important;page-break-before:always!important}[data-endlist-maps=\"0\"] .map-box,[data-post-itinerary=\"1\"] .map-box,[data-end-continuous=\"1\"] .map-box,[data-end-continuous=\"1\"] .static-print-map,[data-end-continuous=\"1\"] .leaflet-print-map{display:none!important}[data-end-continuous=\"1\"] .report-section{break-inside:auto;page-break-inside:auto;break-before:auto;page-break-before:auto}[data-end-continuous=\"1\"] .report-section>h2{break-after:avoid;page-break-after:avoid}[data-end-continuous=\"1\"] .logo-list>li{break-inside:avoid;page-break-inside:avoid}.style2-day-opening{display:block!important;text-align:center!important;margin:0 auto 16px!important;max-width:560px!important;width:100%!important;float:none!important}.style2-timeline{display:inline-grid!important;margin:0 auto!important;text-align:left}.style2-details{width:100%!important;text-align:left!important;float:none!important;clear:both!important}.style2-page .daily-grid,.style2-page .daily-left{display:none!important}[data-end-two-col=\"1\"] .logo-list,.logo-list[data-end-list=\"1\"],[data-trip-directory=\"1\"] .logo-list{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 18px!important;columns:unset!important}</style>`,js=Pr.stories&&zt.length?(s2?`<section class=\"page keepsake-report keepsake-list-page\" data-stories-up-front=\"1\" data-stories-two-col=\"1\" data-stories-packed=\"1\" data-day-things-2col=\"1\"><h2>Saved stories</h2><style data-stories-print-css=\"1\">[data-stories-packed=\"1\"] .recap-grid,[data-stories-two-col=\"1\"] .recap-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 12px!important;align-items:start!important}[data-stories-packed=\"1\"] .story-card,[data-story-card]{display:block!important;width:auto!important;max-width:100%!important;min-width:0!important;break-inside:auto;page-break-inside:auto}[data-stories-packed=\"1\"] .print-media-card>img{width:100%!important;height:auto!important;max-height:110px!important;object-fit:contain!important}</style><div class=\"recap-grid\" data-stories-grid=\"2\" data-day-things-flow=\"1\">${zt.map(nr=>`<article class=\"story-card\" data-story-card=\"1\" data-story-media-only=\"1\" data-saved-story-thing=\"1\" style=\"width:auto;max-width:100%\"><h3>${an(Bs(mr(nr)))}</h3><div data-thing-bound-media=\"1\">${fo(nr).filter(Km).map(Ba).join(\"\")}</div><div class=\"body\">${rr(nr)?`<p data-story-summary=\"1\" style=\"font-size:12px;color:#334155;margin:8px 0 6px\"><strong>Summary.</strong> ${an(Bs(rr(nr)))}</p>`:\"\"}${ha(nr).story?`<p data-story-body=\"1\" style=\"font-size:12px;color:#111827\"><strong>Story.</strong> ${an(ha(nr).story)}</p>`:\"\"}</div></article>`).join(\"\")}</div></section>`:`<section class=\"page keepsake-report keepsake-list-page\" data-stories-packed=\"1\"><h2>Saved stories</h2><div class=\"recap-grid\" data-stories-grid=\"2\">${zt.map(fs).join(\"\")}</div></section>`):\"\",zl=s2?Qa.map(nr=>`<div data-style2-centered-day=\"1\">${Mc(nr)}</div>${so(nr)?`<section class=\"page daily-page daily-map-page\" data-style2-map=\"1\" data-day-map-page=\"1\" data-config-map=\"1\"><h2>${an(nr.title||(\"Day \"+nr.day_number))} map</h2><div class=\"map-box\" data-day-map-fill=\"1\">${xa((Ci(nr)||[]).map(row=>row.item).filter(Boolean),1100,1500)}</div></section>`:\"\"}`).join(\"\"):Qa.map(nr=>`<div class=\"keepsake-day\">${op(nr,{includeMap:so(nr),brandHtml:\"\"})}</div>`).join(\"\"),wn=`<section class=\"page keepsake-report\" data-page=\"1\" data-trip-directory=\"1\" data-summary-itinerary=\"1\">${tsPrintCss}<div class=\"ts-print-header\" data-print-chrome-header=\"1\" data-print-title=\"1\">${an((la.title||\"Vacation\").replace(/^TimeSyncher Vacation\\s*[—–-]\\s*/i,\"\").trim()||\"Vacation\")}</div><div hidden data-config-logo=\"${Wi?\"1\":\"0\"}\" data-logo-last-only=\"1\"></div><h1>${an(la.title||\"Vacation\")}</h1>${pc}${gr}<div class=\"summary-grid\" data-summary-itinerary=\"1\">${ua}</div>${Is}</section>`,sm=Hl.map(nr=>`<section class=\"page keepsake-report keepsake-list-page\" data-summary-continued=\"1\" data-summary-itinerary=\"1\">${nr}</section>`).join(\"\"),Qi=`<section class=\"page keepsake-report\" data-post-itinerary=\"1\" data-end-two-col=\"1\" data-end-continuous=\"1\" data-style1-continuous=\"1\" data-endlist-maps=\"0\" data-last-content-page=\"1\">${G.map(([nr,Oo])=>{const hd=Oo.slice(0,2),tl=Oo.slice(2);return`<section class=\"report-section\" data-directory-bucket=\"${an(nr)}\" data-continuous-cat=\"1\"><div data-cat-keep=\"1\" style=\"break-inside:avoid;page-break-inside:avoid;break-after:avoid;page-break-after:avoid\"><h2>${an(nr)}</h2><ul class=\"logo-list\" data-end-list=\"1\" style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px 18px\">${hd.map(w).join(\"\")}</ul></div>${tl.length?`<ul class=\"logo-list\" data-end-list=\"1\" style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px 18px\">${tl.map(w).join(\"\")}</ul>`:\"\"}</section>`}).join(\"\")}${Wi?`<div class=\"ts-last-page-logo\" data-last-page-logo=\"1\" data-brand-lockup=\"timesyncher-hourglass-vacation\" data-hourglass-between=\"1\"><span>TimeSyncher</span><img class=\"ts-logo\" src=\"/icons/timesyncher-icon-black-transparent.png\" alt=\"\" /><span>Vacation</span></div>`:\"\"}</section>`;return`${wn}${sm}${js}${zl}${Qi}`}";


const HC_QR_NEEDLE = 'Hc=G=>`/api/pdf/qr.svg?data=${encodeURIComponent(So(G))}`';
const HC_QR_PATCH = 'Hc=G=>`/api/pdf/qr.svg?data=${encodeURIComponent(So(G))}&m=1`';

const SO_NEEDLE = SO_ORIGIN_NEEDLE;
const SO_PATCH = SERVED_SO;

const BA_NEEDLE = '`<figure class="print-media-card"><img src="${an(So(G.thumbnailUrl||G.url))}" alt="${an(Re)}" /><figcaption>${an(Re)}</figcaption></figure>`';
const BA_PATCH = '`<figure class="print-media-card" data-print-media="bound"><img src="${an(So(G.printDataUrl||G.print_data_url||G.dataUrl||G.url||G.publicUrl||G.public_url||G.thumbnailUrl))}" alt="${an(Re)}" style="width:100%;max-width:100%;height:auto;max-height:110px;object-fit:contain" /><figcaption>${an(Re)}</figcaption></figure>`';

const FS_NEEDLE = 'fs=G=>{const Re=_l(G),zt=[En(G),bi(G),Zr(G)].filter(Boolean).map(an).join(" · "),ua=[rr(G),Co(G),zi(G)?ha(G).happyHourDetails:"",ha(G).story].filter(Boolean).map(Rn=>`<p>${an(Rn)}</p>`).join("");return`<article class="thing"><div class="thing-head">${Re?`<img class="thing-logo" src="${an(Re)}" />`:`<span class="thing-emoji">${an(Pc(G))}</span>`}<div><h3>${an(Bs(mr(G)))}</h3>${zt?`<div class="thing-meta">${zt}</div>`:""}</div></div>${ua||`<p>${an(Fl(G))}</p>`}</article>`}';
const FS_PATCH = 'fs=G=>{const Re=_l(G),zt=[En(G),bi(G),Zr(G)].filter(Boolean).map(an).join(" · "),ua=[rr(G),Co(G),zi(G)?ha(G).happyHourDetails:"",ha(G).story].filter(Boolean).map(Rn=>`<p>${an(Rn)}</p>`).join(""),Pn=fo(G).filter(Oo=>!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" ")));return`<article class="thing" data-saved-story-thing="1" data-story-media="bound"><div class="thing-head">${Re?`<img class="thing-logo" src="${an(Re)}" />`:`<span class="thing-emoji">${an(Pc(G))}</span>`}<div><h3>${an(Bs(mr(G)))}</h3>${zt?`<div class="thing-meta">${zt}</div>`:""}</div></div>${Pn.length?`<div class="style2-thing-media" data-thing-bound-media="1">${Pn.map(Ba).join("")}</div>`:""}${ua||`<p>${an(Fl(G))}</p>`}</article>`}';

const KL_NEEDLE = 'Kl=G=>String((G==null?void 0:G.url)||(G==null?void 0:G.mediaUrl)||(G==null?void 0:G.fileUrl)||(G==null?void 0:G.src)||(G==null?void 0:G.href)||(G==null?void 0:G.videoUrl)||(G==null?void 0:G.photoUrl)||"").trim()';
const KL_PATCH = 'Kl=G=>String((G==null?void 0:G.printDataUrl)||(G==null?void 0:G.print_data_url)||(G==null?void 0:G.dataUrl)||(G==null?void 0:G.url)||(G==null?void 0:G.publicUrl)||(G==null?void 0:G.public_url)||(G==null?void 0:G.mediaUrl)||(G==null?void 0:G.fileUrl)||(G==null?void 0:G.src)||(G==null?void 0:G.href)||(G==null?void 0:G.videoUrl)||(G==null?void 0:G.photoUrl)||"").trim()';

const HS_NEEDLE = 'Hs=G=>[..._d(G==null?void 0:G.media),..._d(G==null?void 0:G.photos)';
const HS_PATCH = 'Hs=G=>[..._d(G==null?void 0:G.bound_media),..._d(G==null?void 0:G.media),..._d(G==null?void 0:G.photos)';

const PRINT_MEDIA_CSS_NEEDLE = '.print-media-card{margin:0;width:92px;text-align:center;break-inside:avoid}.print-media-card>img{width:92px;height:72px;object-fit:cover;border-radius:10px;border:1px solid #e5e7eb;background:#f8fafc}';
const PRINT_MEDIA_CSS_PATCH = '.print-media-card{margin:0 0 8px;width:auto;max-width:100%;display:block;vertical-align:top;text-align:center;break-inside:avoid}.print-media-card>img{width:100%;max-width:100%;height:auto;max-height:110px;object-fit:contain;border-radius:10px;border:1px solid #e5e7eb;background:#f8fafc}';

const LIST_PAGE_NEEDLE = '.keepsake-list-page{break-before:page;page-break-before:always}';
const LIST_PAGE_PATCH = '.keepsake-list-page{break-before:page;page-break-before:always}[data-end-continuous="1"] .report-section{break-inside:auto;page-break-inside:auto;break-before:auto;page-break-before:auto}[data-post-itinerary="1"]{break-before:page!important;page-break-before:always!important}.keepsake-day:last-child .daily-page:not(.daily-map-page):not([data-day-map-page]),.keepsake-day:last-of-type .daily-page:not(.daily-map-page):not([data-day-map-page]){min-height:0!important}';

const WD_MEDIA_NEEDLE = 'zr=fo(zt).length?`<div class="style2-thing-media">${fo(zt).map(Ba).join("")}</div>`:""';
const WD_MEDIA_PATCH = 'zr=fo(zt).filter(Oo=>Oo&&Oo.kind!=="video"&&!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" "))).length?`<div class="style2-thing-media">${fo(zt).filter(Oo=>Oo&&Oo.kind!=="video"&&!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" "))).map(Ba).join("")}</div>`:""';

const W_LIST_NEEDLE = 'w=G=>{const Re=_l(G);return`<li>${Re?`<img class="tiny-logo" src="${an(Re)}" />`:`<span class="thing-emoji" style="width:22px;height:22px;font-size:13px">${an(Pc(G))}</span>`}<span>${an(Bs(mr(G)))}</span></li>`}';
const W_LIST_PATCH_PRIOR = 'w=G=>{const Re=_l(G),zt=rr(G)||Co(G);return`<li data-list-row="1" data-has-logo="${Re?"1":"0"}" data-logo-src="${an(Re||"")}" data-summary-src="thing" style="align-items:flex-start">${Re?`<img class="tiny-logo" src="${an(Re)}" alt="" />`:`<span class="thing-emoji" style="width:22px;height:22px;font-size:13px">${an(Pc(G))}</span>`}<span><strong>${an(Bs(mr(G)))}</strong>${zt?`<div data-list-summary="1" data-summary-src="thing" style="font-size:12px;font-weight:400;margin-top:3px;line-height:1.4;color:#334155">${an(Bs(zt))}</div>`:""}</span></li>`}';

const W_LIST_PATCH = 'w=G=>{const Re=_l(G),zt=rr(G)||Co(G);return`<li data-list-row="1" data-has-logo="${Re?"1":"0"}" data-logo-src="${an(Re||"")}" data-summary-src="thing" style="display:flex;align-items:center;gap:8px">${Re?`<span data-ts-logo-chip="1" aria-hidden="true" style="width:22px;height:22px;min-width:22px;display:inline-grid;place-items:center;box-sizing:border-box;border-radius:6px;background:#f8fafc;border:1px solid #e5e7eb"><img class="tiny-logo" src="${an(Re)}" alt="" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;object-position:center center;display:block" /></span>`:`<span class="thing-emoji" style="width:22px;height:22px;font-size:13px;display:inline-grid;place-items:center">${an(Pc(G))}</span>`}<span><strong>${an(Bs(mr(G)))}</strong>${zt?`<div data-list-summary="1" data-summary-src="thing" style="font-size:12px;font-weight:400;margin-top:3px;line-height:1.4;color:#334155">${an(Bs(zt))}</div>`:""}</span></li>`}';

const OP_TITLE_NEEDLE = 'const di=`<div class="timeline-title">${an(Bs(_i.title))}</div>`';
const OP_TITLE_PATCH = 'const di=`<div class="timeline-title">${an(Bs(_i.title))}${!/^(travel|travel-to-thing|flight|transport|hotel-wake|hotel-event|hotel-sleep|hotel-checkout)$/i.test(String(_i.type||""))&&!/^Travel (to|from)\\b/i.test(String(_i.title||""))&&rr(_i.item)?`<div data-row-summary="1" data-summary-thing-only="1" style="font-weight:400;font-size:12px;margin-top:3px;line-height:1.4;color:#334155">${an(Bs(rr(_i.item)))}</div>`:""}</div>`';

const SU_TITLE_NEEDLE = '<div class="timeline-title">${an(Bs(Zn.title))}</div>';
const SU_TITLE_PATCH = '<div class="timeline-title">${an(Bs(Zn.title))}${!/^(travel|travel-to-thing|flight|transport|hotel-wake|hotel-event|hotel-sleep|hotel-checkout)$/i.test(String(Zn.type||""))&&!/^Travel (to|from)\\b/i.test(String(Zn.title||""))&&rr(Zn.item)?`<div data-row-summary="1" data-summary-src="thing" data-summary-thing-only="1" style="font-weight:400;font-size:12px;margin-top:3px;line-height:1.4;color:#334155">${an(Bs(rr(Zn.item)))}</div>`:""}</div>';

const DAY_CARD_OVERFLOW_NEEDLE = 'Ki&&(()=>{const G=Ki,Re=Ci(G),zt=li(G);return n.jsxs("div",{style:{background:"var(--bg-card, white)",borderRadius:14,overflow:"hidden",border:"1px solid var(--border-faint, #e5e7eb)"},children:[';
const DAY_CARD_OVERFLOW_PATCH = 'Ki&&(()=>{const G=Ki,Re=Ci(G),zt=li(G);return n.jsxs("div",{"data-ts-day-timeline":"1",style:{background:"var(--bg-card, white)",borderRadius:14,overflow:"visible",border:"1px solid var(--border-faint, #e5e7eb)"},children:[';

const NR_POPUP_WRAP_NEEDLE = 'onMouseLeave:Hl,style:{position:"relative",width:zt?42:58,minWidth:zt?42:58}';
const NR_POPUP_WRAP_PATCH = 'onMouseLeave:Hl,style:{position:"relative",width:zt?42:58,minWidth:zt?42:58,overflow:"visible"}';

const NR_POPUP_NEEDLE = 'js&&n.jsxs("div",{style:{position:"absolute",zIndex:9e3,left:zt?-8:0,bottom:zt?48:66,width:248,background:"white",border:"1px solid #d1d5db",borderRadius:14,boxShadow:"0 18px 45px rgba(15,23,42,0.22)",padding:10},children:[';
const NR_POPUP_PATCH = 'js&&n.jsxs("div",{"data-ts-pic-popup":"1",style:{position:"absolute",zIndex:9e3,left:zt?-8:0,bottom:zt?48:66,width:248,background:"white",border:"1px solid #d1d5db",borderRadius:14,boxShadow:"0 18px 45px rgba(15,23,42,0.22)",padding:10,overflow:"visible"},children:[n.jsx("span",{"aria-hidden":"true","data-ts-pic-popup-tip":"1",style:{position:"absolute",left:18,bottom:-7,width:14,height:14,background:"white",borderRight:"1px solid #d1d5db",borderBottom:"1px solid #d1d5db",transform:"rotate(45deg)",zIndex:0,boxSizing:"content-box",pointerEvents:"none"}}),';

const DE_AE_NEEDLE = 'Ae=()=>{const G=de(!0).filter(([,nr])=>nr.length)';
const DE_AE_PATCH = 'Ae=(s2)=>{const G=de(!1).filter(([,nr])=>nr.length),Gs=de(!0).filter(([,nr])=>nr.length)';

const FO_NEEDLE = 'Rn=Ln.filter(Zn=>ua.includes(Number(Zn.place_id??Zn.placeId)));return Fo([...Rn,...Hs(G),...Hs(ha(G))].map((Zn,sr)=>rp(Zn,sr,Re,zt)).filter(Boolean))}';
const FO_PATCH = 'Rn=Ln.filter(Zn=>ua.includes(Number(Zn.place_id??Zn.placeId)));const bd=[..._d(G&&G.bound_media),..._d(G&&G.item&&G.item.bound_media),..._d((ha(G)||{}).bound_media)];const rows=bd.length?bd:[..._d(G&&G.photos),...Rn,...Hs(G),...Hs(ha(G))];return Fo(rows.map((Zn,sr)=>rp(Zn,sr,Re,zt)).filter(Boolean).filter(Oo=>{const src=String(Oo.url||"");if(/^data:image\\//i.test(src))return src.length>12000;const blob=[Oo.filename,Oo.originalName,Oo.caption,src.slice(0,240),String(Oo.thumbnailUrl||"").slice(0,240),Oo.id].join(" ");return!/placeholder|1024.?1024|default[-_]?thumb|bind[- ]?proof|neon file bind proof/i.test(blob)}))}';

const ND_NEEDLE = 'nd=G=>Fo(li(G))';
const ND_PATCH = 'nd=G=>{const zt=`day:${G.id}`,ua=Zl(zt),Rn=(typeof Ci=="function"?Ci(G):[]).flatMap(Oo=>_d(Oo&&Oo.item&&Oo.item.bound_media));return Rn.length?Fo(Rn.map((Oo,sr)=>rp(Oo,sr,zt,ua)).filter(Boolean)):Fo(li(G))}';

const LOGO_LIST_CSS_NEEDLE = '.logo-list{columns:2;column-gap:18px;margin:0 0 16px;padding:0;list-style:none}';
const LOGO_LIST_CSS_PATCH = '.logo-list{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;margin:0 0 16px;padding:0;list-style:none}';

const STYLE2_OPENING_NEEDLE = '.style2-page h1{font-size:20px;margin-bottom:10px}.style2-day-opening{text-align:center;margin:0 auto 16px;max-width:650px}';
const STYLE2_OPENING_PATCH = '.style2-page{display:block!important;text-align:center;height:auto!important;min-height:0!important;overflow:visible!important;break-inside:auto!important;page-break-inside:auto!important}.style2-page h1{font-size:20px;margin-bottom:10px;width:100%}.style2-day-opening{display:block;text-align:center;margin:0 auto 16px;max-width:560px;width:100%;float:none}.style2-page .style2-details,[data-print-ready=style2] .style2-details{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 12px!important;width:100%!important;text-align:left!important;align-items:start!important}.style2-page .style2-details>.thing,.style2-page .style2-details>.style2-thing{display:block!important;width:auto!important;max-width:100%!important;min-width:0!important}.style2-page .thing-head,.style2-thing .thing-head{grid-template-columns:32px minmax(0,1fr)!important;width:100%}.style2-page h3,.style2-thing h3,.style2-thing .thing-head h3{overflow-wrap:break-word!important;word-break:normal!important;white-space:normal!important}.style2-page .thing,.style2-thing,[data-print-ready=style2] .thing,[data-story-card],.story-card,[data-stories-packed="1"] .thing{break-before:auto!important;break-after:auto!important;page-break-before:auto!important;page-break-after:auto!important}';

const DAILY_THING_NEEDLE = '${Rn}${Pn?`<div class="reviews">${Pn}</div>`:""}</article>`},ws=';
const DAILY_THING_PATCH = '${Rn}${Pn?`<div class="reviews">${Pn}</div>`:""}${fo(G).filter(Oo=>Oo&&Oo.kind!=="video"&&!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" "))).length?`<div class="style2-thing-media" data-daily-thing-media="1">${fo(G).filter(Oo=>Oo&&Oo.kind!=="video"&&!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" "))).map(Ba).join("")}</div>`:""}</article>`},ws=';


const MC_NEEDLE = 'Pn=Rn.slice(0,2),Zn=[];for(let zr=2;zr<Rn.length;zr+=3)Zn.push(Rn.slice(zr,zr+3));const sr=`<section class="page daily-page style2-page" data-print-ready="style2">${cr}<h1>${an(la.title||"Trip")}</h1>${Su(G,Re,Rn.map(zr=>zr.item))}<main class="style2-details">${Pn.map(zr=>wd(zr,G)).join("")}</main></section>`,Xr=Zn.map((zr,Mo)=>`<section class="page daily-page style2-page" data-print-ready="style2">${cr}<h1>${an(la.title||"Trip")}</h1><div class="style2-continued">Day ${an(G.day_number)} continued${G.date?` · ${an(new Date(G.date+"T00:00:00Z").toLocaleDateString(z,{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}))}`:""}</div><main class="style2-details">${zr.map(Is=>wd(Is,G)).join("")}</main></section>`).join("");return sr+Xr}';
const MC_PATCH = 'sr=`<section class="page daily-page style2-page" data-print-ready="style2" data-day-things-2col="1"><h1>${an(la.title||"Trip")}</h1>${Su(G,Re,Rn.map(zr=>zr.item))}<main class="style2-details" data-day-things-flow="1">${Rn.map(zr=>wd(zr,G)).join("")}</main></section>`;return sr}';

const OP_PAGES_NEEDLE = 'zl=[];for(let _i=0;_i<Zn.length;_i+=3)zl.push(Zn.slice(_i,_i+3));zl.length||zl.push([]);const wn=Re.includeMap!==!1,Qi=zl.length+(wn?1:0),nr=zl.map((_i,Eo)=>`<section class="page daily-page" data-print-ready="daily">${zt}<h1>${an(la.title||"Trip")}</h1><div class="muted page-count">Daily printout page ${Eo+1} of ${Qi}</div><div class="daily-grid">${js}<main class="daily-details">${_i.map($r).join("")}</main></div></section>`).join(""),Oo=`<section class="page daily-page daily-map-page" data-print-ready="daily">${zt}<h1>${an(la.title||"Trip")}</h1><div class="muted page-count">Daily printout page ${Qi} of ${Qi}</div><h2>${an(G.title||`Day ${G.day_number}`)} map</h2><p class="map-caption">Actual itinerary map for Day ${an(G.day_number)}, bounded to the mapped Day-by-Day stops.</p>${pc}<div class="map-box">${Hl}</div></section>`;return nr+(wn?Oo:"")}';
const OP_PAGES_PATCH = 'zl=[],wn=Re.includeMap!==!1,Qi=1+(wn?1:0),nr=`<section class="page daily-page" data-print-ready="daily" data-day-things-2col="1"><h1>${an(la.title||"Trip")}</h1><div class="daily-grid">${js}<main class="daily-details" data-day-things-flow="1">${Zn.map($r).join("")}</main></div></section>`,Oo=`<section class="page daily-page daily-map-page" data-print-ready="daily" data-day-map-page="1" data-config-map="1"><h2>${an(G.title||`Day ${G.day_number}`)} map</h2><div class="map-box" data-day-map-fill="1">${xa(Is,1100,1500)}</div></section>`;return nr+(wn?Oo:"")}';

const OP_BRAND_NEEDLE = 'zt=Re.brandHtml??cr';
const OP_BRAND_PATCH = 'zt=""';

const SU_MEDIA_NEEDLE = 'Pn=ua.length?`<div class="style2-day-media">${ua.map(Ba).join("")}</div>`:""';
const SU_MEDIA_PATCH = 'Pn=ua.filter(Oo=>Oo&&Oo.kind!=="video").length?`<div class="style2-day-media">${ua.filter(Oo=>Oo&&Oo.kind!=="video").map(Ba).join("")}</div>`:""';

const STYLE2_HEIGHT_NEEDLE = '.style2-page{height:257mm;min-height:257mm;overflow:hidden}';
const STYLE2_HEIGHT_PATCH = '.style2-page{height:auto!important;min-height:0!important;overflow:visible!important}';

const PRINT_LOCK_NEEDLE = '.daily-page{height:257mm;min-height:257mm;overflow:hidden}.daily-grid{grid-template-columns:36% minmax(0,1fr);gap:12px}.daily-left{position:static}.map-box{height:205px}.daily-details{grid-template-columns:1fr;gap:8px}';
const PRINT_LOCK_PATCH = '.daily-page{height:auto!important;min-height:0!important;overflow:visible!important}.daily-grid{grid-template-columns:38% minmax(0,1fr);gap:12px}.daily-left{position:static}.daily-grid .map-box{height:205px}[data-day-map-page="1"] .map-box,[data-day-map-fill="1"],[data-style2-map] .map-box{height:auto!important;min-height:220mm!important;width:100%!important}.daily-details{grid-template-columns:1fr 1fr!important;gap:8px 12px!important;display:grid!important}';

const THING_META_CSS_NEEDLE = '.style2-thing{position:relative;margin:0 0 10px;padding:12px 124px 12px 12px}.style2-thing h3{font-size:15px}.style2-thing-meta{position:absolute;top:12px;right:12px;width:100px;text-align:right;font-size:9.5px;line-height:1.35;font-weight:900;color:#475569}';
const THING_META_CSS_PATCH = '.style2-thing{position:relative;margin:0 0 10px;padding:12px;display:flex;flex-direction:column;gap:4px;min-width:0}.style2-thing .thing-head{grid-template-columns:32px minmax(0,1fr);width:100%}.style2-thing h3{font-size:15px;padding-right:0;max-width:100%;overflow-wrap:break-word;word-break:normal;white-space:normal;hyphens:manual}.style2-thing-meta{position:static;top:auto;right:auto;width:auto;max-width:100%;text-align:left;font-size:9.5px;line-height:1.35;font-weight:900;color:#475569;margin:0 0 2px}';

const THING_PAD118_NEEDLE = '.style2-thing{padding-right:118px}';
const THING_PAD118_PATCH = '.style2-thing{padding-right:12px!important}';

const WD_META_NEEDLE = 'return`<article class="thing style2-thing"><div class="style2-thing-meta">${an(Mo)}</div><div class="thing-head">';
const WD_META_PATCH = 'return`<article class="thing style2-thing" data-thing-card="1"><div class="style2-thing-meta">${an(Mo)}</div><div class="thing-head">';

const DOC_TITLE_NEEDLE = 'document.title=`TimeSyncher Vacation — ${P.trip.title.replace(/^TimeSyncher Vacation\\s*[—-]\\s*/i,"")}`';
const DOC_TITLE_PATCH = 'document.title=`${P.trip.title.replace(/^TimeSyncher Vacation\\s*[—–-]\\s*/i,"").trim()||"Vacation"}`';

const SE_TITLE_NEEDLE = 'zt=G==="keepsake"?`${la.title||"TimeSyncher Vacation"} Summary`:G==="keepsake-style-2"?`${la.title||"TimeSyncher Vacation"} Keepsake Style 2`:`TimeSyncher Vacation ${G}`';
const SE_TITLE_PATCH = 'zt=(la.title||"Vacation").replace(/^TimeSyncher Vacation\\s*[—–-]\\s*/i,"").replace(/\\s+(Summary|Keepsake Style 2)$/i,"").trim()||"Vacation"';

const XA_DAY_NEEDLE = 'Hl=xa(Is,720,850)';
const XA_DAY_PATCH = 'Hl=xa(Is,1100,1500)';


const CR_NEEDLE = 'cr=\'<div class="print-brand"><span>TimeSyncher</span><img class="ts-logo" src="/icons/timesyncher-icon-black-transparent.png" alt="TimeSyncher" /><span>Vacation</span></div>\',Wi=Pr.logo?cr:""';
const CR_PATCH = 'cr="",Wi=Pr.logo?"1":""';

const ZU_FN_NEEDLE = 'zu=()=>{const G=Pr.summary?`<div class="keepsake-summary">${E().split(/\\n\\s*\\n/).map(zt=>`<p>${an(zt)}</p>`).join("")}</div>`:"";return`<section class="page keepsake-report style2-cover">${Wi}<h1>${an(la.title||"Vacation")} Keepsake</h1><p class="muted">Style two</p>${G}</section>`+Qa.map(zt=>Mc(zt)).join("")}';
const ZU_FN_PATCH = 'zu=()=>Ae(!0)';

const COUNTER_CSS_NEEDLE = '.pdf-page-counter{position:absolute;right:9mm;bottom:5mm;font-size:8px;color:#64748b;font-weight:600}';
const COUNTER_CSS_PATCH = '.pdf-page-counter,.page-count,.muted.page-count{display:none!important;position:static!important;right:auto!important;bottom:auto!important}';

const PRINT_BRAND_CSS_NEEDLE = '.print-brand{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px}';
const PRINT_BRAND_CSS_PATCH = '.print-brand,.print-brand .ts-logo{display:none!important}';

const PDF_FINAL_LOGO_NEEDLE = '.pdf-final-logo{position:absolute;left:50%;bottom:5mm;transform:translateX(-50%);width:24px;height:24px;object-fit:contain}';
const PDF_FINAL_LOGO_PATCH = '.pdf-final-logo{display:none!important}';

const APAGE_ZERO_NEEDLE = '@page{size:Letter;margin:0}';
const APAGE_ZERO_PATCH = '@page{size:Letter;margin-top:0;margin-bottom:16mm;margin-left:9mm;margin-right:9mm;@top-left{content:none}@top-right{content:none}@top-center{content:none}@bottom-left{content:none}@bottom-right{content:none}@bottom-center{content:"Page " counter(page) " of " counter(pages);font-size:10pt;text-align:center}}';

const DAILY_MIN_NEEDLE = '.daily-page{break-after:page;page-break-after:always;min-height:100vh}';
const DAILY_MIN_PATCH = '.daily-page{break-after:page;page-break-after:always;min-height:0}.daily-page.style2-page,[data-print-ready=style2]{min-height:0!important;height:auto!important;overflow:visible!important;display:block!important;break-inside:auto!important;page-break-inside:auto!important}';

const OS_NEEDLE = 'os=(G,Re)=>String((G==null?void 0:G.thumbnailUrl)||(G==null?void 0:G.thumbnail_url)||(G==null?void 0:G.thumbUrl)||(G==null?void 0:G.posterUrl)||(G==null?void 0:G.poster_url)||(G==null?void 0:G.previewUrl)||(G==null?void 0:G.preview_url)||(G==null?void 0:G.imageUrl)||(G==null?void 0:G.image_url)||Re||"").trim()';
const OS_PATCH = 'os=(G,Re)=>String((G==null?void 0:G.printDataUrl)||(G==null?void 0:G.print_data_url)||(G==null?void 0:G.dataUrl)||(G==null?void 0:G.thumbnailUrl)||(G==null?void 0:G.thumbnail_url)||(G==null?void 0:G.thumbUrl)||(G==null?void 0:G.posterUrl)||(G==null?void 0:G.poster_url)||(G==null?void 0:G.previewUrl)||(G==null?void 0:G.preview_url)||(G==null?void 0:G.imageUrl)||(G==null?void 0:G.image_url)||Re||"").trim()';

const RP_NEEDLE = 'return{id:Pn,kind:ms(G),url:Rn,thumbnailUrl:os(G,Rn),caption:Zn';
const RP_PATCH = 'return{id:Pn,kind:ms(G),url:(G&&(G.printDataUrl||G.print_data_url||G.dataUrl))||Rn,thumbnailUrl:(G&&(G.printDataUrl||G.print_data_url||G.dataUrl))||os(G,Rn),printDataUrl:G&&(G.printDataUrl||G.print_data_url||G.dataUrl)||undefined,print_data_url:G&&(G.print_data_url||G.printDataUrl||G.dataUrl)||undefined,caption:Zn';

const DOC_TITLE_TOKEN_NEEDLE = 'r==="8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y"&&(document.title="TimeSyncher Vacation")';
const DOC_TITLE_TOKEN_PATCH = 'void 0';


const THING_BREAK_NEEDLE = '.thing{break-inside:avoid;page-break-inside:avoid;border:1px solid #e5e7eb;border-radius:14px;padding:12px;margin:0 0 10px}';
const THING_BREAK_PATCH = '.thing{break-inside:avoid;page-break-inside:avoid;border:1px solid #e5e7eb;border-radius:14px;padding:12px;margin:0 0 10px}.style2-page .thing,.style2-thing,[data-print-ready=style2] .thing,[data-story-card],.story-card,[data-stories-packed="1"] .thing{break-before:auto!important;break-after:auto!important;page-break-before:auto!important;page-break-after:auto!important}';

const STYLE2_DETAILS_NEEDLE = '.style2-details{display:grid;grid-template-columns:1fr;gap:10px}';
const STYLE2_DETAILS_PATCH = '.style2-details{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 12px;align-items:start}.style2-details>.thing,.style2-details>.style2-thing{display:block!important;width:auto!important;max-width:100%!important;min-width:0!important}';

function productFieldsLiteral() {
  // Trip overrides supply summary and happy-hour text. Do not embed a venue catalog.
  return '[]';
}

const FLIGHT_ROW_NEEDLE = '||Re.split(/\\s+/)[0]||"Airline"';
const FLIGHT_ROW_PATCH = '||Re||"Airline"';
const FLIGHT_FIELDS_NEEDLE = 'bn(Dt)&&n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8},children:[n.jsxs("label",{style:Hn,children:["Takeoff"';
const FLIGHT_FIELDS_PATCH = '(bn(Dt)||ha(Dt).category==="flight"||Dt.category==="flight")&&n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8},children:[n.jsxs("label",{style:Hn,children:["Takeoff"';
const CAR_FIELDS_NEEDLE = 'Mi(Dt)&&n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8},children:[n.jsxs("label",{style:Hn,children:["Rental company"';
const CAR_FIELDS_PATCH = '(Mi(Dt)||ha(Dt).category==="car"||Dt.category==="car")&&n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8},children:[n.jsxs("label",{style:Hn,children:["Rental company"';


const PE_EFFECT_NEEDLE = 'lf.getSharedTrip(r).then(G=>{A(G),G!=null&&G.thingOverrides&&typeof G.thingOverrides=="object"?pe(G.thingOverrides):pe({}),me(!0),ge(!1)})';
const PE_EFFECT_PATCH = 'lf.getSharedTrip(r).then(G=>{A(G);pe((G!=null&&G.thingOverrides&&typeof G.thingOverrides=="object")?G.thingOverrides:{});me(!0);ge(!1)})';


const PRINT_HH_NEEDLE = 'ua=zi(G)?ha(G).happyHourDetails:""';
const PRINT_HH_PATCH = 'ua=(ha(G).happyHour||zi(G))?(ha(G).happyHourDetails||""):""';

const PRINT_HH_ZT_NEEDLE = 'Zn=zi(zt)?ha(zt).happyHourDetails:""';
const PRINT_HH_ZT_PATCH = 'Zn=(ha(zt).happyHour||zi(zt))?(ha(zt).happyHourDetails||""):""';

const PRINT_MODE_NEEDLE = 'h=c.get("printMode")||(i.includes("printMode=daily")?"daily":null)';
const PRINT_MODE_PATCH = 'h=c.get("printMode")||(c.get("style")==="2"||c.get("style")==="style-2"||((/\\/journey\\/?$/.test((typeof window<"u"?window.location.pathname:"")||t.pathname||"")&&(c.get("style")==="1"||c.get("style")==="style-1")))?"report":null)||(i.includes("printMode=daily")?"daily":null)';

const PDF_REPORT_NEEDLE = 'g=c.get("pdfReport")||((Bl=i.match(/[?&]pdfReport=([^&]+)/))==null?void 0:Bl[1])||null';
const PDF_REPORT_PATCH = 'g=c.get("pdfReport")||((Bl=i.match(/[?&]pdfReport=([^&]+)/))==null?void 0:Bl[1])||((c.get("style")==="2"||c.get("style")==="style-2")?"keepsake-style-2":(/\\/journey\\/?$/.test((typeof window<"u"?window.location.pathname:"")||t.pathname||"")&&(c.get("style")==="1"||c.get("style")==="style-1"))?"keepsake":null)';

const PAGE_PAD_NEEDLE = '.page{padding:9mm}';
const PAGE_PAD_PATCH = '.page,.daily-page,.keepsake-report,.style2-page{padding:18mm 9mm 12mm 9mm!important;box-sizing:border-box;-webkit-box-decoration-break:clone;box-decoration-break:clone}@page{size:Letter;margin-top:0;margin-bottom:16mm;margin-left:9mm;margin-right:9mm;@top-left{content:none}@top-right{content:none}@top-center{content:none}@bottom-left{content:none}@bottom-right{content:none}@bottom-center{content:"Page " counter(page) " of " counter(pages);text-align:center}}';

const SHARED_ROUTE_NEEDLE = 'n.jsx(tc,{path:"/shared/:token",element:n.jsx(wse,{})})';
const SHARED_ROUTE_PATCH = 'n.jsx(tc,{path:"/shared/:token",element:n.jsx(wse,{})}),n.jsx(tc,{path:"/shared/:token/journey",element:n.jsx(wse,{})})';

const SE_NEEDLE = 'function _se({title:e,html:t,styles:i}){return I.useEffect(()=>{const c=()=>{const h=Array.from(document.querySelectorAll(".page")),p=h.length,g=!!document.querySelector(".print-brand");h.forEach((r,x)=>{if(!r.querySelector(".pdf-page-counter")){const z=document.createElement("div");z.className="pdf-page-counter",z.textContent=`Page ${x+1} of ${p}`,r.appendChild(z)}if(x===p-1&&g&&!r.querySelector(".pdf-final-logo")){const z=document.createElement("img");z.className="pdf-final-logo",z.src="/icons/timesyncher-icon-black-transparent.png",z.alt="TimeSyncher",r.appendChild(z)}})};document.open(),document.write(`<!doctype html><html><head><title>${e.replace(/[&<>\\"]/g,"")}</title>${i}</head><body>${t}<script>(${c.toString()})();<\\/script></body></html>`),document.close()},[e,t,i]),n.jsx("div",{style:{padding:20,fontFamily:"system-ui, sans-serif"},children:"Preparing PDF…"})}';

const SE_PATCH = 'function _se({title:e,html:t,styles:i}){const seTitle=String(e||"").replace(/^TimeSyncher Vacation\s*[—–-]\s*/gi,"").replace(/\s+(Summary|Keepsake Style 2)$/i,"").trim()||"Vacation";const seGo=()=>{if(typeof document>"u"||!t)return;if(document.body&&document.body.getAttribute("data-ae-print")==="1")return;const c=async()=>{const imgs=Array.from(document.querySelectorAll(".print-media-card>img:not(.print-media-qr)"));await Promise.all(imgs.map(async r=>{const x=r.getAttribute("src")||"";if(/^data:image\\/(jpeg|jpg|png|webp);base64,/i.test(x)&&x.length>12000){r.setAttribute("data-print-inlined","1");return}try{const z=new URL(x,document.baseURI).href;if(/^data:/i.test(z)&&z.length<12000){r.remove();return}const U=await fetch(z,{cache:"reload"});if(!U.ok){r.remove();return}const b=await U.blob();if(b.size<4096||b.size===3071){r.remove();return}let bmp=null;try{bmp=await createImageBitmap(b)}catch{}if(bmp&&bmp.width===1024&&bmp.height===1024&&b.size<8192){r.remove();return}const data=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(b)});r.src=data;r.setAttribute("data-print-inlined","1")}catch{r.remove()}}));const logos=Array.from(document.querySelectorAll("img.tiny-logo,img.thing-logo"));await Promise.all(logos.map(async r=>{const x=r.getAttribute("src")||"";if(/^data:image\\/svg\\+xml/i.test(x)&&x.includes("%3Csvg")){r.setAttribute("data-logo-inlined","1");return}try{const z=new URL(x,document.baseURI).href;if(!/\\/ts-thing-logos\\//i.test(z)&&!/\\/ts-thing-logos\\//i.test(x))return;const U=await fetch(z,{cache:"reload"});if(!U.ok)return;const txt=await U.text();if(!txt.includes("<svg"))return;r.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(txt);r.setAttribute("data-logo-inlined","1")}catch{}}));document.querySelectorAll(".print-brand,.pdf-final-logo,.pdf-page-counter,.page-count,.style2-cover").forEach(r=>r.remove());document.querySelectorAll("[data-end-continuous] .map-box,[data-post-itinerary] .map-box,[data-endlist-maps] .map-box,[data-end-continuous] .static-print-map").forEach(r=>r.remove());document.querySelectorAll("[data-last-logo-page]").forEach(r=>r.remove());const logoOn=!!document.querySelector(\'[data-config-logo="1"]\');if(logoOn&&!document.querySelector("[data-last-page-logo]")){const pages=Array.from(document.querySelectorAll(".page"));const lastContent=[...pages].reverse().find(r=>!r.matches(".daily-map-page,[data-day-map-page],[data-last-logo-page]")&&(r.querySelector(".thing,.style2-thing,.daily-thing,.logo-list li,[data-list-row],.story-card")||r.getAttribute("data-post-itinerary")==="1"))||pages[pages.length-1];if(lastContent){lastContent.setAttribute("data-last-content-page","1");const z=document.createElement("div");z.className="ts-last-page-logo";z.setAttribute("data-last-page-logo","1");z.setAttribute("data-brand-lockup","timesyncher-hourglass-vacation");z.setAttribute("data-hourglass-between","1");z.innerHTML=\'<span>TimeSyncher</span><img class="ts-logo" src="/icons/timesyncher-icon-black-transparent.png" alt="" /><span>Vacation</span>\';lastContent.appendChild(z)}}if(document.body)document.body.setAttribute("data-print-media-ready","1")};document.open(),document.write(`<!doctype html><html><head><base href="${(typeof location<"u"&&location.origin)||"https://vacation-staging.timesyncher.com"}/" /><title>${seTitle.replace(/[&<>\\"]/g,"")}</title>${i}</head><body data-ae-print="1" data-print-ready="style2">${t}<script>(${c.toString()})();<\\/script></body></html>`),document.close()};seGo();I.useEffect(()=>{seGo()},[e,t,i]);return n.jsx("div",{style:{padding:20,fontFamily:"system-ui, sans-serif"},children:"Preparing PDF…"})}';

const DS_NEEDLE = 'Ds=G=>{var Re;return Mi(G)?!1:((Re=le[Qt(G)])==null?void 0:Re.timeline)??hl(G)}';
const DS_PATCH = 'Ds=G=>{var Re;if(/flight option/i.test(String(G.name||G.title||"")))return!0;return Mi(G)?!1:((Re=le[Qt(G)])==null?void 0:Re.timeline)??hl(G)}';

const OP_GRID_NEEDLE = '<div class="daily-grid">${js}<main class="daily-details">';
const OP_GRID_PATCH = '<div class="daily-grid" data-two-col="1" style="display:table;width:100%;table-layout:fixed">${js}<main class="daily-details" data-two-col-details="1" style="display:table-cell;width:62%;vertical-align:top">';

const OP_LEFT_NEEDLE = 'js=`<aside class="daily-left">';
const OP_LEFT_PATCH = 'js=`<aside class="daily-left" data-two-col-itinerary="1" style="display:table-cell;width:38%;vertical-align:top;padding-right:14px">';

const DAILY_CARD_NEEDLE = 'return`<article class="thing daily-thing"><div class="thing-head">';
const DAILY_CARD_PATCH = 'return`<article class="thing daily-thing" data-two-col-card="1" data-happy-hour="${ha(G).happyHour?"1":"0"}"><div class="thing-head">';

const AREA_CHIP_NYC = 'Ya=["Upper West Side / Lincoln Center","Upper West Side / Morningside","Midtown / Central Park South","Times Square / Hell’s Kitchen","Chelsea / Greenwich Village","Greenwich Village / West Village","Downtown / Harbor","Hudson River / Harbor","Airport / Transit","Citywide / Flexible"]';
const NYC_AREA_LIST = AREA_CHIP_NYC.slice('Ya='.length);
const AREA_CHIPS_FROM_SOURCE = '(function(){const key=G=>G?`${G.name?"place":"reservation"}:${G.id||G.place_id||G.title||G.name}`:"";const nb=G=>{if(!G)return"";const ov=le[key(G)]||{};const src=G.source&&typeof G.source==="object"?G.source:(ov.source&&typeof ov.source==="object"?ov.source:{});return String(src.neighborhood||G.neighborhood||ov.neighborhood||"").trim()};const seen=new Set();const chips=[];for(const G of [...(Gt||[]),...(Ut||[])]){const n=nb(G);if(n&&!seen.has(n)){seen.add(n);chips.push(n)}}return chips})()';
const AREA_FALLBACK_NEEDLE = 'Sn=(G,Re)=>Ke.includes(String(G||""))?String(G):aa(Re)||"Citywide / Flexible"';
const AREA_FALLBACK_PATCH = 'Sn=(G,Re)=>{const key=Re?`${Re.name?"place":"reservation"}:${Re.id||Re.place_id||Re.title||Re.name}`:"";const ov=le[key]||{};const src=Re&&Re.source&&typeof Re.source==="object"?Re.source:(ov.source&&typeof ov.source==="object"?ov.source:{});const n=String((src&&src.neighborhood)||(Re&&Re.neighborhood)||ov.neighborhood||"").trim();if(n)return n;const a=String(G||"").trim();if(a&&Ke.includes(a))return a;const named=typeof aa==="function"?aa(Re):"";return named||"Citywide / Flexible"}';
const COORD_NAME_MAP_NEEDLE = 'const Zn=is(G);return Zn||null';
const COORD_SOURCE_PATCH = 'const tsNamedCoord=is(G);return tsNamedCoord||null';
const AREA_NAME_MATCHER = /a\u0000NEVER_NULL_AREA_MATCHER\u0000/;
const AREA_NAME_MATCHER_PATCH = ',aa=()=>"",ha=G=>';

const HA_NEEDLE = 'ha=G=>le[Qt(G)]||{},Sn=';
const HA_PATCH = `tsPf=${productFieldsLiteral()}.map(row=>({...row,match:new RegExp(row.match,"i")})),tsFillOv=(base,thing)=>{const names=[thing&&(thing.name||thing.title),base&&base.title].map(v=>String(v||"")).filter(Boolean);const spec=tsPf.find(row=>names.some(n=>row.match.test(n)));if(!spec)return base||{};const next={...base||{}};const blank=v=>!String(v||"").trim();if(blank(next.summary)&&spec.summary)next.summary=spec.summary;if(spec.happyHour===true||next.happyHour==null&&spec.happyHour!=null)next.happyHour=spec.happyHour;if(blank(next.happyHourDetails)&&spec.happyHourDetails)next.happyHourDetails=spec.happyHourDetails;if(blank(next.longDetails)&&spec.longDetails)next.longDetails=spec.longDetails;return next},ha=G=>tsFillOv(le[Qt(G)]||{},G),Sn=`;
const HH_CHECK_NEEDLE = 'checked:!!ha(Dt).happyHour,onChange:G=>Xa(Dt,"happyHour",G.target.checked)})," Happy hour"';
const HH_CHECK_PATCH = 'checked:!!(ha(Dt).happyHour||tsPf.some(row=>row.happyHour===true&&row.match.test(String(Dt.name||Dt.title||"")))),onChange:G=>Xa(Dt,"happyHour",G.target.checked)})," Happy hour"';
const HH_DETAILS_NEEDLE = 'value:ha(Dt).happyHourDetails??"",onChange:G=>Xa(Dt,"happyHourDetails",G.target.value)';
const HH_DETAILS_PATCH = 'value:(ha(Dt).happyHourDetails||(tsPf.find(row=>row.match.test(String(Dt.name||Dt.title||"")))||{}).happyHourDetails||""),onChange:G=>Xa(Dt,"happyHourDetails",G.target.value)';
const CO_NEEDLE = 'Co=G=>ha(G).longDetails??Fl(G)';
const CO_PATCH = 'Co=G=>ha(G).longDetails||(tsPf.find(row=>row.match.test(String(G.name||G.title||"")))||{}).longDetails||Fl(G)';

const MN_CATEGORY_NEEDLE = 'Mn=G=>{const Re=String(G||"").toLowerCase();return Re.includes("flight")?"flight":Re.includes("car")||Re.includes("rental")?"car":Re.includes("hotel")?"hotel":';
const MN_CATEGORY_PATCH = 'Mn=G=>{const Re=String(G||"").toLowerCase();return Re.includes("flight")?"flight":Re.includes("restaurant")?"restaurant":Re.includes("hotel")||Re.includes("lodging")||Re.includes("accommodation")||Re.includes("resort")?"hotel":Re.includes("car")||Re.includes("rental")?"car":';

const LIST_LOGO_NEEDLE = '_l=G=>{if(qr(G))return pDe;const Re=ha(G);return Re.logoUrl||Re.iconUrl||G.logoUrl||oi(cc(G))}';

const IT_CATEGORY_NEEDLE = 'It=G=>Mn(ha(G).category??Fn(G))';
const IT_CATEGORY_PATCH = 'It=G=>{const named=Fn(G);if(named==="store")return "store";if(/\\bflight\\b/i.test(String(G.name||G.title||"")))return "flight";if(named==="music"||named==="tour"||named==="sightseeing"||named==="tickets"||named==="bar"||named==="theatre"||named==="workout"||named==="artist")return named;return Mn(ha(G).category??(typeof G.category==="string"?G.category:G.category&&G.category.name)??G.category_name??named)}';

const MO_BUDGET_NEEDLE = 'Mo=Array.from(new Map(Qa.flatMap(di=>Ci(di)).filter(di=>(di==null?void 0:di.item)&&!["travel","travel-to-thing","transport","hotel-wake","hotel-sleep","hotel-checkout"].includes(di.type)).map(di=>{const Xi=di.item;return[Qt(Xi),{item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))}]})).values())';
const MO_BUDGET_PATCH = 'Mo=Array.from(new Map([].concat(rs,Po,bc,Oc,Fs,Cc).filter(Boolean).map(Xi=>[Qt(Xi),{item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))}])).values())';

const MAP_HEIGHT_NEEDLE = 'height:dn?900:300,marginBottom:12';
const MAP_HEIGHT_PATCH = 'height:dn?420:300,marginBottom:12';

const NOTICES_FETCH_CALLER = 'async fetch(){if(!(t().fetching||t().loaded)){e({fetching:!0});try{const i=await Rt.get("/system-notices/active");e({notices:i.data,loaded:!0,fetching:!1})}catch(i){console.warn("[systemNotices] failed to fetch:",i),e({loaded:!0,fetching:!1})}}},';
const APP_CONFIG_CALLER = 'getAppConfig:()=>Rt.get("/auth/app-config").then(e=>e.data),';
const NOTICES_EMPTY_STUB = 'async fetch(){e({notices:[],loaded:!0})}';
const APP_CONFIG_EMPTY_STUB = 'getAppConfig:()=>Promise.resolve({})';

/** Product Ae() honors Keepsakes Config. zu() is the stub that omitted ON sections. */
export function patchStyleTwoToConfigRenderer(source = '', options = {}) {
  const served = options.served === true;
  const js = String(source || '');
  if (!js.includes(ZU_STYLE2) && !js.includes(AE_STYLE2)) {
    throw new Error('Refusing to serve TREK bundle: Style two still not the zu() site we patch to Ae().');
  }
  let patched = js.includes(ZU_STYLE2) ? js.replace(ZU_STYLE2, AE_STYLE2) : js;
  if (patched.includes(AE_LAYOUT_NEEDLE)) {
    patched = patched.replace(AE_LAYOUT_NEEDLE, AE_LAYOUT_PATCH);
  }
  if (patched.includes(NYC_AREA_LIST)) {
    patched = patched.replace(NYC_AREA_LIST, AREA_CHIPS_FROM_SOURCE);
  }
  if (patched.includes(AREA_FALLBACK_NEEDLE)) {
    patched = patched.replace(AREA_FALLBACK_NEEDLE, AREA_FALLBACK_PATCH);
  }
  if (AREA_NAME_MATCHER.test(patched)) {
    patched = patched.replace(AREA_NAME_MATCHER, AREA_NAME_MATCHER_PATCH);
  }
  if (patched.includes(COORD_NAME_MAP_NEEDLE)) {
    patched = patched.replace(COORD_NAME_MAP_NEEDLE, COORD_SOURCE_PATCH);
  }
  if (patched.includes(HC_QR_NEEDLE)) {
    patched = patched.replace(HC_QR_NEEDLE, HC_QR_PATCH);
  }
  if (patched.includes(SO_NEEDLE)) {
    patched = patched.replace(SO_NEEDLE, SO_PATCH);
  }
  if (patched.includes(BA_NEEDLE)) {
    patched = patched.replace(BA_NEEDLE, BA_PATCH);
  }
  if (patched.includes(FS_NEEDLE)) {
    patched = patched.replace(FS_NEEDLE, FS_PATCH);
  }
  if (patched.includes(KL_NEEDLE)) {
    patched = patched.replace(KL_NEEDLE, KL_PATCH);
  }
  if (patched.includes(HS_NEEDLE)) {
    patched = patched.replace(HS_NEEDLE, HS_PATCH);
  }
  if (patched.includes(PRINT_MEDIA_CSS_NEEDLE)) {
    patched = patched.replace(PRINT_MEDIA_CSS_NEEDLE, PRINT_MEDIA_CSS_PATCH);
  }
  if (patched.includes(LIST_PAGE_NEEDLE)) {
    patched = patched.replace(LIST_PAGE_NEEDLE, LIST_PAGE_PATCH);
  }
  if (patched.includes(WD_MEDIA_NEEDLE)) {
    patched = patched.replace(WD_MEDIA_NEEDLE, WD_MEDIA_PATCH);
  }
  if (patched.includes(W_LIST_PATCH_PRIOR)) patched = patched.replace(W_LIST_PATCH_PRIOR, W_LIST_PATCH);
  else if (patched.includes(W_LIST_NEEDLE)) patched = patched.replace(W_LIST_NEEDLE, W_LIST_PATCH);
  if (patched.includes(OP_TITLE_NEEDLE)) {
    patched = patched.replace(OP_TITLE_NEEDLE, OP_TITLE_PATCH);
  }
  if (patched.includes(SU_TITLE_NEEDLE)) {
    patched = patched.replace(SU_TITLE_NEEDLE, SU_TITLE_PATCH);
  }
  if (patched.includes(DAY_CARD_OVERFLOW_NEEDLE)) {
    patched = patched.replace(DAY_CARD_OVERFLOW_NEEDLE, DAY_CARD_OVERFLOW_PATCH);
  }
  if (patched.includes(NR_POPUP_WRAP_NEEDLE)) {
    patched = patched.replace(NR_POPUP_WRAP_NEEDLE, NR_POPUP_WRAP_PATCH);
  }
  if (patched.includes(NR_POPUP_NEEDLE)) {
    patched = patched.replace(NR_POPUP_NEEDLE, NR_POPUP_PATCH);
  }
  if (patched.includes(DE_AE_NEEDLE)) {
    patched = patched.replace(DE_AE_NEEDLE, DE_AE_PATCH);
  }
  if (patched.includes(FO_NEEDLE)) {
    patched = patched.replace(FO_NEEDLE, FO_PATCH);
  }
  if (patched.includes(ND_NEEDLE)) {
    patched = patched.replace(ND_NEEDLE, ND_PATCH);
  }
  if (patched.includes(LOGO_LIST_CSS_NEEDLE)) {
    patched = patched.replace(LOGO_LIST_CSS_NEEDLE, LOGO_LIST_CSS_PATCH);
  }
  if (patched.includes(STYLE2_OPENING_NEEDLE)) {
    patched = patched.replace(STYLE2_OPENING_NEEDLE, STYLE2_OPENING_PATCH);
  }
  if (patched.includes(DAILY_THING_NEEDLE)) {
    patched = patched.replace(DAILY_THING_NEEDLE, DAILY_THING_PATCH);
  }
  if (patched.includes(FLIGHT_ROW_NEEDLE)) {
    patched = patched.replace(FLIGHT_ROW_NEEDLE, FLIGHT_ROW_PATCH);
  }
  if (patched.includes(FLIGHT_FIELDS_NEEDLE)) {
    patched = patched.replace(FLIGHT_FIELDS_NEEDLE, FLIGHT_FIELDS_PATCH);
  }
  if (patched.includes(CAR_FIELDS_NEEDLE)) {
    patched = patched.replace(CAR_FIELDS_NEEDLE, CAR_FIELDS_PATCH);
  }
  if (patched.includes(PE_EFFECT_NEEDLE)) {
    patched = patched.replace(PE_EFFECT_NEEDLE, PE_EFFECT_PATCH);
  }
  if (served) {
    if (patched.includes(HA_NEEDLE)) {
      patched = patched.replace(HA_NEEDLE, HA_PATCH);
    }
    while (patched.includes(HH_CHECK_NEEDLE)) {
      patched = patched.replace(HH_CHECK_NEEDLE, HH_CHECK_PATCH);
    }
    while (patched.includes(HH_DETAILS_NEEDLE)) {
      patched = patched.replace(HH_DETAILS_NEEDLE, HH_DETAILS_PATCH);
    }
    if (patched.includes(CO_NEEDLE)) {
      patched = patched.replace(CO_NEEDLE, CO_PATCH);
    }
  }
  while (patched.includes(PRINT_HH_NEEDLE)) {
    patched = patched.replace(PRINT_HH_NEEDLE, PRINT_HH_PATCH);
  }
  if (patched.includes(PRINT_HH_ZT_NEEDLE)) {
    patched = patched.replace(PRINT_HH_ZT_NEEDLE, PRINT_HH_ZT_PATCH);
  }
  if (patched.includes(PRINT_MODE_NEEDLE)) {
    patched = patched.replace(PRINT_MODE_NEEDLE, PRINT_MODE_PATCH);
  }
  if (patched.includes(PDF_REPORT_NEEDLE)) {
    patched = patched.replace(PDF_REPORT_NEEDLE, PDF_REPORT_PATCH);
  }
  if (patched.includes(SHARED_ROUTE_NEEDLE)) {
    patched = patched.replace(SHARED_ROUTE_NEEDLE, SHARED_ROUTE_PATCH);
  }
  if (patched.includes(SE_NEEDLE)) {
    patched = patched.replace(SE_NEEDLE, SE_PATCH);
  }
  if (patched.includes(DS_NEEDLE)) {
    patched = patched.replace(DS_NEEDLE, DS_PATCH);
  }
  if (patched.includes(DAILY_CARD_NEEDLE)) {
    patched = patched.replace(DAILY_CARD_NEEDLE, DAILY_CARD_PATCH);
  }
  if (patched.includes(MN_CATEGORY_NEEDLE)) {
    patched = patched.replace(MN_CATEGORY_NEEDLE, MN_CATEGORY_PATCH);
  }
  patched = applySharedLiveTabBundlePatches(patched, { served });
  patched = applyLiveProductPatches(patched, { served });
  if (patched.includes(IT_CATEGORY_NEEDLE)) {
    patched = patched.replace(IT_CATEGORY_NEEDLE, IT_CATEGORY_PATCH);
  }
  if (patched.includes(MO_BUDGET_NEEDLE)) {
    patched = patched.replace(MO_BUDGET_NEEDLE, MO_BUDGET_PATCH);
  }
  if (patched.includes(MAP_HEIGHT_NEEDLE)) {
    patched = patched.replace(MAP_HEIGHT_NEEDLE, MAP_HEIGHT_PATCH);
  }
  if (patched.includes(PAGE_PAD_NEEDLE)) {
    patched = patched.replace(PAGE_PAD_NEEDLE, PAGE_PAD_PATCH);
  }
  if (patched.includes(MC_NEEDLE)) {
    patched = patched.replace(MC_NEEDLE, MC_PATCH);
  }
  if (patched.includes(OP_PAGES_NEEDLE)) {
    patched = patched.replace(OP_PAGES_NEEDLE, OP_PAGES_PATCH);
  }
  if (patched.includes(OP_BRAND_NEEDLE)) {
    patched = patched.replace(OP_BRAND_NEEDLE, OP_BRAND_PATCH);
  }
  if (patched.includes(SU_MEDIA_NEEDLE)) {
    patched = patched.replace(SU_MEDIA_NEEDLE, SU_MEDIA_PATCH);
  }
  if (patched.includes(STYLE2_HEIGHT_NEEDLE)) {
    patched = patched.replace(STYLE2_HEIGHT_NEEDLE, STYLE2_HEIGHT_PATCH);
  }
  if (patched.includes(PRINT_LOCK_NEEDLE)) {
    patched = patched.replace(PRINT_LOCK_NEEDLE, PRINT_LOCK_PATCH);
  }
  if (patched.includes(THING_META_CSS_NEEDLE)) {
    patched = patched.replace(THING_META_CSS_NEEDLE, THING_META_CSS_PATCH);
  }
  if (patched.includes(THING_PAD118_NEEDLE)) {
    patched = patched.replace(THING_PAD118_NEEDLE, THING_PAD118_PATCH);
  }
  if (patched.includes(WD_META_NEEDLE)) {
    patched = patched.replace(WD_META_NEEDLE, WD_META_PATCH);
  }
  if (patched.includes(DOC_TITLE_NEEDLE)) {
    patched = patched.replace(DOC_TITLE_NEEDLE, DOC_TITLE_PATCH);
  }
  if (patched.includes(SE_TITLE_NEEDLE)) {
    patched = patched.replace(SE_TITLE_NEEDLE, SE_TITLE_PATCH);
  }
  if (patched.includes(XA_DAY_NEEDLE)) {
    patched = patched.replace(XA_DAY_NEEDLE, XA_DAY_PATCH);
  }
  if (patched.includes(CR_NEEDLE)) {
    patched = patched.replace(CR_NEEDLE, CR_PATCH);
  }
  if (patched.includes(ZU_FN_NEEDLE)) {
    patched = patched.replace(ZU_FN_NEEDLE, ZU_FN_PATCH);
  }
  if (patched.includes(COUNTER_CSS_NEEDLE)) {
    patched = patched.replace(COUNTER_CSS_NEEDLE, COUNTER_CSS_PATCH);
  }
  if (patched.includes(PRINT_BRAND_CSS_NEEDLE)) {
    patched = patched.replace(PRINT_BRAND_CSS_NEEDLE, PRINT_BRAND_CSS_PATCH);
  }
  if (patched.includes(PDF_FINAL_LOGO_NEEDLE)) {
    patched = patched.replace(PDF_FINAL_LOGO_NEEDLE, PDF_FINAL_LOGO_PATCH);
  }
  if (patched.includes(APAGE_ZERO_NEEDLE)) {
    patched = patched.replace(APAGE_ZERO_NEEDLE, APAGE_ZERO_PATCH);
  }
  if (patched.includes(DAILY_MIN_NEEDLE)) {
    patched = patched.replace(DAILY_MIN_NEEDLE, DAILY_MIN_PATCH);
  }
  if (patched.includes(OS_NEEDLE)) {
    patched = patched.replace(OS_NEEDLE, OS_PATCH);
  }
  if (patched.includes(RP_NEEDLE)) {
    patched = patched.replace(RP_NEEDLE, RP_PATCH);
  }
  if (patched.includes(DOC_TITLE_TOKEN_NEEDLE)) {
    patched = patched.replace(DOC_TITLE_TOKEN_NEEDLE, DOC_TITLE_TOKEN_PATCH);
  }
  if (patched.includes(THING_BREAK_NEEDLE)) {
    patched = patched.replace(THING_BREAK_NEEDLE, THING_BREAK_PATCH);
  }
  if (patched.includes(STYLE2_DETAILS_NEEDLE)) {
    patched = patched.replace(STYLE2_DETAILS_NEEDLE, STYLE2_DETAILS_PATCH);
  }
  const finished = stripTripView(patchThingDetailRatings(patched), { gear: !served });
  return served ? finished : stripMissingPriceLabel(finished);
}

function stripMissingPriceLabel(source) {
  return String(source || '')
    .replace(/(\.match\(\/\\\$\\s\?\\d\[\\d,\]\*\/\)[\s\S]{0,180}?\)\|\|)"[^"]*"/g, '$1""')
    .replace(/(children:ie\(G\)\|\|)"[^"]*"/g, '$1""');
}

function dropServedTrekCallers(source) {
  const next = [NOTICES_FETCH_CALLER, APP_CONFIG_CALLER].reduce((text, caller) => {
    if (!text.includes(caller)) throw new Error('trek caller was not in the trek bundle');
    return text.replace(caller, '');
  }, source);
  if ([NOTICES_EMPTY_STUB, APP_CONFIG_EMPTY_STUB, '/system-notices/active', '/auth/app-config'].some((needle) => next.includes(needle))) throw new Error('trek bundle still references system-notices/active or auth/app-config');
  return next;
}

export function renderServedTrekBundle(raw) {
  const stripped = stripCannedBundle(raw);
  const patched = patchThingLogoChipAlignment(dropServedTrekCallers(patchStyleTwoToConfigRenderer(stripped.source, { served: true })));
  const js = stripHotelBrandNameGuessing(stripServedQaCopy(rewriteAppConfigCallers(patched)));
  assertServedBundleClean(js);
  return js;
}

function endOfCall(text, callStart) {
  const open = text.indexOf('(', callStart);
  if (open < 0) return -1;
  let depth = 0;
  let quote = '';
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function stripTripView(source, options = {}) {
  let js = String(source || '');
  if (options.gear) {
    const gearPatch = '"aria-label":"Config Options","aria-expanded":Qe,onClick:()=>{Mt("config"),Ye(!1),Jt(!1),ht(!0),it(!0),Pt(!0)}';
    const gearNeedle = '"aria-label":"Config Options","aria-expanded":Xe,onClick:()=>{Mt("config"),Ye(G=>!G),ht(!1)}';
    const gearAt = js.indexOf(gearNeedle);
    const menuAt = gearAt >= 0 ? js.indexOf(',Xe&&n.jsxs("div"', gearAt) : -1;
    const menuEnd = menuAt >= 0 ? endOfCall(js, menuAt) : -1;
    if (gearAt >= 0 && menuEnd >= 0) {
      js = js.slice(0, gearAt) + gearPatch + js.slice(gearAt + gearNeedle.length, menuAt) + js.slice(menuEnd);
    } else if (!js.includes(gearPatch)) {
      const headerMenu = 'n.jsxs("div",{"data-print-menu-root":!0';
      const headerAt = js.indexOf(headerMenu);
      if (headerAt >= 0) {
        const gearButton = `n.jsx("button",{${gearPatch},style:{minWidth:30,height:30},children:"Config"}),`;
        js = js.slice(0, headerAt) + gearButton + js.slice(headerAt);
      }
    }
  }
  const start = js.indexOf('n.jsxs("div",{"data-trip-view-root":!0');
  if (start < 0) return js;
  const print = js.indexOf('n.jsxs("div",{"data-print-menu-root":!0', start);
  if (print < 0 || js[print - 1] !== ',') return js;
  return js.slice(0, start) + js.slice(print);
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
  if (!js.includes('data-story-media-only="1"') || !js.includes('${zt.map(fs).join("")}')) {
    throw new Error('Style two stories must use fo()/Ba(); Style one must keep product fs().');
  }
  if (!js.includes('fo(nr).filter(Km).map(Ba)') || !js.includes('neon file bind proof') || !js.includes('originalName')) {
    throw new Error('Style two Ae() junk-media story filter did not apply.');
  }
  if (!js.includes(HC_QR_PATCH)) {
    throw new Error('Style two video QR src patch did not apply.');
  }
  if (js.includes('[/bellagio|conservatory/i,[36.1126,-115.1767]]')) {
    throw new Error('Style two must not insert a hardcoded venue geocode table.');
  }
  if (!js.includes('${Mc(nr)}') || !js.includes('data-style2-centered-day="1"') || !js.includes('data-print-ready="style2"') || !js.includes('data-stories-two-col="1"')) {
    throw new Error('Style two Ae() days must use product Mc() centered itinerary; stories must be two-column.');
  }
  if (!js.includes('flex-direction:column') || !js.includes('.style2-page .daily-left{display:none')) {
    throw new Error('Style two Mc() day pages must force centered column, not Style-one left itinerary.');
  }
  if (!js.includes('s2?Qa.map') || !js.includes('${op(nr,{includeMap:so(nr),brandHtml:""})}')) {
    throw new Error('Ae() must branch: Style two Mc() centered; Style one op() left with Config so() maps.');
  }
  if (js.includes('data-two-col-print="1"') || js.includes('data-two-col-itinerary="1"')) {
    throw new Error('Style two must not inject Style-one daily-left 38% table layout.');
  }
  if (!js.includes(W_LIST_PATCH) || !js.includes('data-list-summary="1"')) {
    throw new Error('Style two list-row summary patch did not apply.');
  }
  if (!js.includes(OP_TITLE_PATCH) || !js.includes(SU_TITLE_PATCH) || !js.includes('data-row-summary="1"') || !js.includes('data-summary-thing-only="1"')) {
    throw new Error('Style two itinerary-row summary must use stored rr() on Thing titles only.');
  }
  if (!js.includes('!/^(travel|travel-to-thing|flight|transport|hotel-wake|hotel-event|hotel-sleep|hotel-checkout)$/i.test(String(_i.type||""))') || !js.includes('!/^(travel|travel-to-thing|flight|transport|hotel-wake|hotel-event|hotel-sleep|hotel-checkout)$/i.test(String(Zn.type||""))')) {
    throw new Error('Itinerary Thing summary must skip travel-to / travel-from / hotel chrome rows.');
  }
  if (!js.includes(DAY_CARD_OVERFLOW_PATCH) || js.includes(DAY_CARD_OVERFLOW_NEEDLE) || !js.includes('"data-ts-pic-popup-tip":"1"') || !js.includes(NR_POPUP_PATCH) || js.includes(NR_POPUP_NEEDLE)) {
    throw new Error('Day timeline photo popup tip must stay unclipped (overflow visible + caret).');
  }
  if (!js.includes('data-story-summary="1"') || !js.includes('data-story-body="1"')) {
    throw new Error('Style two story summary-before-story patch did not apply.');
  }
  if (js.includes('placeholder:"4.6"') || js.includes('placeholder:"4.4"') || js.includes('5-star review quote')) {
    throw new Error('Thing pages must not render rating or review placeholders.');
  }
  if (!js.includes(DAILY_THING_PATCH) || !js.includes('data-daily-thing-media="1"')) {
    throw new Error('Style two daily-thing media patch did not apply.');
  }
  if (!js.includes('data-stories-two-col="1"') || !js.includes('grid-template-columns:1fr 1fr') || !js.includes('data-stories-print-css="1"') || !js.includes('break-inside:avoid')) {
    throw new Error('Style two Saved Stories must stay product two-column recap-grid.');
  }
  if (js.includes('data-print-fill="1"') || js.includes('data-list-min=') || js.includes('"Restaurants":15')) {
    throw new Error('Style two end lists must be every stored thing with logos, not emoji fill extras.');
  }
  if (!js.includes('data-end-two-col="1"') || !js.includes('data-end-list="1"') || !js.includes('grid-template-columns:1fr 1fr')) {
    throw new Error('Style two end-of-book lists must be two-column logo+summary rows.');
  }
  if (!js.includes(DE_AE_PATCH) || js.includes(DE_AE_NEEDLE)) {
    throw new Error('Style two end lists must use de(false) so every stored thing is listed.');
  }
  if (!js.includes(FO_PATCH) || !js.includes('_d(G&&G.bound_media)') || !js.includes('bd.length?bd')) {
    throw new Error('Style two fo() must read bound_media so Saved Stories keep pics/QRs.');
  }
  if (!js.includes(ND_PATCH) || js.includes(ND_NEEDLE) && !js.includes('Oo.item.bound_media')) {
    throw new Error('Style two day media nd() must embed Thing bound_media, not TREK placeholder tiles.');
  }
  if (!js.includes(LOGO_LIST_CSS_PATCH) || js.includes(LOGO_LIST_CSS_NEEDLE)) {
    throw new Error('Style two logo-list CSS must be two-column grid for every category.');
  }
  if (!js.includes(STYLE2_OPENING_PATCH) || js.includes(STYLE2_OPENING_NEEDLE)) {
    throw new Error('Style two product style2-page CSS must center the Mc() itinerary.');
  }
  if (!js.includes('data-summary-src="thing"')) {
    throw new Error('Style two list summaries must be marked Thing-stored (rr/Co), not PDF invent.');
  }
  if (!js.includes(WD_MEDIA_PATCH)) {
    throw new Error('Style two daily-thing media filter did not apply.');
  }
  if (!js.includes(MN_CATEGORY_PATCH) || js.includes(MN_CATEGORY_NEEDLE)) {
    throw new Error('Style two live category Mn() must classify lodging and resort as hotel before car or rental.');
  }
  if (!js.includes('tsPad=(rows)=>rows')) {
    throw new Error('Live tabs must return the trip rows only.');
  }
  const servedSharedHotelsCars = js.includes('vi(kn,"hotels").map((G,Re)=>Oe(G,"hotel",Re===0))')
    && js.includes('vi(bc,"cars").map(G=>Oe(G))')
    && !js.includes('tsSharedLiveTabListMount');
  if (servedSharedHotelsCars) {
    if (!js.includes('Gn=tsPad(Fs.filter') || !js.includes('ki=tsPad(Cc.filter')) {
      throw new Error('Stores and The Rest must list trip rows so their chips match the list.');
    }
    if ((js.includes('GBrain') || js.includes('Coming soon')) && !js.includes('Rental cars will use the same GBrain-assisted compare-and-summarize workflow as flights. Coming soon.')) {
      throw new Error('Served shared bundle must not expose internal names or placeholder copy.');
    }
    if (!js.includes('"data-list-row":"1","data-has-logo":tsRowHasLogo')) {
      throw new Error('Served shared Oe() rows must expose Gate B list row markers.');
    }
    if (!js.includes('data-shared-live-tab":"hotels"') || !js.includes('data-shared-live-tab":"cars"')) {
      throw new Error('Served shared Hotels/Cars tabs must expose data-shared-live-tab panels.');
    }
    if (!js.includes('"data-ts-logo-chip":"1","aria-hidden":"true",style:{width:Re,height:Re')) {
      throw new Error('Served shared dc() logo chips must expose data-ts-logo-chip for Gate B.');
    }
  } else if (!js.includes('Gn=tsPad(Fs.filter') || !js.includes('ki=tsPad(Cc.filter')) {
    throw new Error('Live Hotels/Cars tabs must filter trip catalog rows in the vacation bundle.');
  }
  if (js.includes('__tsLiveFill:1') || js.includes('lat:36.1147') || js.includes('address:"Nevada"') || js.includes('logoUrl:tsLogo(name)')) {
    throw new Error('Live tabs must not pad Las Vegas names or coordinates.');
  }
  if (!js.includes('tsListThings=') || !js.includes('tsListThings(Fs)') || !js.includes('tsListThings(Oc)')) {
    throw new Error('Live list tag chips must harvest only tags on Things in that list.');
  }
  if (js.includes('$n=gt.filter(G=>Fs.some(Re=>vn(Re).includes(G)))') || js.includes('ci=ot.filter(G=>Oc.some(Re=>or(Re).includes(G)))')) {
    throw new Error('Live list tags must not harvest from the unfiltered full catalog.');
  }
  if (js.includes('ci=ot.filter(') || !js.includes('ci=[...new Set(tsListThings(Oc).flatMap(Re=>or(Re).map(zt=>String(zt||"").trim()).filter(Boolean)))]')) {
    throw new Error('Restaurant list chips must be saved tags on listed Things, not canned catalog names.');
  }
  if (js.includes('$n=gt.filter(') || !js.includes('$n=[...new Set(tsListThings(Fs).flatMap(Re=>vn(Re).map(zt=>String(zt||"").trim()).filter(Boolean)))]')) {
    throw new Error('Store list chips must be saved tags on listed Things, not the fixed store vocabulary.');
  }
  if (!js.includes(REST_TYPE_CHIPS_NEEDLE) || js.includes(REST_TYPE_CHIPS_PATCH)) {
    throw new Error('Rest type chips must use TREK Os.map list, not fixture-derived types.');
  }
  if (!js.includes(LIST_LOGO_NEEDLE) || js.includes(LIST_LOGO_PATCH)) {
    throw new Error('List logos must use TREK _l() chain (logoUrl, favicon oi(cc)), not LIST_LOGO_PATCH.');
  }
  if (!js.includes('data-logo-src=') || !js.includes('data:image\\/svg\\+xml')) {
    throw new Error('Print end-list rows must mark data-logo-src and skip data-URI letter tiles.');
  }
  if (!js.includes(IT_CATEGORY_PATCH) || js.includes(IT_CATEGORY_NEEDLE)) {
    throw new Error('Style two live It() category-object patch did not apply.');
  }
  if (!js.includes(QN_RENDER_PATCH) || !js.includes(GN_RENDER_PATCH) || !js.includes(KI_RENDER_PATCH)) {
    throw new Error('Style two live tab render pad did not apply.');
  }
  if (!js.includes(MO_BUDGET_PATCH) || js.includes('(Gt||[]).filter(Xi=>Xi&&Ds(Xi)&&!Mi(Xi))')) {
    throw new Error('Style two live budget must list every tab item, including cars and off-timeline rows.');
  }
  if (!js.includes('data-ts-day-map":"1"') || js.includes(MAP_HEIGHT_NEEDLE)) {
    throw new Error('Style two live day-map height patch did not apply.');
  }
  if (!js.includes(QN_EMPTY_PATCH) || !js.includes(GN_EMPTY_PATCH)) {
    throw new Error('Style two live tab empty-state pad check did not apply.');
  }
  if (js.includes('tsPf=') && !js.includes('tsPf=[]')) {
    throw new Error('Style two must keep sourced thing fields and must not inject a name-matched summary or happy-hour map.');
  }
  if (!js.includes(PE_EFFECT_PATCH) || js.includes(PE_EFFECT_NEEDLE)) {
    throw new Error('Style two live pe() hydrate must apply the saved thingOverrides.');
  }
  if (js.includes(PRINT_HH_NEEDLE) || !js.includes(PRINT_HH_PATCH)) {
    throw new Error('Style two print Happy Hour Details must follow ha() product fill.');
  }
  if (js.includes(PRINT_HH_ZT_NEEDLE) || !js.includes(PRINT_HH_ZT_PATCH)) {
    throw new Error('Style two itinerary Happy Hour Details must follow ha() product fill.');
  }
  if (!js.includes(PRINT_MODE_PATCH) || js.includes(PRINT_MODE_NEEDLE)) {
    throw new Error('Style two journey?style=2 must enter printMode=report.');
  }
  if (!js.includes(PDF_REPORT_PATCH) || js.includes(PDF_REPORT_NEEDLE)) {
    throw new Error('Style two journey?style=2 must set pdfReport=keepsake-style-2.');
  }
  if (!js.includes(SHARED_ROUTE_PATCH) || js.includes(SHARED_ROUTE_NEEDLE) && !js.includes('/shared/:token/journey')) {
    throw new Error('Style two must mount Ae() on /shared/:token/journey.');
  }
  if (js.includes(SE_NEEDLE) || !js.includes('data-ae-print="1"') || !js.includes('seGo=')) {
    throw new Error('Style two _se() must write Ae() HTML immediately so QA CDP can see print bars.');
  }
  if (!js.includes('data-print-media-ready') || !js.includes('b.size===3071') || !js.includes('bmp.width===1024')) {
    throw new Error('_se() must inline bound JPEG bytes and drop TREK 1024² 3071B stub canvases.');
  }
  if (js.includes(LIST_LOGO_PATCH)) {
    throw new Error('Print list logos must not use served LIST_LOGO_PATCH blanking.');
  }
  if (js.includes('ha(nr).story&&fo(nr).filter(Km).some(Oo=>Oo.kind==="photo"')) {
    throw new Error('Style two stories must not drop Summary./Story. when media is missing.');
  }
  if (!js.includes(DS_PATCH) || js.includes('Re=le[Qt(G)])==null?void 0:Re.timeline)??hl(G)')) {
    throw new Error('Style two Ds() timeline ha() patch did not apply.');
  }
  if (js.includes('data-two-col="1"') || js.includes('data-two-col-itinerary="1"') || js.includes('data-two-col-details="1"')) {
    throw new Error('Style two must not force Style-one daily-left two-col table layout.');
  }
  if (js.includes('data-two-col-print="1"') || js.includes('display:table!important')) {
    throw new Error('Style two must not inject left-column print CSS over Mc() centered itinerary.');
  }
  if (!js.includes('<strong>Summary.</strong>') || !js.includes('<strong>Story.</strong>')) {
    throw new Error('Style two labeled summary-before-story patch did not apply.');
  }
  if (!js.includes('data-happy-hour="${ha(G).happyHour?"1":"0"}"')) {
    throw new Error('Style two op() happy-hour card marker did not apply.');
  }
  if (!js.includes('longDetails')) {
    throw new Error('Style two ha() must keep trip longDetails and must not embed a venue catalog.');
  }
  if (!js.includes('data-end-continuous="1"') || !js.includes('padding-top:18mm') || !js.includes('tsMapsOn=Qa.some(so)')) {
    throw new Error('Ae() must print continuous all-things lists, top margin, and Config-gated maps.');
  }
  if (js.includes('xa(Oo,720,280)') || js.includes('data-category-map="1"') || !js.includes('data-endlist-maps="0"')) {
    throw new Error('End-of-book lists must not embed category maps; maps are day-only when Config ON.');
  }
  if (!js.includes('data-day-map-page="1"') || !js.includes('xa((Ci(nr)||[]).map(row=>row.item).filter(Boolean),1100,1500)') || !js.includes('data-config-map')) {
    throw new Error('Day maps must sit alone on a full page via xa(1100,1500) when Config so() is ON.');
  }
  if (!js.includes('Ae(!0)') || !js.includes('Ae=(s2)=>')) {
    throw new Error('Style two must call Ae(true); Style one remains Ae() with s2 falsy.');
  }
  if (!js.includes(PAGE_PAD_PATCH) || js.includes(PAGE_PAD_NEEDLE)) {
    throw new Error('Print CSS must add top margin on day/section pages (not flush 9mm).');
  }
  if (!js.includes('?"keepsake":null)')) {
    throw new Error('Style one journey?style=1 must set pdfReport=keepsake.');
  }
  if (!js.includes(SO_PATCH) || js.includes(SO_NEEDLE)) {
    throw new Error('So() must resolve /ts-thing-media against the print origin, not travel placeholders.');
  }
  if (!js.includes('/^data:|^blob:/') && !js.includes('/^data:|^blob:/i.test(Re)')) {
    throw new Error('So() must pass through data: image bytes instead of wrapping them in new URL().');
  }
  if (!js.includes(BA_PATCH) || js.includes('So(G.thumbnailUrl||G.url)')) {
    throw new Error('Ba() must embed bound Thing url before thumbnail placeholders.');
  }
  if (!js.includes('G.printDataUrl||G.print_data_url||G.dataUrl')) {
    throw new Error('Ba() must embed printDataUrl image bytes for saved-story Thing photos.');
  }
  if (!js.includes(FS_PATCH) || !js.includes('data-saved-story-thing="1"') || !js.includes('data-thing-bound-media="1"') || !js.includes('${Pn.map(Ba).join("")}')) {
    throw new Error('Style one fs() must embed that Thing’s fo()/Ba() bound media in product print code.');
  }
  if (!js.includes(KL_PATCH) || js.includes(KL_NEEDLE)) {
    throw new Error('Kl() must read publicUrl so places[].bound_media rows resolve.');
  }
  if (!js.includes('G.printDataUrl)||(G==null?void 0:G.print_data_url)')) {
    throw new Error('Kl() must prefer printDataUrl bytes over TREK thumbnail stubs.');
  }
  if (js.includes('[data-end-continuous="1"] .report-section{break-inside:avoid')) {
    throw new Error('Continuous category dumps must not keep whole-section break-inside:avoid (orphan Restaurants page).');
  }
  if (!js.includes('data-continuous-cat="1"') || !js.includes('.report-section>h2{break-after:avoid')) {
    throw new Error('Continuous lists must keep h2 with following rows, not header-only pages.');
  }
  if (!js.includes('data-cat-keep="1"') || js.includes('${tsMapsOn?`<div class="map-box" data-category-map="1"')) {
    throw new Error('Continuous lists must keep h2 with rows and must not inject end-list maps.');
  }
  if (!js.includes(HS_PATCH) || js.includes(HS_NEEDLE) && !js.includes('_d(G==null?void 0:G.bound_media)')) {
    throw new Error('Hs() must read bound_media so saved-story Things print Thing photos.');
  }
  if (!js.includes(PRINT_MEDIA_CSS_PATCH) || js.includes('.print-media-card>img{width:92px;height:72px')) {
    throw new Error('Print media cards must show real bound photos, not 92×72 stub tiles.');
  }
  if (!js.includes(LIST_PAGE_PATCH) || !js.includes('data-cat-keep="1"') || !js.includes('data-style1-continuous="1"')) {
    throw new Error('Style one continuous dumps must not header-only-page before Restaurants.');
  }
  if (!js.includes('<base href=') || !js.includes('object-fit:contain')) {
    throw new Error('Print HTML must resolve /ts-thing-media from origin and show full Thing pics (contain, not cover).');
  }
  if (!js.includes('data-summary-itinerary="1"') || !js.includes('ua=Gs.map') || !js.includes('Gs.forEach')) {
    throw new Error('Vacation Summary must list itinerary Things only via de(true)/Gs.');
  }
  if (!js.includes('data-summary-continued="1"') || !js.includes('${wn}${sm}${js}${zl}${Qi}') || js.includes('${wn}${sm}${js}${zl}${Qi}${lg}')) {
    throw new Error('Summary continued pages must exist with top-margin bar data-summary-continued.');
  }
  if (js.includes('data-last-logo-page="1"') || js.includes('const lg=Wi') || !js.includes('[data-day-map-page="1"]{break-before:page')) {
    throw new Error('Day maps must page-break alone; logo must stamp last content page, not a blank trailer.');
  }
  if (!js.includes('data-last-content-page="1"') || !js.includes('data-last-page-logo="1"') || !js.includes('data-hourglass-between="1"')) {
    throw new Error('Logo must be bottom-centered on the last content page that has Things.');
  }
  if (!js.includes('<span>TimeSyncher</span><img class="ts-logo"') || !js.includes('data-brand-lockup="timesyncher-hourglass-vacation"') || js.includes('<span>TimeSyncher Vacation</span>') || js.includes('[data-last-page-logo="1"]{display:flex!important;flex-direction:column')) {
    throw new Error('Last-page brand must be TimeSyncher [hourglass] Vacation in a row, not hourglass stacked above text.');
  }
  if (!js.includes('@top-center') || !js.includes('@bottom-center') || !js.includes('counter(page)') || !js.includes('counter(pages)')) {
    throw new Error('Print chrome must be vacation-name header + Page x of y footer.');
  }
  if (!js.includes('data-print-chrome-header') || !js.includes('data-print-title')) {
    throw new Error('Print header must be vacation name only (no date).');
  }
  if (js.includes('Daily printout page') || js.includes('z.className="pdf-page-counter"')) {
    throw new Error('Must not append floating pdf-page-counter or Daily printout page badges.');
  }
  if (!js.includes('.pdf-page-counter,.page-count') || !js.includes('style2-thing-meta{position:static')) {
    throw new Error('Floating page badges must be hidden; card title must not overlap day/time.');
  }
  if (js.includes('document.title=`TimeSyncher Vacation —') || js.includes('} Summary`:G==="keepsake-style-2"') || !js.includes('seTitle=')) {
    throw new Error('Print/document title must be vacation-name-only — no TimeSyncher Vacation brand prefix.');
  }
  if (!js.includes(PRINT_LOCK_PATCH) || js.includes('.daily-details{grid-template-columns:1fr;gap:8px}') || js.includes('.daily-page{height:257mm;min-height:257mm;overflow:hidden}')) {
    throw new Error('Print lock must not force 257mm hidden daily pages or 1-col daily-details (half-blank cards).');
  }
  if (!js.includes(THING_META_CSS_PATCH) || js.includes('padding:12px 124px 12px 12px') || js.includes('.style2-thing-meta{position:absolute')) {
    throw new Error('style2-thing-meta must be static so titles do not overlap day/time.');
  }
  if (!js.includes(WD_META_PATCH) || !js.includes(DOC_TITLE_PATCH) || !js.includes(SE_TITLE_PATCH)) {
    throw new Error('wd() meta, document.title, and _se title must drop brand prefix and absolute day/time.');
  }
  if (!js.includes('[data-endlist-maps="0"] .map-box') || !js.includes('[data-post-itinerary="1"]{break-before:page')) {
    throw new Error('End-of-book lists must hide leftover maps and start after day-map pages.');
  }
  if (!js.includes('kind!=="video"') || js.includes('.style2-day-media">${ua.map(Ba)')) {
    throw new Error('Day itinerary media must omit video QR cards; QRs stay in Saved Stories.');
  }
  if (!js.includes('data-day-things-2col="1"') || !js.includes('data-day-things-flow="1"') || !js.includes('data-stories-packed="1"') || js.includes('Pn=Rn.slice(0,2)')) {
    throw new Error('Day Things and Saved Stories must pack in a 2-col continuous flow, not Mc slice(0,2)/+=3 pages.');
  }
  if (!js.includes('@page{size:Letter;margin-top:0') || !js.includes('padding:18mm 9mm 12mm 9mm') || !js.includes('box-decoration-break:clone')) {
    throw new Error('Chrome date header must be clipped via @page margin-top:0; content keeps 18mm padding.');
  }
  if (!js.includes('data-last-page-logo="1"') || !js.includes('data-logo-last-only="1"') || !js.includes('.print-brand,.pdf-final-logo') || js.includes('${tsPrintCss}${Wi}<h1>') || js.includes('data-print-ready="style2">${cr}<h1>')) {
    throw new Error('TimeSyncher Vacation logo must be suppressed until last page, then bottom-centered.');
  }
  if (!js.includes(MC_PATCH) && js.includes(MC_NEEDLE)) {
    throw new Error('Mc() still paginates 2+3 day cards; must be one 2-col packed flow.');
  }
  if (!js.includes(OP_PAGES_PATCH) && js.includes(OP_PAGES_NEEDLE)) {
    throw new Error('op() still paginates 3 Things per page; must be one 2-col packed flow.');
  }
  if (js.includes('object-fit:cover') && js.includes('height:180px;object-fit:cover')) {
    throw new Error('Print pics must not use cover/180px crop.');
  }
  if (!js.includes(CR_PATCH) || js.includes('Wi=Pr.logo?cr:') || js.includes('class="print-brand"><span>TimeSyncher</span>')) {
    throw new Error('Style two must neutralize TREK cr print-brand HTML; Wi stays a logo flag only.');
  }
  if (!js.includes(ZU_FN_PATCH) || js.includes('style2-cover">${Wi}') || (js.includes(ZU_FN_NEEDLE))) {
    throw new Error('zu() must delegate to Ae(true); Style two must not emit the TREK cover stub.');
  }
  if (!js.includes(COUNTER_CSS_PATCH) || js.includes('.pdf-page-counter{position:absolute;right:9mm')) {
    throw new Error('TREK pdf-page-counter must be hidden (footer-only centered Page x of y).');
  }
  if (!js.includes(PRINT_BRAND_CSS_PATCH) || js.includes('.print-brand{display:inline-flex')) {
    throw new Error('TREK .print-brand hourglass lockup must be display:none on Style two pages.');
  }
  if (!js.includes(PDF_FINAL_LOGO_PATCH) || js.includes('.pdf-final-logo{position:absolute;left:50%')) {
    throw new Error('Early pdf-final-logo must stay hidden; last-content logo uses data-last-page-logo.');
  }
  if (!js.includes(APAGE_ZERO_PATCH) || js.includes('@page{size:Letter;margin:0}')) {
    throw new Error('TREK @page margin:0 must become vacation-name header + bottom-centered Page x of y.');
  }
  if (!js.includes(DAILY_MIN_PATCH) || js.includes('.daily-page{break-after:page;page-break-after:always;min-height:100vh}')) {
    throw new Error('Style two daily pages must not force min-height 100vh half-blank cards.');
  }
  if (!js.includes('_d(G&&G.item&&G.item.bound_media)') || !js.includes(OS_PATCH) || !js.includes('printDataUrl:G&&(G.printDataUrl')) {
    throw new Error('Style two fo()/os()/rp() must prefer Thing printDataUrl JPEGs over TREK thumbs.');
  }
  if (!js.includes('[data-style2-map] .map-box{height:auto') || !js.includes('.daily-grid .map-box{height:205px}')) {
    throw new Error('Style two day maps must fill the page; Style one daily-grid maps stay 205px.');
  }
  if (!js.includes('[data-print-ready=style2] .style2-details') || !js.includes(STYLE2_DETAILS_PATCH)) {
    throw new Error('Style two Mc() details must pack 2-col continuous cards.');
  }
  if (!js.includes(THING_BREAK_PATCH) || js.includes('.style2-details{display:grid;grid-template-columns:1fr;gap:10px}') || js.includes('column-count:2') || js.includes('overflow-wrap:anywhere')) {
    throw new Error('Style two Mc() must 2-col grid (not CSS columns / overflow-wrap:anywhere letter-stack).');
  }
  if (!js.includes('<div class="style2-thing-meta">${an(Mo)}</div><div class="thing-head">') || js.includes('<div class="thing-head"><div class="style2-thing-meta">')) {
    throw new Error('wd() meta must sit above thing-head, not in the 34px logo grid track (letter-stacked titles).');
  }
  if (js.includes('[data-style2-centered-day]{display:block!important;break-after:page') || js.includes('style="break-inside:avoid;page-break-inside:avoid;width:auto;max-width:100%"')) {
    throw new Error('Style two day/story cards must not force page-break wrappers or inline break-inside:avoid (half-blank pages).');
  }
  if (js.includes('.style2-page{display:flex;flex-direction:column;align-items:center') || !js.includes('.style2-page{display:block!important')) {
    throw new Error('Style two .style2-page must be block (not flex) so 2-col cards paginate continuously.');
  }
  if (!js.includes('[data-end-continuous] .map-box') || !js.includes('.style2-cover')) {
    throw new Error('_se() must strip end-list maps and leftover zu() style2-cover.');
  }
  if (js.includes(NYC_AREA_LIST)) {
    throw new Error('Area chips must come from each Thing source neighborhood, not a fixed city list.');
  }
  if (js.includes(AREA_FALLBACK_NEEDLE)) {
    throw new Error('Area assignment must read the Thing source neighborhood.');
  }
  if (js.includes('[/bellagio|conservatory/i,') || js.includes('[/las vegas strip|las vegas/i,')) {
    throw new Error('Map pins must use Thing source coordinates, not a venue-name coordinate list.');
  }
  if (js.includes('Bi={JFK:') || js.includes('Si=[[/park central/i') || js.includes('ii=[[/61\\s+w')) {
    throw new Error('Served bundle must not ship hardcoded airport or venue geocode tables.');
  }
  if (js.includes('Plan 75–90 min airport transfer') || js.includes('First stop / TBD')) {
    throw new Error('Served bundle must not ship canned travel-gap or TBD labels.');
  }
  if (/children:ie\(G\)\|\|"[^"]/.test(js)) {
    throw new Error('A missing rental price must render blank.');
  }
  if (js.includes('||"Airline"') && (js.includes(FLIGHT_ROW_NEEDLE) || !js.includes(FLIGHT_ROW_PATCH))) {
    throw new Error('Flight list rows must show the full thing name.');
  }
  if (js.includes('children:["Takeoff"') && !js.includes(FLIGHT_FIELDS_PATCH)) {
    throw new Error('Open flight detail must render Takeoff, Connections, and Layover for a flight thing.');
  }
  if (js.includes('children:["Rental company"') && !js.includes(CAR_FIELDS_PATCH)) {
    throw new Error('Open car detail must render Rental company and Car type for a car thing.');
  }
  return true;
}

export default async function handler(req, res) {
  let source;
  try {
    source = await readFile(SERVED_BUNDLE, 'utf8');
    assertPatchedStyleTwo(source);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(error.message || 'Served TREK bundle is missing.');
    return;
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  res.end(source);
}
