/** Shared thing-card HTML for category tabs; day timeline stays native NYC TREK React. */

export function renderThingCardHtml(fields = {}) {
  const metaHtml = fields.metaHtml || '';
  const logoHtml = fields.logoHtml || '';
  const nameHtml = fields.nameHtml || '';
  const priceHtml = fields.priceHtml || '';
  const summaryHtml = fields.summaryHtml || '';
  const bodyHtml = fields.bodyHtml || '';
  const reviewsHtml = fields.reviewsHtml || '';
  const mediaHtml = fields.mediaHtml || '';
  return `<article class="thing style2-thing" data-thing-card="1"><div class="style2-thing-meta">${metaHtml}</div><div class="thing-head">${logoHtml}<div><h3>${nameHtml}</h3>${summaryHtml}${priceHtml}</div></div>${bodyHtml}${reviewsHtml}${mediaHtml}</article>`;
}

export function thingCardBundleExpr() {
  return `tsRenderThingCard=${renderThingCardHtml.toString()}`;
}

/** Keepsake style-2 print-media-card sizing, scoped to shared day timeline only. */
function itineraryTimelineMediaStyleTag() {
  const scope = '[data-ts-day-timeline="1"]';
  const css = [
    `${scope} .print-media-card{margin:0 8px 8px 0;width:92px;max-width:92px;display:inline-block;vertical-align:top;text-align:center;break-inside:avoid}`,
    `${scope} .print-media-card>img:not(.print-media-qr){width:92px;height:72px;object-fit:cover;border-radius:10px;border:1px solid #e5e7eb;background:#f8fafc;display:block}`,
    `${scope} .print-media-card.video>img.print-media-qr{width:72px;height:72px;object-fit:contain;background:#fff;border:1px solid #e5e7eb;border-radius:10px;display:block}`,
    `${scope} .print-media-card figcaption{font:400 10px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color:#64748b;margin-top:4px}`,
    `${scope} [data-itinerary-day-media="1"],${scope} [data-itinerary-row-media="1"]{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}`,
  ].join('');
  return `<style data-itinerary-timeline-media-css="1">${css}</style>`;
}

function itineraryTimelineMediaStyleBundleExpr() {
  return `tsItineraryTimelineMediaCss=${itineraryTimelineMediaStyleTag.toString()}`;
}

