import { LIVE_TAB_FILL, LIVE_TAB_MINIMUMS } from './keepsake-list-minimums.mjs';
import { PRODUCT_THING_FIELDS } from './keepsake-product-overrides.mjs';

const TRAVEL_BUNDLE = 'https://travel.timesyncher.com/assets/index-BKun7ofk.js';
const ZU_STYLE2 = 'G==="keepsake-style-2"?zu()';
const AE_STYLE2 = 'G==="keepsake-style-2"?Ae(!0)';

// Saved-story flag lives on the Thing. Style one fs() + Style two Ae(true) always embed
// that Thing's bound_media / /ts-thing-media image BYTES (printDataUrl) in THIS print code.
// Drop TREK 1024² @ 3071B placeholder canvases and 960×640 color-card stubs.
// SoTs: saved-story-media-in-print-code-20260916, saved-story-flag-on-thing-20260916.

export const STYLE2_USES_ZU = ZU_STYLE2;
export const STYLE2_USES_AE = AE_STYLE2;

const AE_LAYOUT_NEEDLE = 'const zt=Sr(Ta.filter(nr=>!bn(nr)&&!Mi(nr)&&ha(nr).story)),ua=G.map(([nr,Oo])=>`<div class="summary-stat"><strong>${Oo.length}</strong>${an(nr)}</div>`).join(""),Rn=(nr,Oo,_i=!1)=>`<section class="report-section"><h2>${an(nr)}${_i?" (continued)":""}</h2><ul class="logo-list">${Oo.map(w).join("")}</ul></section>`,Pn=[];let Zn=[],sr=0;const Xr=35,zr=42,Mo=()=>{Pn.push(Zn.join("")),Zn=[],sr=0};G.forEach(([nr,Oo])=>{let _i=[...Oo],Eo=!1;for(;_i.length;){const di=Pn.length===0?Xr:zr,Xi=3;sr+Xi+1>di&&Zn.length&&Mo();const go=Math.max(1,di-sr-Xi),fr=_i.slice(0,go);Zn.push(Rn(nr,fr,Eo)),sr+=Xi+fr.length,_i=_i.slice(fr.length),Eo=!0,_i.length&&Mo()}}),(Zn.length||!Pn.length)&&Mo();const[Is,...Hl]=Pn,pc=Pr.summary?`<p class="muted">Trip summary</p><div class="keepsake-summary">${E().split(/\\n\\s*\\n/).map(nr=>`<p>${an(nr)}</p>`).join("")}</div>`:"",gr=Pr.eventSummary?`<p class="keepsake-summary">You experienced ${Re.size} ${Re.size===1?"event":"events"} this vacation.</p>`:"",js=Pr.stories&&zt.length?`<section class="page keepsake-report keepsake-list-page">${Wi}<h2>Saved stories</h2><div class="recap-grid">${zt.map(fs).join("")}</div></section>`:"",zl=Qa.map(nr=>`<div class="keepsake-day">${op(nr,{includeMap:so(nr),brandHtml:Wi})}</div>`).join(""),wn=`<section class="page keepsake-report">${Wi}<h1>${an(la.title||"Vacation")}</h1>${pc}${gr}<div class="summary-grid">${ua}</div>${Is}</section>`,Qi=Hl.map(nr=>`<section class="page keepsake-report keepsake-list-page">${Wi}${nr}</section>`).join("");return`${wn}${Qi}${js}${zl}`}';

