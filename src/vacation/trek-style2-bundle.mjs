const TRAVEL_BUNDLE = 'https://travel.timesyncher.com/assets/index-BKun7ofk.js';
const ZU_STYLE2 = 'G==="keepsake-style-2"?zu()';
const AE_STYLE2 = 'G==="keepsake-style-2"?Ae()';

export const STYLE2_USES_ZU = ZU_STYLE2;
export const STYLE2_USES_AE = AE_STYLE2;

/** Product Ae() honors Keepsakes Config. zu() is the stub that omitted ON sections. */
export function patchStyleTwoToConfigRenderer(source = '') {
  const js = String(source || '');
  if (!js.includes(ZU_STYLE2)) {
    throw new Error('Refusing to serve TREK bundle: Style two still not the zu() site we patch to Ae().');
  }
  return js.replace(ZU_STYLE2, AE_STYLE2);
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
