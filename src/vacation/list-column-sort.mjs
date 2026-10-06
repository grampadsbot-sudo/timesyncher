/** Sort control for Flights, Hotels, and Cars. Flip LIST_SORT_PRESENTATION to "pills" to restore buttons. */
export const LIST_SORT_PRESENTATION = 'columns';

export function nextColumnSort(current = {}, which = 'name') {
  const key = current.key || 'price';
  const dir = current.dir || 'asc';
  return { key: which, dir: key === which && dir === 'asc' ? 'desc' : 'asc' };
}

export function rowPriceAmount(text = '') {
  const match = String(text).match(/\$\s*([\d,]+(?:\.\d+)?)/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

export function compareColumnRows(a, b, which, dir) {
  const sign = dir === 'desc' ? -1 : 1;
  const nameA = String(a.name || '');
  const nameB = String(b.name || '');
  if (which === 'price') {
    const priceA = a.price == null ? null : Number(a.price);
    const priceB = b.price == null ? null : Number(b.price);
    if (priceA == null && priceB == null) return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    if (priceA == null) return -sign;
    if (priceB == null) return sign;
    if (priceA !== priceB) return sign * (priceA - priceB);
  }
  return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' }) * sign;
}

export function listColumnSortBundleExpr() {
  const mode = JSON.stringify(LIST_SORT_PRESENTATION);
  return 'function tsListColumnSort({listKey:G,sort:Re,onSort:zt,pillStyle:ua}){const key=(Re&&Re.key)||"price",dir=(Re&&Re.dir)||"asc",arrow=w=>key===w?(dir==="asc"?" ↑":" ↓"):"",apply=(w,nextDir)=>{const ul=document.querySelector(\'[data-shared-live-tab="\'+G+\'"]\');if(!ul)return;const amount=t=>{const m=String(t||"").match(/\\$\\s*([\\d,]+(?:\\.\\d+)?)/);return m?Number(m[1].replace(/,/g,"")):null};const label=li=>String((li.querySelector("strong")&&li.querySelector("strong").textContent)||"");const sign=nextDir==="desc"?-1:1;const rows=[...ul.children];rows.sort((a,b)=>{if(w==="price"){const pa=amount(a.textContent),pb=amount(b.textContent);if(pa==null&&pb==null)return label(a).localeCompare(label(b),undefined,{sensitivity:"base"});if(pa==null)return -sign;if(pb==null)return sign;if(pa!==pb)return sign*(pa-pb)}return label(a).localeCompare(label(b),undefined,{sensitivity:"base"})*sign});for(const li of rows)ul.appendChild(li)};const click=w=>{const nextDir=key===w&&dir==="asc"?"desc":"asc";zt(G,w);apply(w,nextDir);queueMicrotask(()=>apply(w,nextDir));requestAnimationFrame(()=>requestAnimationFrame(()=>apply(w,nextDir)))};if(' + mode + '==="pills")return n.jsxs("div",{style:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:2},children:[n.jsxs("button",{onClick:()=>click("name"),style:ua(key==="name"),children:["Name",arrow("name")]}),n.jsxs("button",{onClick:()=>click("price"),style:ua(key==="price"),children:["Price",arrow("price")]})]});const st={border:0,background:"transparent",padding:"2px 0",margin:0,fontSize:12,fontWeight:800,color:"#111827",cursor:"pointer",borderRadius:0,lineHeight:1.2};return n.jsxs("div",{"data-ts-list-sort-header":"1",style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",alignItems:"end",gap:8,marginBottom:4,minWidth:0,maxWidth:"100%"},children:[n.jsxs("button",{type:"button",onClick:()=>click("name"),style:{border:0,background:"transparent",padding:"2px 0",margin:0,fontSize:12,fontWeight:800,color:"#111827",cursor:"pointer",borderRadius:0,lineHeight:1.2,textAlign:"left"},children:["Name",arrow("name")]}),n.jsxs("button",{type:"button",onClick:()=>click("price"),style:{border:0,background:"transparent",padding:"2px 0",margin:0,fontSize:12,fontWeight:800,color:"#111827",cursor:"pointer",borderRadius:0,lineHeight:1.2,textAlign:"right"},children:["Price",arrow("price")]})]})}';
}