const AE_LAYOUT_PATCH = "const Km=Oo=>!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(\" \")),zt=Sr(Ta.filter(nr=>!bn(nr)&&!Mi(nr)&&ha(nr).story)),ua=Gs.map(([nr,Oo])=>`<div class=\"summary-stat\" data-summary-itinerary=\"1\"><strong>${Oo.length}</strong>${an(nr)}</div>`).join(\"\"),Rn=(nr,Oo,_i=!1)=>`<section class=\"report-section\" data-directory-bucket=\"${an(nr)}\" data-summary-itinerary=\"1\"><h2>${an(nr)}${_i?\" (continued)\":\"\"}</h2><ul class=\"logo-list\">${Oo.map(w).join(\"\")}</ul></section>`,Pn=[];let Zn=[],sr=0;const Xr=22,zr=32,Mo=()=>{Pn.push(Zn.join(\"\")),Zn=[],sr=0};Gs.forEach(([nr,Oo])=>{let _i=[...Oo],Eo=!1;for(;_i.length;){const di=Pn.length===0?Xr:zr,Xi=3;sr+Xi+1>di&&Zn.length&&Mo();const go=Math.max(1,di-sr-Xi),fr=_i.slice(0,go);Zn.push(Rn(nr,fr,Eo)),sr+=Xi+fr.length,_i=_i.slice(fr.length),Eo=!0,_i.length&&Mo()}}),(Zn.length||!Pn.length)&&Mo();const[Is,...Hl]=Pn,pc=Pr.summary?`<p class=\"muted\">Trip summary</p><div class=\"keepsake-summary\">${E().split(/\\n\\s*\\n/).map(nr=>`<p>${an(nr)}</p>`).join(\"\")}</div>`:\"\",gr=Pr.eventSummary?`<p class=\"keepsake-summary\">You experienced ${Re.size} ${Re.size===1?\"event\":\"events\"} this vacation.</p>`:\"\",tsMapsOn=Qa.some(so),tsPrintCss=`<style data-keepsake-print-css=\"1\">@page{margin-top:18mm;margin-bottom:14mm}.page,.daily-page,.keepsake-report,.style2-page{padding:18mm 9mm 12mm 9mm!important;box-sizing:border-box;-webkit-box-decoration-break:clone;box-decoration-break:clone}[data-summary-continued=\"1\"]{padding-top:18mm!important;box-sizing:border-box}.style2-page{height:auto!important;min-height:0!important;overflow:visible!important;display:flex!important;flex-direction:column!important;align-items:center!important;text-align:center!important}.style2-page h1{width:100%}.print-brand,.print-brand .ts-logo,img.pdf-final-logo{display:none!important}[data-last-page-logo=\"1\"]{display:flex!important;flex-direction:column;align-items:center;justify-content:flex-end;text-align:center;width:100%;margin-top:18mm;padding:8mm 0 4mm}[data-last-page-logo=\"1\"] .ts-logo{display:block!important;width:56px;height:56px;margin:0 auto 8px;object-fit:contain}main.style2-details[data-day-things-flow=\"1\"],main.daily-details[data-day-things-flow=\"1\"],[data-day-things-flow=\"1\"]{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 12px!important;align-items:start!important;width:100%!important}[data-day-things-flow=\"1\"] .thing,[data-day-things-flow=\"1\"] .style2-thing,[data-day-things-flow=\"1\"] .daily-thing{width:auto!important;max-width:100%!important;min-width:0!important;padding-right:0!important;margin:0 0 8px!important;break-inside:avoid;page-break-inside:avoid}[data-stories-two-col=\"1\"] .recap-grid,[data-stories-packed=\"1\"] .recap-grid,.recap-grid[data-stories-grid=\"2\"]{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 12px!important;align-items:start!important}[data-stories-two-col=\"1\"] .story-card,[data-stories-two-col=\"1\"] [data-story-card],[data-stories-packed=\"1\"] .story-card{width:auto!important;max-width:100%!important;min-width:0!important;margin:0!important;break-inside:avoid;page-break-inside:avoid}.style2-page .print-media-card.video,.daily-page .print-media-card.video,.style2-day-media .print-media-card.video,[data-daily-thing-media] .print-media-card.video{display:none!important}.print-media-card{display:block;margin:0 0 8px;vertical-align:top;max-width:100%;width:auto}.print-media-card>img{width:100%!important;max-width:100%!important;height:auto!important;max-height:110px!important;object-fit:contain!important;border-radius:10px;background:#f8fafc}.print-media-card.video>img.print-media-qr{width:72px;height:72px;object-fit:contain;background:#fff}.daily-map-page,[data-day-map-page=\"1\"]{padding:12mm 6mm 8mm 6mm!important;min-height:100vh}.daily-map-page .map-box,[data-day-map-page=\"1\"] .map-box{height:calc(100vh - 28mm)!important;min-height:230mm;width:100%!important;margin:0!important}.daily-map-page .static-print-map,.daily-map-page .leaflet-print-map,[data-day-map-page=\"1\"] .static-print-map,[data-day-map-page=\"1\"] .leaflet-print-map{width:100%!important;height:100%!important}[data-end-continuous=\"1\"]{break-before:auto!important;page-break-before:auto!important;break-after:auto!important;page-break-after:auto!important}.keepsake-day:last-child .daily-page,.keepsake-day:last-of-type .daily-page{min-height:0!important;break-after:auto!important;page-break-after:auto!important}[data-end-continuous=\"1\"] .report-section{break-inside:auto;page-break-inside:auto;break-before:auto;page-break-before:auto}[data-end-continuous=\"1\"] .report-section>h2{break-after:avoid;page-break-after:avoid}[data-end-continuous=\"1\"] .logo-list>li{break-inside:avoid;page-break-inside:avoid}.style2-day-opening{display:block!important;text-align:center!important;margin:0 auto 16px!important;max-width:560px!important;width:100%!important;float:none!important}.style2-timeline{display:inline-grid!important;margin:0 auto!important;text-align:left}.style2-details{width:100%!important;text-align:left!important;float:none!important;clear:both!important}.style2-page .daily-grid,.style2-page .daily-left{display:none!important}[data-end-two-col=\"1\"] .logo-list,.logo-list[data-end-list=\"1\"],[data-trip-directory=\"1\"] .logo-list{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 18px!important;columns:unset!important}</style>`,js=Pr.stories&&zt.length?(s2?`<section class=\"page keepsake-report keepsake-list-page\" data-stories-up-front=\"1\" data-stories-two-col=\"1\" data-stories-packed=\"1\" data-day-things-2col=\"1\"><h2>Saved stories</h2><style data-stories-print-css=\"1\">[data-stories-packed=\"1\"] .recap-grid,[data-stories-two-col=\"1\"] .recap-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px 12px!important;align-items:start!important}[data-stories-packed=\"1\"] .story-card,[data-story-card]{width:auto!important;max-width:100%!important;min-width:0!important;break-inside:avoid;page-break-inside:avoid}[data-stories-packed=\"1\"] .print-media-card>img{width:100%!important;height:auto!important;max-height:110px!important;object-fit:contain!important}</style><div class=\"recap-grid\" data-stories-grid=\"2\" data-day-things-flow=\"1\">${zt.map(nr=>`<article class=\"story-card\" data-story-card=\"1\" data-story-media-only=\"1\" data-saved-story-thing=\"1\" style=\"break-inside:avoid;page-break-inside:avoid;width:auto;max-width:100%\"><h3>${an(Bs(mr(nr)))}</h3><div data-thing-bound-media=\"1\">${fo(nr).filter(Km).map(Ba).join(\"\")}</div><div class=\"body\">${rr(nr)?`<p data-story-summary=\"1\" style=\"font-size:12px;color:#334155;margin:8px 0 6px\"><strong>Summary.</strong> ${an(Bs(rr(nr)))}</p>`:\"\"}${ha(nr).story?`<p data-story-body=\"1\" style=\"font-size:12px;color:#111827\"><strong>Story.</strong> ${an(ha(nr).story)}</p>`:\"\"}</div></article>`).join(\"\")}</div></section>`:`<section class=\"page keepsake-report keepsake-list-page\" data-stories-packed=\"1\"><h2>Saved stories</h2><div class=\"recap-grid\" data-stories-grid=\"2\">${zt.map(fs).join(\"\")}</div></section>`):\"\",zl=s2?Qa.map(nr=>`<div data-style2-centered-day=\"1\">${Mc(nr)}</div>${so(nr)?`<section class=\"page daily-page daily-map-page\" data-style2-map=\"1\" data-day-map-page=\"1\" data-config-map=\"1\"><h2>${an(nr.title||(\"Day \"+nr.day_number))} map</h2><div class=\"map-box\" data-day-map-fill=\"1\">${xa((Ci(nr)||[]).map(row=>row.item).filter(Boolean),1100,1500)}</div></section>`:\"\"}`).join(\"\"):Qa.map(nr=>`<div class=\"keepsake-day\">${op(nr,{includeMap:so(nr),brandHtml:\"\"})}</div>`).join(\"\"),wn=`<section class=\"page keepsake-report\" data-page=\"1\" data-trip-directory=\"1\" data-summary-itinerary=\"1\">${tsPrintCss}<div hidden data-config-logo=\"${Wi?\"1\":\"0\"}\" data-logo-last-only=\"1\"></div><h1>${an(la.title||\"Vacation\")}</h1>${pc}${gr}<div class=\"summary-grid\" data-summary-itinerary=\"1\">${ua}</div>${Is}</section>`,sm=Hl.map(nr=>`<section class=\"page keepsake-report keepsake-list-page\" data-summary-continued=\"1\" data-summary-itinerary=\"1\">${nr}</section>`).join(\"\"),Qi=`<section class=\"page keepsake-report\" data-post-itinerary=\"1\" data-end-two-col=\"1\" data-end-continuous=\"1\" data-style1-continuous=\"1\" data-endlist-maps=\"0\">${G.map(([nr,Oo])=>{const hd=Oo.slice(0,2),tl=Oo.slice(2);return`<section class=\"report-section\" data-directory-bucket=\"${an(nr)}\" data-continuous-cat=\"1\"><div data-cat-keep=\"1\" style=\"break-inside:avoid;page-break-inside:avoid;break-after:avoid;page-break-after:avoid\"><h2>${an(nr)}</h2><ul class=\"logo-list\" data-end-list=\"1\" style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px 18px\">${hd.map(w).join(\"\")}</ul></div>${tl.length?`<ul class=\"logo-list\" data-end-list=\"1\" style=\"display:grid;grid-template-columns:1fr 1fr;gap:8px 18px\">${tl.map(w).join(\"\")}</ul>`:\"\"}</section>`}).join(\"\")}</section>`;return`${wn}${sm}${js}${zl}${Qi}`}";


