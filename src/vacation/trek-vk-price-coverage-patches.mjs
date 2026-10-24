const HOTELS_KN_CATALOG_NEEDLE = 'kn=ze.length?Po.filter(G=>ze.includes(En(G))):Po';
const HOTELS_KN_CATALOG_PATCH =
  'kn=(()=>{const rows=ze.length?Po.filter(G=>ze.includes(En(G))):Po;const tsNm=G=>String(mr(G)||G.name||"").replace(/[\\u2019\']/g,"\'").trim().toLowerCase(),tsHasPrice=G=>/\\$?\\d/.test(String(bi(G)||"")),tsDesc=G=>String(Co(G)||rr(G)||Fl(G)||"").trim(),tsScore=G=>{let s=0;if(Ds(G))s+=1e4;if(String(_l(G)||"").trim())s+=1e3;if(tsHasPrice(G))s+=100;s+=Math.min(tsDesc(G).length,24);return s;},tsFold=(w,g)=>{let o=w;const d=tsDesc(g);if(d&&!tsDesc(o))o={...o,summary:d,description:d};if(tsHasPrice(g)&&!tsHasPrice(o)){const p=bi(g);o={...o,price:p,total_price:p};}const lg=String(_l(g)||ha(g).logoUrl||g.logoUrl||"").trim();if(lg&&!String(_l(o)||ha(o).logoUrl||o.logoUrl||"").trim())o={...o,logoUrl:lg};return o;},m=new Map();for(const G of rows){const k=tsNm(G);if(!k)continue;if(!m.has(k))m.set(k,[G]);else m.get(k).push(G);}return Array.from(m.values(),list=>list.slice(1).reduce((w,g)=>{const top=tsScore(g)>tsScore(w)?g:w,other=top===g?w:g;return tsFold(top,other);},list[0]));})()';

export function applyHotelsTabCatalogDedupePatch(js = '', options = {}) {
  const served = options.served === true;
  let out = String(js || '');
  if (out.includes(HOTELS_KN_CATALOG_NEEDLE)) {
    out = out.replace(HOTELS_KN_CATALOG_NEEDLE, HOTELS_KN_CATALOG_PATCH);
  } else if (served && !out.includes('if(Ds(G))s+=1e4;if(String(_l(G)||"").trim())s+=1e3')) {
    throw new Error('served shared Hotels catalog missing kn= Po filter anchor');
  }
  return out;
}