function itineraryDayMedia(G) {
  const rows = (typeof li == 'function' ? li(G) : []).filter((Oo) => {
    if (!Oo) return false;
    const src = String(Oo.url || '');
    if (/^data:image\//i.test(src)) return src.length > 12000;
    const blob = [Oo.filename, Oo.original_name, Oo.originalName, Oo.caption, src.slice(0, 240), String(Oo.thumbnailUrl || '').slice(0, 240), Oo.id].join(' ');
    return !/placeholder|1024.?1024|default[-_]?thumb|bind[- ]?proof|neon file bind proof/i.test(blob);
  });
  const photos = rows.filter((Oo) => Oo.kind !== 'video').map(Ba).join('');
  const videos = rows.filter((Oo) => Oo.kind === 'video').map(Ba).join('');
  return photos + videos;
}

function itineraryRowMediaInline(item, type) {
  const rowType = String(type || '');
  if (/^(travel|travel-to-thing|flight|transport|hotel-wake|hotel-event|hotel-sleep|hotel-checkout)$/i.test(rowType)) return '';
  const rows = (typeof fo == 'function' ? fo(item) : []).filter((Oo) => {
    if (!Oo) return false;
    return !/bind[- ]?proof|neon file bind proof/i.test([Oo.filename, Oo.original_name, Oo.originalName, Oo.caption, Oo.url, Oo.public_url, Oo.id].join(' '));
  });
  const photos = rows.filter((Oo) => Oo.kind !== 'video').map(Ba).join('');
  const videos = rows.filter((Oo) => Oo.kind === 'video').map(Ba).join('');
  if (!photos && !videos) return '';
  return `<div data-itinerary-row-media="1">${photos}${videos}</div>`;
}

function dayTimelineMediaBundleExpr() {
  return `${itineraryTimelineMediaStyleBundleExpr()},tsItineraryDayMedia=${itineraryDayMedia.toString()},tsItineraryRowMedia=${itineraryRowMediaInline.toString()}`;
}

export const ROW_TYPE_SKIP = '/^(travel|travel-to-thing|flight|transport|hotel-wake|hotel-event|hotel-sleep|hotel-' + 'checkout)$/i';

const DAY_TIMELINE_BODY_NEEDLE = 'children:[Re.length===0&&n.jsx("div",{style:{fontSize:12,color:"#9ca3af"},children:"No timeline-tagged things yet for this day."})';
const DAY_TIMELINE_BODY_PATCH = 'children:[(()=>{const css=tsItineraryTimelineMediaCss();return css?n.jsx("div",{dangerouslySetInnerHTML:{__html:css}}):null})(),(()=>{const dm=tsItineraryDayMedia(G);return dm?n.jsx("div",{style:{marginBottom:4},dangerouslySetInnerHTML:{__html:`<div data-itinerary-day-media="1">${dm}</div>`}}):null})(),Re.length===0&&n.jsx("div",{style:{fontSize:12,color:"#9ca3af"},children:"No timeline-tagged things yet for this day."})';
const DAY_TIMELINE_BODY_CSS_NEEDLE = 'children:[(()=>{const dm=tsItineraryDayMedia(G);return dm?n.jsx("div",{style:{marginBottom:4},dangerouslySetInnerHTML:{__html:`<div data-itinerary-day-media="1" style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 4px">${dm}</div>`}}):null})(),Re.length===0&&n.jsx("div",{style:{fontSize:12,color:"#9ca3af"},children:"No timeline-tagged things yet for this day."})';
const DAY_TITLE_NR_NEEDLE = 'children:Pn}),n.jsx(Nr,{items:zr,scopeKey:Qt(ua.item),compact:!0})';
const DAY_TITLE_NR_PATCH = 'children:Pn}),!' + ROW_TYPE_SKIP + '.test(String(ua.type||""))&&!/^Travel (to|from)\\b/i.test(String(ua.title||""))&&rr(ua.item)?n.jsx("div",{"data-row-summary":"1","data-summary-thing-only":"1",style:{fontSize:12,fontWeight:400,marginTop:3,lineHeight:1.4,color:"#334155"},children:Bs(rr(ua.item))}):null,(()=>{const html=tsItineraryRowMedia(ua.item,ua.type);return html?n.jsx("div",{dangerouslySetInnerHTML:{__html:html}}):null})(),n.jsx(Nr,{items:zr,scopeKey:Qt(ua.item),compact:!0})';

export function applyDayTimelineMediaPatches(source = '') {
  let js = String(source || '');
  if (!js.includes('tsItineraryDayMedia=') && js.includes('wd=(G,Re)=>')) {
    js = js.replace('wd=(G,Re)=>', `${dayTimelineMediaBundleExpr()},wd=(G,Re)=>`);
  }
  if (js.includes(DAY_TIMELINE_BODY_NEEDLE)) {
    js = js.replace(DAY_TIMELINE_BODY_NEEDLE, DAY_TIMELINE_BODY_PATCH);
  } else if (js.includes(DAY_TIMELINE_BODY_CSS_NEEDLE)) {
    js = js.replace(DAY_TIMELINE_BODY_CSS_NEEDLE, DAY_TIMELINE_BODY_PATCH);
  }
  if (js.includes(DAY_TITLE_NR_NEEDLE)) js = js.replace(DAY_TITLE_NR_NEEDLE, DAY_TITLE_NR_PATCH);
  return js;
}

const SU_TIMELINE_PN = '<div class="style2-timeline">${Rn}</div>${Pn}</section>';
const SU_TIMELINE = '<div class="style2-timeline">${Rn}</div></section>';
const BODY_SUMMARY_NEEDLE = 'Pn=rr(zt)||Co(zt)||Fl(zt)';
const BODY_SUMMARY_PATCH = 'Pn=rr(zt)?(Co(zt)!==rr(zt)?Co(zt):""):(Co(zt)||Fl(zt))';
const ROW_MEDIA_NEEDLE = 'zr=fo(zt).filter(Oo=>Oo&&Oo.kind!=="video"&&!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" "))).length?`<div class="style2-thing-media">${fo(zt).filter(Oo=>Oo&&Oo.kind!=="video"&&!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" "))).map(Ba).join("")}</div>`:""';
const ROW_MEDIA_PATCH = 'zr=(()=>{const rows=fo(zt).filter(Oo=>Oo&&!/bind[- ]?proof|neon file bind proof/i.test([Oo.filename,Oo.original_name,Oo.originalName,Oo.caption,Oo.url,Oo.public_url,Oo.id].join(" ")));const photos=rows.filter(Oo=>Oo.kind!=="video").map(Ba).join("");const videos=rows.filter(Oo=>Oo.kind==="video").map(Ba).join("");return photos||videos?`<div class="style2-thing-media" data-itinerary-row-media="1">${photos}${videos}</div>`:""})()';
const VIDEO_QR_HIDE = '[data-daily-thing-media] .print-media-card.video{display:none!important}';
const VIDEO_QR_UNHIDE = '[data-itinerary-day-media="1"] .print-media-card.video,[data-itinerary-row-media="1"] .print-media-card.video{display:inline-block!important}';
const DAY_GALLERY_NEEDLE = 'zt.length>0&&n.jsx("div",{style:{padding:"10px 16px 2px"},children:n.jsx(Nr,{items:zt,scopeKey:`day:${G.id}`})}),';
const WD_RETURN_NEEDLE = 'return`<article class="thing style2-thing" data-thing-card="1"><div class="style2-thing-meta">${an(Mo)}</div><div class="thing-head">${Rn?`<img class="thing-logo" src="${an(Rn)}" />`:`<span class="thing-emoji">${an(Pc(zt))}</span>`}<div><h3>${an(Bs(mr(zt)))}</h3>${bi(zt)?`<div class="thing-meta">${an(bi(zt))}</div>`:""}</div></div>${sr}${Xr?`<div class="reviews">${Xr}</div>`:""}${zr}</article>`';
const WD_RETURN_PATCH = 'return tsRenderThingCard({metaHtml:an(Mo),logoHtml:Rn?`<img class="thing-logo" src="${an(Rn)}" />`:`<span class="thing-emoji">${an(Pc(zt))}</span>`,nameHtml:an(Bs(mr(zt))),priceHtml:bi(zt)?`<div class="thing-meta">${an(bi(zt))}</div>`:"",summaryHtml:!' + ROW_TYPE_SKIP + '.test(String((ua&&ua.type)||""))&&!/^Travel (to|from)\\b/i.test(String((ua&&ua.title)||""))&&rr(zt)?`<div data-row-summary="1" data-summary-thing-only="1">${an(Bs(rr(zt)))}</div>`:"",bodyHtml:sr,reviewsHtml:Xr?`<div class="reviews">${Xr}</div>`:"",mediaHtml:zr})';

export function applyItineraryKeepsakePass(source = '') {
  let js = String(source || '');
  if (js.includes(SU_TIMELINE_PN)) js = js.replace(SU_TIMELINE_PN, SU_TIMELINE);
  if (js.includes(BODY_SUMMARY_NEEDLE)) js = js.replace(BODY_SUMMARY_NEEDLE, BODY_SUMMARY_PATCH);
  if (js.includes(ROW_MEDIA_NEEDLE)) js = js.replace(ROW_MEDIA_NEEDLE, ROW_MEDIA_PATCH);
  if (js.includes(WD_RETURN_NEEDLE)) js = js.replace(WD_RETURN_NEEDLE, WD_RETURN_PATCH);
  if (js.includes(VIDEO_QR_HIDE) && !js.includes(VIDEO_QR_UNHIDE)) js = js.replace(VIDEO_QR_HIDE, `${VIDEO_QR_HIDE}${VIDEO_QR_UNHIDE}`);
  if (js.includes(DAY_GALLERY_NEEDLE)) js = js.replace(DAY_GALLERY_NEEDLE, '');
  if (!js.includes('tsItineraryDayMedia=') && js.includes('wd=(G,Re)=>')) {
    js = js.replace('wd=(G,Re)=>', `${dayTimelineMediaBundleExpr()},wd=(G,Re)=>`);
  }
  return js;
}