const HC_QR_NEEDLE = 'Hc=G=>`/api/pdf/qr.svg?data=${encodeURIComponent(So(G))}`';
const HC_QR_PATCH = 'Hc=G=>`/api/pdf/qr.svg?data=${encodeURIComponent(So(G))}&m=1`';

const SO_NEEDLE = 'So=G=>{const Re=String(G||"").trim();if(!Re)return"";try{const zt="https://travel.timesyncher.com",ua=new URL(Re,zt);return["192.168.1.15:3010","100.66.47.62:3010","localhost:3010","127.0.0.1:3010"].includes(ua.host)?`${zt}${ua.pathname}${ua.search}${ua.hash}`:ua.toString()}catch{return Re}}';
const SO_PATCH = 'So=G=>{const Re=String(G||"").trim();if(!Re)return"";if(/^data:|^blob:/i.test(Re))return Re;try{const zt=(typeof location<"u"&&location.origin)||"https://vacation-staging.timesyncher.com",ua=new URL(Re,zt);if(/\\/ts-thing-media\\/|\\/api\\/bind-thing-media\\b/i.test(ua.pathname+ua.search))return`${zt}${ua.pathname}${ua.search}${ua.hash}`;return["192.168.1.15:3010","100.66.47.62:3010","localhost:3010","127.0.0.1:3010"].includes(ua.host)?`${zt}${ua.pathname}${ua.search}${ua.hash}`:ua.toString()}catch{return Re}}';

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
const LIST_PAGE_PATCH = '.keepsake-list-page{break-before:page;page-break-before:always}[data-end-continuous="1"].keepsake-list-page,[data-end-continuous="1"]{break-before:auto!important;page-break-before:auto!important}.keepsake-day:last-child .daily-page,.keepsake-day:last-of-type .daily-page{min-height:0!important;break-after:auto!important;page-break-after:auto!important}';

const WD_MEDIA_NEEDLE = 'zr=fo(zt).length?`<div class="style2-thing-media">${fo(zt).map(Ba).join("")}</div>`:""';
const WD_MEDIA_PATCH = 'zr=fo(zt).filter(Oo=>Oo&&Oo.kind!=="video"&&!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" "))).length?`<div class="style2-thing-media">${fo(zt).filter(Oo=>Oo&&Oo.kind!=="video"&&!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" "))).map(Ba).join("")}</div>`:""';


const W_LIST_NEEDLE = 'w=G=>{const Re=_l(G);return`<li>${Re?`<img class="tiny-logo" src="${an(Re)}" />`:`<span class="thing-emoji" style="width:22px;height:22px;font-size:13px">${an(Pc(G))}</span>`}<span>${an(Bs(mr(G)))}</span></li>`}';
const W_LIST_PATCH = 'w=G=>{const Re=_l(G),zt=rr(G)||Co(G);return`<li data-list-row="1" data-has-logo="${Re?"1":"0"}" data-summary-src="thing" style="align-items:flex-start">${Re?`<img class="tiny-logo" src="${an(Re)}" alt="" />`:`<span class="thing-emoji" style="width:22px;height:22px;font-size:13px">${an(Pc(G))}</span>`}<span><strong>${an(Bs(mr(G)))}</strong>${zt?`<div data-list-summary="1" data-summary-src="thing" style="font-size:12px;font-weight:400;margin-top:3px;line-height:1.4;color:#334155">${an(Bs(zt))}</div>`:""}</span></li>`}';

const OP_TITLE_NEEDLE = 'const di=`<div class="timeline-title">${an(Bs(_i.title))}</div>`';
const OP_TITLE_PATCH = 'const di=`<div class="timeline-title">${an(Bs(_i.title))}${rr(_i.item)?`<div data-row-summary="1" style="font-weight:400;font-size:12px;margin-top:3px;line-height:1.4;color:#334155">${an(Bs(rr(_i.item)))}</div>`:""}</div>`';

const SU_TITLE_NEEDLE = '<div class="timeline-title">${an(Bs(Zn.title))}</div>';
const SU_TITLE_PATCH = '<div class="timeline-title">${an(Bs(Zn.title))}${rr(Zn.item)?`<div data-row-summary="1" data-summary-src="thing" style="font-weight:400;font-size:12px;margin-top:3px;line-height:1.4;color:#334155">${an(Bs(rr(Zn.item)))}</div>`:""}</div>';

const DE_AE_NEEDLE = 'Ae=()=>{const G=de(!0).filter(([,nr])=>nr.length)';
const DE_AE_PATCH = 'Ae=(s2)=>{const G=de(!1).filter(([,nr])=>nr.length),Gs=de(!0).filter(([,nr])=>nr.length)';

