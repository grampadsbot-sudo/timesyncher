const BI_NEEDLE = 'bi=G=>ha(G).price??G.price??""';
const BI_PATCH = 'bi=G=>{const o=ha(G)||{},direct=o.price??G.price;if(direct!=null&&direct!=="")return direct;const sr=G.sourceRecord||{},blobs=[Fl(G),Co(G),o.longDetails,o.summary,G.description,G.notes,sr.description,sr.summary,sr.details,sr.price,sr.totalPrice].map(v=>String(v??"")).join(" ");const m=blobs.match(/\\$\\s*([0-9][0-9,]*(?:\\.\\d+)?)/);return m?"$"+m[1].replace(/,/g,""):""}';

export function patchThingPriceReader(source = '', options = {}) {
  const served = options.served === true;
  let js = String(source || '');
  if (js.includes(BI_NEEDLE)) js = js.replace(BI_NEEDLE, BI_PATCH);
  else if (served && js.includes('ha(G).price??G.price')) {
    throw new Error('served bundle thing price reader bi() patch did not apply');
  }
  return js;
}
