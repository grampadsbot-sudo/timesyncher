export const LIST_SORT_PRESENTATION = 'columns';

export function nextColumnSort(current = {}, which = 'name') {
  const key = current.key || 'name';
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
  return 'tsListColumnSort=({listKey:G,sort:Re,onSort:zt})=>{const key=(Re&&Re.key)||"name",dir=(Re&&Re.dir)||"asc",arrow=w=>key===w?(dir==="asc"?" ↑":" ↓"):"",apply=(w,nextDir)=>{const ul=document.querySelector(\'[data-shared-live-tab="\'+G+\'"]\');if(!ul)return;const amount=t=>{const m=String(t||"").match(/\\$\\s*([\\d,]+(?:\\.\\d+)?)/);return m?Number(m[1].replace(/,/g,"")):null};const label=li=>String((li.querySelector("strong")&&li.querySelector("strong").textContent)||"");const sign=nextDir==="desc"?-1:1;const rows=[...ul.children];rows.sort((a,b)=>{if(w==="price"){const pa=amount(a.textContent),pb=amount(b.textContent);if(pa==null&&pb==null)return label(a).localeCompare(label(b),undefined,{sensitivity:"base"});if(pa==null)return -sign;if(pb==null)return sign;if(pa!==pb)return sign*(pa-pb)}return label(a).localeCompare(label(b),undefined,{sensitivity:"base"})*sign});for(const li of rows)ul.appendChild(li)};const click=w=>{const nextDir=key===w&&dir==="asc"?"desc":"asc";zt(G,w);apply(w,nextDir);queueMicrotask(()=>apply(w,nextDir));requestAnimationFrame(()=>requestAnimationFrame(()=>apply(w,nextDir)))};const st={border:0,background:"transparent",padding:"2px 0",margin:0,fontSize:12,fontWeight:800,color:"#111827",cursor:"pointer",borderRadius:0,lineHeight:1.2};return n.jsxs("div",{"data-ts-list-sort-header":"1",style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",alignItems:"end",gap:8,marginBottom:4,minWidth:0,maxWidth:"100%"},children:[n.jsxs("button",{type:"button",onClick:()=>click("name"),style:{...st,textAlign:"left"},children:["Name",arrow("name")]}),n.jsxs("button",{type:"button",onClick:()=>click("price"),style:{...st,textAlign:"right"},children:["Price",arrow("price")]})]})}' ;
}