const FO_NEEDLE = 'Rn=Ln.filter(Zn=>ua.includes(Number(Zn.place_id??Zn.placeId)));return Fo([...Rn,...Hs(G),...Hs(ha(G))].map((Zn,sr)=>rp(Zn,sr,Re,zt)).filter(Boolean))}';
const FO_PATCH = 'Rn=Ln.filter(Zn=>ua.includes(Number(Zn.place_id??Zn.placeId)));const bd=[..._d(G&&G.bound_media),..._d((ha(G)||{}).bound_media)];const rows=bd.length?bd:[..._d(G&&G.photos),...Rn,...Hs(G),...Hs(ha(G))];return Fo(rows.map((Zn,sr)=>rp(Zn,sr,Re,zt)).filter(Boolean).filter(Oo=>{const src=String(Oo.url||"");if(/^data:image\\//i.test(src))return src.length>12000;const blob=[Oo.filename,Oo.originalName,Oo.caption,src.slice(0,240),String(Oo.thumbnailUrl||"").slice(0,240),Oo.id].join(" ");return!/placeholder|1024.?1024|default[-_]?thumb|bind[- ]?proof|neon file bind proof/i.test(blob)}))}';

const ND_NEEDLE = 'nd=G=>Fo(li(G))';
const ND_PATCH = 'nd=G=>{const zt=`day:${G.id}`,ua=Zl(zt),Rn=(typeof Ci=="function"?Ci(G):[]).flatMap(Oo=>_d(Oo&&Oo.item&&Oo.item.bound_media));return Rn.length?Fo(Rn.map((Oo,sr)=>rp(Oo,sr,zt,ua)).filter(Boolean)):Fo(li(G))}';

const LOGO_LIST_CSS_NEEDLE = '.logo-list{columns:2;column-gap:18px;margin:0 0 16px;padding:0;list-style:none}';
const LOGO_LIST_CSS_PATCH = '.logo-list{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;margin:0 0 16px;padding:0;list-style:none}';

const STYLE2_OPENING_NEEDLE = '.style2-page h1{font-size:20px;margin-bottom:10px}.style2-day-opening{text-align:center;margin:0 auto 16px;max-width:650px}';
const STYLE2_OPENING_PATCH = '.style2-page{display:flex;flex-direction:column;align-items:center;text-align:center}.style2-page h1{font-size:20px;margin-bottom:10px;width:100%}.style2-day-opening{display:block;text-align:center;margin:0 auto 16px;max-width:560px;width:100%;float:none}';

const DAILY_THING_NEEDLE = '${Rn}${Pn?`<div class="reviews">${Pn}</div>`:""}</article>`},ws=';
const DAILY_THING_PATCH = '${Rn}${Pn?`<div class="reviews">${Pn}</div>`:""}${fo(G).filter(Oo=>Oo&&Oo.kind!=="video"&&!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" "))).length?`<div class="style2-thing-media" data-daily-thing-media="1">${fo(G).filter(Oo=>Oo&&Oo.kind!=="video"&&!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" "))).map(Ba).join("")}</div>`:""}</article>`},ws=';


const MC_NEEDLE = 'Pn=Rn.slice(0,2),Zn=[];for(let zr=2;zr<Rn.length;zr+=3)Zn.push(Rn.slice(zr,zr+3));const sr=`<section class="page daily-page style2-page" data-print-ready="style2">${cr}<h1>${an(la.title||"Trip")}</h1>${Su(G,Re,Rn.map(zr=>zr.item))}<main class="style2-details">${Pn.map(zr=>wd(zr,G)).join("")}</main></section>`,Xr=Zn.map((zr,Mo)=>`<section class="page daily-page style2-page" data-print-ready="style2">${cr}<h1>${an(la.title||"Trip")}</h1><div class="style2-continued">Day ${an(G.day_number)} continued${G.date?` · ${an(new Date(G.date+"T00:00:00Z").toLocaleDateString(z,{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}))}`:""}</div><main class="style2-details">${zr.map(Is=>wd(Is,G)).join("")}</main></section>`).join("");return sr+Xr}';
const MC_PATCH = 'sr=`<section class="page daily-page style2-page" data-print-ready="style2" data-day-things-2col="1"><h1>${an(la.title||"Trip")}</h1>${Su(G,Re,Rn.map(zr=>zr.item))}<main class="style2-details" data-day-things-flow="1">${Rn.map(zr=>wd(zr,G)).join("")}</main></section>`;return sr}';

const OP_PAGES_NEEDLE = 'zl=[];for(let _i=0;_i<Zn.length;_i+=3)zl.push(Zn.slice(_i,_i+3));zl.length||zl.push([]);const wn=Re.includeMap!==!1,Qi=zl.length+(wn?1:0),nr=zl.map((_i,Eo)=>`<section class="page daily-page" data-print-ready="daily">${zt}<h1>${an(la.title||"Trip")}</h1><div class="muted page-count">Daily printout page ${Eo+1} of ${Qi}</div><div class="daily-grid">${js}<main class="daily-details">${_i.map($r).join("")}</main></div></section>`).join(""),Oo=`<section class="page daily-page daily-map-page" data-print-ready="daily">${zt}<h1>${an(la.title||"Trip")}</h1><div class="muted page-count">Daily printout page ${Qi} of ${Qi}</div><h2>${an(G.title||`Day ${G.day_number}`)} map</h2><p class="map-caption">Actual itinerary map for Day ${an(G.day_number)}, bounded to the mapped Day-by-Day stops.</p>${pc}<div class="map-box">${Hl}</div></section>`;return nr+(wn?Oo:"")}';
const OP_PAGES_PATCH = 'zl=[],wn=Re.includeMap!==!1,Qi=1+(wn?1:0),nr=`<section class="page daily-page" data-print-ready="daily" data-day-things-2col="1"><h1>${an(la.title||"Trip")}</h1><div class="muted page-count">Daily printout page 1 of ${Qi}</div><div class="daily-grid">${js}<main class="daily-details" data-day-things-flow="1">${Zn.map($r).join("")}</main></div></section>`,Oo=`<section class="page daily-page daily-map-page" data-print-ready="daily" data-day-map-page="1" data-config-map="1"><h1>${an(la.title||"Trip")}</h1><div class="muted page-count">Daily printout page ${Qi} of ${Qi}</div><h2>${an(G.title||`Day ${G.day_number}`)} map</h2><p class="map-caption">Actual itinerary map for Day ${an(G.day_number)}, bounded to the mapped Day-by-Day stops.</p>${pc}<div class="map-box" data-day-map-fill="1">${xa(Is,1100,1500)}</div></section>`;return nr+(wn?Oo:"")}';

const OP_BRAND_NEEDLE = 'zt=Re.brandHtml??cr';
const OP_BRAND_PATCH = 'zt=""';

