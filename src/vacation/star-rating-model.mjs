const STAR_PATH =
  'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

function text(value) {
  return String(value ?? '').trim();
}

export function parseStarRating(raw) {
  const value = text(raw);
  if (!value || !/\d/.test(value)) return null;
  const match = value.match(/^(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(5, parsed);
}

export function roundStarRatingToHalf(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const clamped = Math.min(5, n);
  return Math.round(clamped * 2) / 2;
}

export function starRatingAccessibilityLabel(value) {
  const rounded = roundStarRatingToHalf(value);
  if (rounded == null) return '';
  const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${display} out of 5 stars`;
}

export function buildStarRatingStates(value) {
  const rounded = roundStarRatingToHalf(value);
  if (rounded == null) return null;
  const states = [];
  let remaining = rounded;
  for (let index = 0; index < 5; index += 1) {
    if (remaining >= 1) {
      states.push('full');
      remaining -= 1;
    } else if (remaining >= 0.5) {
      states.push('half');
      remaining -= 0.5;
    } else {
      states.push('empty');
    }
  }
  return states;
}

export function primaryPlaceStarRating(override = {}) {
  for (const key of ['googleRating', 'yelpRating', 'thirdPartyRating', 'rating']) {
    const parsed = parseStarRating(override[key]);
    if (parsed != null) return parsed;
  }
  return null;
}

function escapeHtmlAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

const STAR_GOLD_FILL = '#f59e0b';
const STAR_EMPTY_FILL = '#e5e7eb';

function starSvgMarkup(state, clipId) {
  if (state === 'full') {
    return `<svg class="ts-star ts-star-full" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="${STAR_PATH}" fill="${STAR_GOLD_FILL}"/></svg>`;
  }
  if (state === 'empty') {
    return `<svg class="ts-star ts-star-empty" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="${STAR_PATH}" fill="${STAR_EMPTY_FILL}"/></svg>`;
  }
  return `<svg class="ts-star ts-star-half" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><defs><clipPath id="${clipId}"><rect x="0" y="0" width="12" height="24"/></clipPath></defs><path class="ts-star-half-empty" d="${STAR_PATH}" fill="${STAR_EMPTY_FILL}"/><path class="ts-star-half-full" d="${STAR_PATH}" fill="${STAR_GOLD_FILL}" clip-path="url(#${clipId})"/></svg>`;
}

export function renderStarRatingHtml(value, { size = 16, idPrefix = 'ts-star' } = {}) {
  const states = buildStarRatingStates(value);
  if (!states) return '';
  const label = starRatingAccessibilityLabel(value);
  const safeLabel = escapeHtmlAttr(label);
  const glyphs = states
    .map((state, index) => starSvgMarkup(state, `${idPrefix}-${index}`))
    .join('');
  const width = Number(size) || 16;
  return `<span class="ts-star-rating" role="img" aria-label="${safeLabel}" title="${safeLabel}" style="display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:2px;vertical-align:middle">${glyphs.replaceAll('width="16"', `width="${width}"`).replaceAll('height="16"', `height="${width}"`)}</span>`;
}

export const TREK_STAR_RATING_CSS =
  '.ts-star-rating{display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:2px;vertical-align:middle}.ts-star-rating svg{width:16px;height:16px;flex:0 0 16px}.ts-star-full,.ts-star-half-full{color:#f59e0b;fill:currentColor}.ts-star-empty,.ts-star-half-empty{color:#e5e7eb;fill:currentColor}';

export function trekStarRatingBundleInject() {
  const path = STAR_PATH.replace(/'/g, "\\'");
  return [
    `tsParseStarRating=raw=>{const v=String(raw??"").trim();if(!v||!/\\d/.test(v))return null;const m=v.match(/^(-?\\d+(?:\\.\\d+)?)/);if(!m)return null;const n=Number(m[1]);if(!Number.isFinite(n)||n<=0)return null;return Math.min(5,n);}`,
    `tsRoundStarRatingHalf=v=>{const n=Number(v);if(!Number.isFinite(n)||n<=0)return null;return Math.round(Math.min(5,n)*2)/2;}`,
    `tsStarRatingStates=v=>{const r=tsRoundStarRatingHalf(v);if(r==null)return null;const s=[];let x=r;for(let i=0;i<5;i+=1){if(x>=1){s.push("full");x-=1;}else if(x>=0.5){s.push("half");x-=0.5;}else s.push("empty");}return s;}`,
    `tsStarRatingAria=v=>{const r=tsRoundStarRatingHalf(v);if(r==null)return "";const d=Number.isInteger(r)?String(r):r.toFixed(1);return d+" out of 5 stars";}`,
    `tsStarPath='${path}'`,
    `tsStarSvg=(state,id)=>state==="full"?'<svg class="ts-star ts-star-full" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="'+tsStarPath+'" fill="#f59e0b"/></svg>':state==="empty"?'<svg class="ts-star ts-star-empty" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="'+tsStarPath+'" fill="#e5e7eb"/></svg>':'<svg class="ts-star ts-star-half" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><defs><clipPath id="'+id+'"><rect x="0" y="0" width="12" height="24"/></clipPath></defs><path class="ts-star-half-empty" d="'+tsStarPath+'" fill="#e5e7eb"/><path class="ts-star-half-full" d="'+tsStarPath+'" fill="#f59e0b" clip-path="url(#'+id+')"/></svg>'`,
    `tsRenderStarRatingHtml=v=>{const st=tsStarRatingStates(v);if(!st)return "";const label=String(tsStarRatingAria(v)).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");return '<span class="ts-star-rating" role="img" aria-label="'+label+'" title="'+label+'" style="display:inline-flex;flex-direction:row;flex-wrap:nowrap;align-items:center;gap:2px;vertical-align:middle">'+st.map((state,index)=>tsStarSvg(state,"tsb"+index)).join("")+"</span>";}`,
    `tsPrimaryPlaceStarRating=d=>{for(const k of["googleRating","yelpRating","thirdPartyRating","rating"]){const p=tsParseStarRating(d[k]);if(p!=null)return p;}return null;}`,
    `tsThingReviewLines=G=>{const d=ha(G)||{},out=[];for(let i=1;i<=4;i++){const body=String(d["review"+i]||"").replace(/\\s+/g," ").trim();if(!body)continue;const stars=tsRenderStarRatingHtml(d["review"+i+"Rating"]);out.push('<div data-ts-thing-review="1">'+(stars?stars+" ":"")+an(body)+"</div>");}if(out.length)return out.join("");const th=d.reviewThemes;let bits=[];if(Array.isArray(th))bits=th;else if(th&&typeof th==="object")bits=[].concat(th.praise||[],th.watchOuts||[]);const text=bits.map(t=>String((t&&t.text)||t||"").replace(/\\s+/g," ").trim()).filter(Boolean).slice(0,2).join(" ");const rating=tsPrimaryPlaceStarRating(d);if(!text||rating==null)return "";const stars=tsRenderStarRatingHtml(rating);return '<div data-ts-thing-review="1">'+(stars?stars+" ":"")+an(text)+"</div>";}`,
  ].join(',');
}
