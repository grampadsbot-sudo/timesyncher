import { neighborhoodChipLabelBundleInject, neighborhoodChipLabelBundleLocal } from './neighborhood-chip-label.mjs';

const INJECT_BEFORE_REVIEW_LINES = 'return null;},tsThingReviewLines=G=>{';

const FIELDSET_OPEN_NEEDLE =
  'n.jsxs("fieldset",{"data-shared-readonly":Ce?void 0:"true",disabled:!Ce,style:{border:0,padding:0,margin:0,minInlineSize:0,opacity:1},children:[n.jsx(Nr,{items:fo(Dt),scopeKey:Qt(Dt)}),';

const FIELDSET_OPEN_PATCH =
  'Ce&&n.jsxs("fieldset",{"data-shared-readonly":void 0,disabled:!1,style:{border:0,padding:0,margin:0,minInlineSize:0,opacity:1},children:[n.jsx(Nr,{items:fo(Dt),scopeKey:Qt(Dt)}),';

const NB_RAW_NEEDLE =
  'return String(src.neighborhood||G.neighborhood||ov.neighborhood||"").trim()};const seen=new Set();const chips=[];for(const G of [...(Gt||[]),...(Ut||[])]){const n=nb(G);';

const NB_RAW_PATCH =
  'const raw=String(src.neighborhood||G.neighborhood||ov.neighborhood||"").trim();return raw?tsChipLabel(raw):""};const seen=new Set();const chips=[];for(const G of [...(Gt||[]),...(Ut||[])]){const n=nb(G);';

const CHIP_LOCAL_NEEDLE =
  'const nb=G=>{if(!G)return"";const ov=le[key(G)]||{};const src=G.source&&typeof G.source==="object"?G.source:(ov.source&&typeof ov.source==="object"?ov.source:{})';
const CHIP_LOCAL_PATCH =
  `const tsChipLabel=${neighborhoodChipLabelBundleLocal()};const nb=G=>{if(!G)return"";const ov=le[key(G)]||{};const src=G.source&&typeof G.source==="object"?G.source:(ov.source&&typeof ov.source==="object"?ov.source:{})`;

const SN_RAW_NEEDLE =
  'const n=String((src&&src.neighborhood)||(Re&&Re.neighborhood)||ov.neighborhood||"").trim();if(n)return n;const a=String(G||"").trim();return a&&Ke.includes(a)?a:""}';

const SN_PATCH_MARKER = 'const n=(raw=>{let s=String(raw??"").replace(/\\s+/g," ").trim()';

const SN_RAW_PATCH =
  `const n=(${neighborhoodChipLabelBundleLocal()})(String((src&&src.neighborhood)||(Re&&Re.neighborhood)||ov.neighborhood||"").trim());if(n)return n;const a=String(G||"").trim();return a&&Ke.includes(a)?a:""}`;

const CHIP_DEDUPE_NEEDLE = 'if(n&&!seen.has(n)){seen.add(n);chips.push(n)}';
const CHIP_DEDUPE_PATCH =
  'if(n){const nk=n.toLowerCase();if(!seen.has(nk)){seen.add(nk);chips.push(n)}}';

function injectNeighborhoodHelper(js) {
  if (js.includes('tsNeighborhoodChipLabel=raw=>')) return js;
  const inject = neighborhoodChipLabelBundleInject();
  if (js.includes(INJECT_BEFORE_REVIEW_LINES)) {
    return js.replace(INJECT_BEFORE_REVIEW_LINES, `return null;},${inject},tsThingReviewLines=G=>{`);
  }
  throw new Error('ui #737 neighborhood chip label inject did not apply');
}

export function patchUi737(source = '') {
  let js = String(source || '');
  js = js.replaceAll('ze.some(z=>String(z).toLowerCase()===En(G).toLowerCase())', 'ze.includes(En(G))');
  js = js.replaceAll('ze.some(z=>String(z).toLowerCase()===En(Re).toLowerCase())', 'ze.includes(En(Re))');
  js = js.replace(
    ']},G))]})]})]})}):null,n.jsxs("div",{style:{maxWidth:1120,width:"100%",minWidth:0,boxSizing:"border-box",margin:"0 auto",padding:"20px 16px",overflowX:"clip"},children:[n.jsx("div",{style:{display:"flex",gap:3,marginBottom:20',
    ']},G))]})]})]})}),n.jsxs("div",{style:{maxWidth:1120,width:"100%",minWidth:0,boxSizing:"border-box",margin:"0 auto",padding:"20px 16px",overflowX:"clip"},children:[n.jsx("div",{style:{display:"flex",gap:3,marginBottom:20',
  );
  js = js.replace('Ce?n.jsxs("fieldset",{"data-shared-readonly":void 0', 'n.jsxs("fieldset",{"data-shared-readonly":Ce?void 0:"true",disabled:!Ce');
  js = injectNeighborhoodHelper(js);
  if (js.includes(FIELDSET_OPEN_NEEDLE)) {
    js = js.replace(FIELDSET_OPEN_NEEDLE, FIELDSET_OPEN_PATCH);
  } else if (!js.includes('Ce&&n.jsxs("fieldset",{"data-shared-readonly":void 0')) {
    throw new Error('ui #737 view-only detail editor fieldset patch did not apply');
  }
  if (js.includes(NB_RAW_NEEDLE)) {
    js = js.replace(NB_RAW_NEEDLE, NB_RAW_PATCH);
  } else if (!js.includes('return raw?tsChipLabel(raw):""')) {
    throw new Error('ui #737 area chip nb() normalizer patch did not apply');
  }
  if (!js.includes('const tsChipLabel=raw=>') && js.includes(CHIP_LOCAL_NEEDLE)) {
    js = js.replace(CHIP_LOCAL_NEEDLE, CHIP_LOCAL_PATCH);
  } else if (!js.includes('const tsChipLabel=raw=>')) {
    throw new Error('ui #737 area chip tsChipLabel local patch did not apply');
  }
  if (js.includes(SN_RAW_NEEDLE)) {
    js = js.replace(SN_RAW_NEEDLE, SN_RAW_PATCH);
  } else if (!js.includes(SN_PATCH_MARKER)) {
    throw new Error('ui #737 area chip Sn() normalizer patch did not apply');
  }
  if (js.includes(CHIP_DEDUPE_NEEDLE)) {
    js = js.replaceAll(CHIP_DEDUPE_NEEDLE, CHIP_DEDUPE_PATCH);
  } else if (!js.includes('const nk=n.toLowerCase();if(!seen.has(nk))')) {
    throw new Error('ui #737 area chip case-insensitive dedupe patch did not apply');
  }
  return js;
}