const SU_MEDIA_NEEDLE = 'Pn=ua.length?`<div class="style2-day-media">${ua.map(Ba).join("")}</div>`:""';
const SU_MEDIA_PATCH = 'Pn=ua.filter(Oo=>Oo&&Oo.kind!=="video").length?`<div class="style2-day-media">${ua.filter(Oo=>Oo&&Oo.kind!=="video").map(Ba).join("")}</div>`:""';

const STYLE2_HEIGHT_NEEDLE = '.style2-page{height:257mm;min-height:257mm;overflow:hidden}';
const STYLE2_HEIGHT_PATCH = '.style2-page{height:auto;min-height:0;overflow:visible}';

const XA_DAY_NEEDLE = 'Hl=xa(Is,720,850)';
const XA_DAY_PATCH = 'Hl=xa(Is,1100,1500)';

function productFieldsLiteral() {
  return JSON.stringify(PRODUCT_THING_FIELDS.map((row) => ({
    match: row.match.source,
    summary: row.summary || '',
    happyHour: Object.prototype.hasOwnProperty.call(row, 'happyHour') ? row.happyHour : null,
    happyHourDetails: row.happyHourDetails || '',
    longDetails: row.longDetails || '',
  })));
}

const HA_NEEDLE = 'ha=G=>le[Qt(G)]||{},Sn=';
const HA_PATCH = `tsPf=${productFieldsLiteral()}.map(row=>({...row,match:new RegExp(row.match,"i")})),tsFillOv=(base,thing)=>{const names=[thing&&(thing.name||thing.title),base&&base.title].map(v=>String(v||"")).filter(Boolean);const spec=tsPf.find(row=>names.some(n=>row.match.test(n)));if(!spec)return base||{};const next={...base||{}};const blank=v=>!String(v||"").trim();if(blank(next.summary)&&spec.summary)next.summary=spec.summary;if(spec.happyHour===true||next.happyHour==null&&spec.happyHour!=null)next.happyHour=spec.happyHour;if(blank(next.happyHourDetails)&&spec.happyHourDetails)next.happyHourDetails=spec.happyHourDetails;if(blank(next.longDetails)&&spec.longDetails)next.longDetails=spec.longDetails;if(next.timeline==null)next.timeline=!0;return next},ha=G=>tsFillOv(le[Qt(G)]||{},G),Sn=`;

const PE_EFFECT_NEEDLE = 'lf.getSharedTrip(r).then(G=>{A(G),G!=null&&G.thingOverrides&&typeof G.thingOverrides=="object"?pe(G.thingOverrides):pe({}),me(!0),ge(!1)})';
// Do not close over tsFillOv here. wse() returns the loading branch while P is
// null, before the later `const tsFillOv=...` runs, so getSharedTrip.then() hit
// TDZ ("Cannot access 'tsFillOv' before initialization") and .catch() set the
// expired lock after A(G) had already applied the trip title. ha()/tsPf fill
// product fields on the post-load render, after those consts exist.
const PE_EFFECT_PATCH = 'lf.getSharedTrip(r).then(G=>{A(G);pe((G!=null&&G.thingOverrides&&typeof G.thingOverrides=="object")?G.thingOverrides:{});me(!0);ge(!1)})';

const HH_CHECK_NEEDLE = 'checked:!!ha(Dt).happyHour,onChange:G=>Xa(Dt,"happyHour",G.target.checked)})," Happy hour"';
const HH_CHECK_PATCH = 'checked:!!(ha(Dt).happyHour||tsPf.some(row=>row.happyHour===true&&row.match.test(String(Dt.name||Dt.title||"")))),onChange:G=>Xa(Dt,"happyHour",G.target.checked)})," Happy hour"';

const HH_DETAILS_NEEDLE = 'value:ha(Dt).happyHourDetails??"",onChange:G=>Xa(Dt,"happyHourDetails",G.target.value)';
const HH_DETAILS_PATCH = 'value:(ha(Dt).happyHourDetails||(tsPf.find(row=>row.match.test(String(Dt.name||Dt.title||"")))||{}).happyHourDetails||""),onChange:G=>Xa(Dt,"happyHourDetails",G.target.value)';

const CO_NEEDLE = 'Co=G=>ha(G).longDetails??Fl(G)';
const CO_PATCH = 'Co=G=>ha(G).longDetails||(tsPf.find(row=>row.match.test(String(G.name||G.title||"")))||{}).longDetails||Fl(G)';

const PRINT_HH_NEEDLE = 'ua=zi(G)?ha(G).happyHourDetails:""';
const PRINT_HH_PATCH = 'ua=(ha(G).happyHour||zi(G))?(ha(G).happyHourDetails||""):""';

const PRINT_HH_ZT_NEEDLE = 'Zn=zi(zt)?ha(zt).happyHourDetails:""';
const PRINT_HH_ZT_PATCH = 'Zn=(ha(zt).happyHour||zi(zt))?(ha(zt).happyHourDetails||""):""';

const PRINT_MODE_NEEDLE = 'h=c.get("printMode")||(i.includes("printMode=daily")?"daily":null)';
const PRINT_MODE_PATCH = 'h=c.get("printMode")||((/\\/journey\\/?$/.test((typeof window<"u"?window.location.pathname:"")||t.pathname||"")&&(c.get("style")==="2"||c.get("style")==="style-2"||c.get("style")==="1"||c.get("style")==="style-1"))?"report":null)||(i.includes("printMode=daily")?"daily":null)';

const PDF_REPORT_NEEDLE = 'g=c.get("pdfReport")||((Bl=i.match(/[?&]pdfReport=([^&]+)/))==null?void 0:Bl[1])||null';
const PDF_REPORT_PATCH = 'g=c.get("pdfReport")||((Bl=i.match(/[?&]pdfReport=([^&]+)/))==null?void 0:Bl[1])||((/\\/journey\\/?$/.test((typeof window<"u"?window.location.pathname:"")||t.pathname||"")&&(c.get("style")==="2"||c.get("style")==="style-2"))?"keepsake-style-2":(/\\/journey\\/?$/.test((typeof window<"u"?window.location.pathname:"")||t.pathname||"")&&(c.get("style")==="1"||c.get("style")==="style-1"))?"keepsake":null)';

