export const LIST_LOGO_NEEDLE =
  '_l=G=>{if(qr(G))return pDe;const Re=ha(G);return Re.logoUrl||Re.iconUrl||G.logoUrl||oi(cc(G))}';
export const LIST_LOGO_QR_GUARD_PATCH =
  '_l=G=>{const Re=ha(G),raw=String(Re.logoUrl||Re.iconUrl||G.logoUrl||"").trim();if(raw&&!/^data:image\\/svg\\+xml/i.test(raw)&&!(/\\/ts-thing-media\\//i.test(raw)&&!/\\/ts-thing-logos\\//i.test(raw)))return raw;if(qr(G))return pDe;return Re.logoUrl||Re.iconUrl||G.logoUrl||oi(cc(G))}';

export function patchListLogoQrGuard(source = '') {
  let js = String(source || '');
  if (js.includes(LIST_LOGO_QR_GUARD_PATCH)) return js;
  if (!js.includes(LIST_LOGO_NEEDLE)) {
    throw new Error('trek bundle missing TREK _l() logo chain for qr/pDe guard patch');
  }
  return js.replace(LIST_LOGO_NEEDLE, LIST_LOGO_QR_GUARD_PATCH);
}
