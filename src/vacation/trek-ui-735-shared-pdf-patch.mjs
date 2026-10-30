const TU_NEEDLE =
  'Tu=G=>{window.open(`/api/pdf/shared/${encodeURIComponent(r)}/daily/${G.day_number}.pdf`,"_blank"),Jt(!1)}';
const TU_PATCH =
  'Tu=G=>{const tsTok=String(r||e||"").trim();if(!tsTok||!G)return;window.open(`/api/pdf/shared/${encodeURIComponent(tsTok)}/daily/${G.day_number}.pdf`,"_blank"),Jt(!1)}';

const CU_NEEDLE =
  'Cu=G=>{const Re=G==="keepsake"||G==="keepsake-style-2"?Ha():"";window.open(`/api/pdf/shared/${encodeURIComponent(r)}/report/${encodeURIComponent(G)}.pdf${Re}`,"_blank"),ht(!1)}';
const CU_PATCH =
  'Cu=G=>{const Re=G==="keepsake"||G==="keepsake-style-2"?Ha():"";const tsTok=String(r||e||"").trim();if(!tsTok||!G)return;const url=`/api/pdf/shared/${encodeURIComponent(tsTok)}/report/${encodeURIComponent(G)}.pdf${Re}`;const w=window.open(url,"_blank","noopener,noreferrer");(!w||w.closed)&&window.location.assign(url);ht(!1)}';

export function patchUi735SharedPdf(source = '') {
  let js = String(source || '');
  if (js.includes(TU_NEEDLE)) {
    js = js.replace(TU_NEEDLE, TU_PATCH);
  } else if (!js.includes('const tsTok=String(r||e||"").trim();if(!tsTok||!G)return;window.open(`/api/pdf/shared/${encodeURIComponent(tsTok)}/daily/')) {
    throw new Error('ui #735 shared daily PDF Tu() patch did not apply');
  }
  if (js.includes(CU_NEEDLE)) {
    js = js.replace(CU_NEEDLE, CU_PATCH);
  } else if (!js.includes('(!w||w.closed)&&window.location.assign(url);ht(!1)}')) {
    throw new Error('ui #735 shared report PDF Cu() patch did not apply');
  }
  return js;
}