const PAGE_PAD_NEEDLE = '.page{padding:9mm}';
const PAGE_PAD_PATCH = '.page,.daily-page,.keepsake-report,.style2-page{padding:18mm 9mm 12mm 9mm!important;box-sizing:border-box;-webkit-box-decoration-break:clone;box-decoration-break:clone}@page{margin-top:18mm;margin-bottom:14mm}';

const SHARED_ROUTE_NEEDLE = 'n.jsx(tc,{path:"/shared/:token",element:n.jsx(wse,{})})';
const SHARED_ROUTE_PATCH = 'n.jsx(tc,{path:"/shared/:token",element:n.jsx(wse,{})}),n.jsx(tc,{path:"/shared/:token/journey",element:n.jsx(wse,{})})';

const SE_NEEDLE = 'function _se({title:e,html:t,styles:i}){return I.useEffect(()=>{const c=()=>{const h=Array.from(document.querySelectorAll(".page")),p=h.length,g=!!document.querySelector(".print-brand");h.forEach((r,x)=>{if(!r.querySelector(".pdf-page-counter")){const z=document.createElement("div");z.className="pdf-page-counter",z.textContent=`Page ${x+1} of ${p}`,r.appendChild(z)}if(x===p-1&&g&&!r.querySelector(".pdf-final-logo")){const z=document.createElement("img");z.className="pdf-final-logo",z.src="/icons/timesyncher-icon-black-transparent.png",z.alt="TimeSyncher",r.appendChild(z)}})};document.open(),document.write(`<!doctype html><html><head><title>${e.replace(/[&<>\\"]/g,"")}</title>${i}</head><body>${t}<script>(${c.toString()})();<\\/script></body></html>`),document.close()},[e,t,i]),n.jsx("div",{style:{padding:20,fontFamily:"system-ui, sans-serif"},children:"Preparing PDF…"})}';

const SE_PATCH = 'function _se({title:e,html:t,styles:i}){const seGo=()=>{if(typeof document>"u"||!t)return;if(document.body&&document.body.getAttribute("data-ae-print")==="1")return;const c=async()=>{const imgs=Array.from(document.querySelectorAll(".print-media-card>img:not(.print-media-qr)"));await Promise.all(imgs.map(async r=>{const x=r.getAttribute("src")||"";if(/^data:image\\/(jpeg|jpg|png|webp);base64,/i.test(x)&&x.length>12000){r.setAttribute("data-print-inlined","1");return}try{const z=new URL(x,document.baseURI).href;if(/^data:/i.test(z)&&z.length<12000){r.remove();return}const U=await fetch(z,{cache:"reload"});if(!U.ok){r.remove();return}const b=await U.blob();if(b.size<4096||b.size===3071){r.remove();return}let bmp=null;try{bmp=await createImageBitmap(b)}catch{}if(bmp&&bmp.width===1024&&bmp.height===1024&&b.size<8192){r.remove();return}const data=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(b)});r.src=data;r.setAttribute("data-print-inlined","1")}catch{r.remove()}}));document.querySelectorAll(".print-brand,.pdf-final-logo").forEach(r=>r.remove());const h=Array.from(document.querySelectorAll(".page")),p=h.length,logoOn=!!document.querySelector(\'[data-config-logo="1"]\');h.forEach((r,x)=>{r.querySelectorAll(".print-brand,.pdf-final-logo,[data-last-page-logo]").forEach(z=>z.remove());if(!r.querySelector(".pdf-page-counter")){const z=document.createElement("div");z.className="pdf-page-counter",z.textContent=`Page ${x+1} of ${p}`,r.appendChild(z)}});if(p){const last=h[p-1];last.setAttribute("data-last-page","1");if(logoOn&&!last.querySelector("[data-last-page-logo]")){const z=document.createElement("div");z.className="ts-last-page-logo";z.setAttribute("data-last-page-logo","1");z.innerHTML=\'<img class="ts-logo" src="/icons/timesyncher-icon-black-transparent.png" alt="TimeSyncher Vacation" /><span>TimeSyncher Vacation</span>\';last.appendChild(z)}}if(document.body)document.body.setAttribute("data-print-media-ready","1")};document.open(),document.write(`<!doctype html><html><head><base href="${(typeof location<"u"&&location.origin)||"https://vacation-staging.timesyncher.com"}/" /><title>${e.replace(/[&<>\\"]/g,"")}</title>${i}</head><body data-ae-print="1" data-print-ready="style2">${t}<script>(${c.toString()})();<\\/script></body></html>`),document.close()};seGo();I.useEffect(()=>{seGo()},[e,t,i]);return n.jsx("div",{style:{padding:20,fontFamily:"system-ui, sans-serif"},children:"Preparing PDF…"})}';

const DS_NEEDLE = 'Ds=G=>{var Re;return Mi(G)?!1:((Re=le[Qt(G)])==null?void 0:Re.timeline)??hl(G)}';
const DS_PATCH = 'Ds=G=>{var Re;return Mi(G)?!1:((Re=ha(G))==null?void 0:Re.timeline)??hl(G)}';

const OP_GRID_NEEDLE = '<div class="daily-grid">${js}<main class="daily-details">';
const OP_GRID_PATCH = '<div class="daily-grid" data-two-col="1" style="display:table;width:100%;table-layout:fixed">${js}<main class="daily-details" data-two-col-details="1" style="display:table-cell;width:62%;vertical-align:top">';

const OP_LEFT_NEEDLE = 'js=`<aside class="daily-left">';
const OP_LEFT_PATCH = 'js=`<aside class="daily-left" data-two-col-itinerary="1" style="display:table-cell;width:38%;vertical-align:top;padding-right:14px">';

const DAILY_CARD_NEEDLE = 'return`<article class="thing daily-thing"><div class="thing-head">';
const DAILY_CARD_PATCH = 'return`<article class="thing daily-thing" data-two-col-card="1" data-happy-hour="${ha(G).happyHour?"1":"0"}"><div class="thing-head">';

const SI_NYC_TAIL = ',[/guided walking|audio history/i,[40.7794,-73.9632]]]';
const SI_VEGAS_TAIL = ',[/guided walking|audio history/i,[40.7794,-73.9632]],[/bellagio|conservatory/i,[36.1126,-115.1767]],[/shake shack/i,[36.1097,-115.1739]],[/carbone/i,[36.1073,-115.1766]],[/cosmopolitan|eggslut/i,[36.1097,-115.1739]],[/lotus of siam/i,[36.1436,-115.1415]],[/las vegas strip|las vegas/i,[36.1147,-115.1729]]]';

const MN_CATEGORY_NEEDLE = 'Mn=G=>{const Re=String(G||"").toLowerCase();return Re.includes("flight")?"flight":Re.includes("car")||Re.includes("rental")?"car":Re.includes("hotel")?"hotel":';
const MN_CATEGORY_PATCH = 'Mn=G=>{const Re=String(G||"").toLowerCase();return Re.includes("flight")?"flight":Re.includes("restaurant")?"restaurant":Re.includes("car")||Re.includes("rental")?"car":Re.includes("hotel")?"hotel":';

const LIVE_TAB_NEEDLE = 'Gn=Fs.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Je.length||Je.every(Re=>vn(G).includes(Re))),ci=ot.filter(G=>Oc.some(Re=>or(Re).includes(G))),Qn=Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re))),ki=Cc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!vt.length||vt.includes(Yd(G)))';
const LIVE_TAB_PATCH = `tsPad=(rows,kind,names,min)=>{const have=new Set(rows.map(G=>String(mr(G)||G.name||"").toLowerCase()).filter(Boolean));const extra=names.filter(n=>n&&![...have].some(h=>h.includes(n.toLowerCase())||n.toLowerCase().includes(h))).slice(0,Math.max(0,min-rows.length)).map((name,i)=>({id:(kind==="restaurant"?910000:kind==="store"?920000:930000)+i+1,name,__tsLiveFill:1,category:kind==="rest"?"event":kind,type:kind==="rest"?"event":kind,icon:kind==="restaurant"?"🍽️":kind==="store"?"🛍️":"🎟️",lat:36.1147,lng:-115.1729,address:"Nevada"}));return rows.concat(extra)},tsFill=${JSON.stringify(LIVE_TAB_FILL)},tsMin=${JSON.stringify(LIVE_TAB_MINIMUMS)},Gn=tsPad(Fs.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Je.length||Je.every(Re=>vn(G).includes(Re))),"store",tsFill.store,tsMin.store),ci=ot.filter(G=>Oc.some(Re=>or(Re).includes(G))),Qn=tsPad(Oc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!Te.length||Te.every(Re=>or(G).includes(Re))),"restaurant",tsFill.restaurant,tsMin.restaurant),ki=tsPad(Cc.filter(G=>!ze.length||ze.includes(En(G))).filter(G=>!vt.length||vt.includes(Yd(G))),"rest",tsFill.rest,tsMin.rest)`;

const IT_CATEGORY_NEEDLE = 'It=G=>Mn(ha(G).category??Fn(G))';
const IT_CATEGORY_PATCH = 'It=G=>Mn(ha(G).category??(typeof G.category==="string"?G.category:G.category&&G.category.name)??G.category_name??Fn(G))';

const QN_RENDER_NEEDLE = 'Qn.map(G=>Oe(G))';
const QN_RENDER_PATCH = 'tsPad(Qn,"restaurant",tsFill.restaurant,tsMin.restaurant).map(G=>Oe(G))';
const GN_RENDER_NEEDLE = 'Gn.map(G=>Oe(G))';
const GN_RENDER_PATCH = 'tsPad(Gn,"store",tsFill.store,tsMin.store).map(G=>Oe(G))';
const KI_RENDER_NEEDLE = 'ki.map(G=>Oe(G))';
const KI_RENDER_PATCH = 'tsPad(ki,"rest",tsFill.rest,tsMin.rest).map(G=>Oe(G))';

const MO_BUDGET_NEEDLE = 'Mo=Array.from(new Map(Qa.flatMap(di=>Ci(di)).filter(di=>(di==null?void 0:di.item)&&!["travel","travel-to-thing","transport","hotel-wake","hotel-sleep","hotel-checkout"].includes(di.type)).map(di=>{const Xi=di.item;return[Qt(Xi),{item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))}]})).values())';
const MO_BUDGET_PATCH = 'Mo=Array.from(new Map((Gt||[]).filter(Xi=>Xi&&Ds(Xi)&&!Mi(Xi)).map(Xi=>[Qt(Xi),{item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))}])).values())';

const MAP_HEIGHT_NEEDLE = 'height:dn?900:300,marginBottom:12';
const MAP_HEIGHT_PATCH = 'height:dn?420:300,marginBottom:12';

const QN_EMPTY_NEEDLE = 'tsPad(Qn,"restaurant",tsFill.restaurant,tsMin.restaurant).map(G=>Oe(G)),Qn.length===0';
const QN_EMPTY_PATCH = 'tsPad(Qn,"restaurant",tsFill.restaurant,tsMin.restaurant).map(G=>Oe(G)),tsPad(Qn,"restaurant",tsFill.restaurant,tsMin.restaurant).length===0';
const GN_EMPTY_NEEDLE = 'tsPad(Gn,"store",tsFill.store,tsMin.store).map(G=>Oe(G)),Gn.length===0';
const GN_EMPTY_PATCH = 'tsPad(Gn,"store",tsFill.store,tsMin.store).map(G=>Oe(G)),tsPad(Gn,"store",tsFill.store,tsMin.store).length===0';
const KI_EMPTY_NEEDLE = 'tsPad(ki,"rest",tsFill.rest,tsMin.rest).map(G=>Oe(G)),ki.length===0';
const KI_EMPTY_PATCH = 'tsPad(ki,"rest",tsFill.rest,tsMin.rest).map(G=>Oe(G)),tsPad(ki,"rest",tsFill.rest,tsMin.rest).length===0';

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
  if (patched.includes(W_LIST_NEEDLE)) {
    patched = patched.replace(W_LIST_NEEDLE, W_LIST_PATCH);
  }
  if (patched.includes(OP_TITLE_NEEDLE)) {
    patched = patched.replace(OP_TITLE_NEEDLE, OP_TITLE_PATCH);
  }
  if (patched.includes(SU_TITLE_NEEDLE)) {
    patched = patched.replace(SU_TITLE_NEEDLE, SU_TITLE_PATCH);
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
  if (patched.includes(HA_NEEDLE)) {
    patched = patched.replace(HA_NEEDLE, HA_PATCH);
  }
  if (patched.includes(PE_EFFECT_NEEDLE)) {
    patched = patched.replace(PE_EFFECT_NEEDLE, PE_EFFECT_PATCH);
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
  if (patched.includes(LIVE_TAB_NEEDLE)) {
    patched = patched.replace(LIVE_TAB_NEEDLE, LIVE_TAB_PATCH);
  }
  if (patched.includes(IT_CATEGORY_NEEDLE)) {
    patched = patched.replace(IT_CATEGORY_NEEDLE, IT_CATEGORY_PATCH);
  }
  if (patched.includes(QN_RENDER_NEEDLE)) {
    patched = patched.replace(QN_RENDER_NEEDLE, QN_RENDER_PATCH);
  }
  if (patched.includes(GN_RENDER_NEEDLE)) {
    patched = patched.replace(GN_RENDER_NEEDLE, GN_RENDER_PATCH);
  }
  if (patched.includes(KI_RENDER_NEEDLE)) {
    patched = patched.replace(KI_RENDER_NEEDLE, KI_RENDER_PATCH);
  }
  if (patched.includes(MO_BUDGET_NEEDLE)) {
    patched = patched.replace(MO_BUDGET_NEEDLE, MO_BUDGET_PATCH);
  }
  if (patched.includes(MAP_HEIGHT_NEEDLE)) {
    patched = patched.replace(MAP_HEIGHT_NEEDLE, MAP_HEIGHT_PATCH);
  }
  if (patched.includes(QN_EMPTY_NEEDLE)) {
    patched = patched.replace(QN_EMPTY_NEEDLE, QN_EMPTY_PATCH);
  }
  if (patched.includes(GN_EMPTY_NEEDLE)) {
    patched = patched.replace(GN_EMPTY_NEEDLE, GN_EMPTY_PATCH);
  }
  if (patched.includes(KI_EMPTY_NEEDLE)) {
    patched = patched.replace(KI_EMPTY_NEEDLE, KI_EMPTY_PATCH);
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
  if (patched.includes(XA_DAY_NEEDLE)) {
    patched = patched.replace(XA_DAY_NEEDLE, XA_DAY_PATCH);
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
  if (!js.includes('data-story-media-only="1"') || !js.includes('${zt.map(fs).join("")}')) {
    throw new Error('Style two stories must use fo()/Ba(); Style one must keep product fs().');
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
  if (!js.includes(OP_TITLE_PATCH) || !js.includes(SU_TITLE_PATCH) || !js.includes('data-row-summary="1"')) {
    throw new Error('Style two itinerary-row summary must use stored rr() on Mc() and op() titles.');
  }
  if (!js.includes('data-story-summary="1"') || !js.includes('data-story-body="1"')) {
    throw new Error('Style two story summary-before-story patch did not apply.');
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
    throw new Error('Style two live category Mn() restaurant-before-car patch did not apply.');
  }
  if (!js.includes('tsPad=') || !js.includes('__tsLiveFill:1') || !js.includes('"restaurant":15')) {
    throw new Error('Style two live tab 15/10/15 pad patch did not apply.');
  }
  if (!js.includes(IT_CATEGORY_PATCH) || js.includes(IT_CATEGORY_NEEDLE)) {
    throw new Error('Style two live It() category-object patch did not apply.');
  }
  if (!js.includes(QN_RENDER_PATCH) || !js.includes(GN_RENDER_PATCH) || !js.includes(KI_RENDER_PATCH)) {
    throw new Error('Style two live tab render pad did not apply.');
  }
  if (!js.includes(MO_BUDGET_PATCH) || !js.includes('(Gt||[]).filter(Xi=>Xi&&Ds(Xi)&&!Mi(Xi))')) {
    throw new Error('Style two live budget timeline-selected Gt rows did not apply.');
  }
  if (!js.includes(MAP_HEIGHT_PATCH) || js.includes(MAP_HEIGHT_NEEDLE)) {
    throw new Error('Style two live day-map height patch did not apply.');
  }
  if (!js.includes(QN_EMPTY_PATCH) || !js.includes(GN_EMPTY_PATCH)) {
    throw new Error('Style two live tab empty-state pad check did not apply.');
  }
  if (!js.includes('tsFillOv=') || !js.includes('ha=G=>tsFillOv(le[Qt(G)]||{},G)')) {
    throw new Error('Style two ha() product-field fill did not apply.');
  }
  if (!js.includes('names.some(n=>row.match.test(n))')) {
    throw new Error('Style two ha() must match thing.name, not only override title.');
  }
  if (!js.includes(PE_EFFECT_PATCH) || js.includes(PE_EFFECT_NEEDLE) || js.includes('typeof tsFillOv==="function"')) {
    throw new Error('Style two live pe() hydrate must apply without closing over tsFillOv (wse TDZ expired lock).');
  }
  if (js.includes(HH_CHECK_NEEDLE) || !js.includes(HH_CHECK_PATCH)) {
    throw new Error('Style two live Happy hour checkbox product match did not apply.');
  }
  if (js.includes(HH_DETAILS_NEEDLE) || !js.includes(HH_DETAILS_PATCH)) {
    throw new Error('Style two live Happy hour details product match did not apply.');
  }
  if (js.includes(CO_NEEDLE) || !js.includes(CO_PATCH)) {
    throw new Error('Style two live Details longDetails product match did not apply.');
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
  if (!js.includes('carbone') || !js.includes('longDetails')) {
    throw new Error('Style two client product fields are missing Carbone longDetails.');
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
  if (!js.includes(SO_PATCH) || js.includes(SO_NEEDLE) || js.includes('const zt="https://travel.timesyncher.com",ua=new URL(Re,zt)')) {
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
  if (!js.includes('data-summary-continued="1"') || !js.includes('${wn}${sm}${js}${zl}${Qi}')) {
    throw new Error('Summary continued pages must exist with top-margin bar data-summary-continued.');
  }
  if (!js.includes('kind!=="video"') || js.includes('.style2-day-media">${ua.map(Ba)')) {
    throw new Error('Day itinerary media must omit video QR cards; QRs stay in Saved Stories.');
  }
  if (!js.includes('data-day-things-2col="1"') || !js.includes('data-day-things-flow="1"') || !js.includes('data-stories-packed="1"') || js.includes('Pn=Rn.slice(0,2)')) {
    throw new Error('Day Things and Saved Stories must pack in a 2-col continuous flow, not Mc slice(0,2)/+=3 pages.');
  }
  if (!js.includes('@page{margin-top:18mm') || !js.includes('box-decoration-break:clone')) {
    throw new Error('Every page must carry an 18mm top margin via @page + cloned padding.');
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
  res.setHeader('access-control-allow-origin', '*');
  res.end(patched);
}
