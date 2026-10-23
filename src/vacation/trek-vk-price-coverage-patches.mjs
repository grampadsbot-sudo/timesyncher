const MO_BUDGET_ROW = '{item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:zt(Xi)>0||/\\$?\\d/.test(String(bi(Xi)||""))}';
const MO_BUDGET_PATCH_PREV = `Mo=Array.from(new Map([].concat(rs,Po,bc,Oc,Fs,Cc).filter(Boolean).map(Xi=>[Qt(Xi),${MO_BUDGET_ROW}])).values())`;
export const MO_BUDGET_PATCH = `Mo=Array.from((()=>{const raw=[].concat(rs,Po,bc,Oc,Fs,Cc).filter(Boolean);const priced=Xi=>zt(Xi)>0||/\\$?\\d/.test(String(bi(Xi)||""));const norm=Xi=>String(mr(Xi)||Xi.name||"").replace(/[\\u2019\']/g,"\'").trim().toLowerCase();const nmPriced=new Set(raw.filter(priced).map(norm).filter(Boolean));const rows=raw.filter(Xi=>priced(Xi)||!nmPriced.has(norm(Xi)));const m=new Map();for(const Xi of rows)m.set(Qt(Xi),${MO_BUDGET_ROW});return m;})().values())`;
const PE_EFFECT_PATCH_PREV = 'lf.getSharedTrip(r).then(G=>{const ov=(G!=null&&G.thingOverrides&&typeof G.thingOverrides=="object")?{...G.thingOverrides}:{};for(const p of (G!=null&&G.places)||[]){if(!p||p.id==null)continue;const k="place:"+p.id,cur=ov[k]&&typeof ov[k]==="object"?{...ov[k]}:{};const pr=p.price??p.total_price??cur.price;if(pr!=null&&pr!==""&&(cur.price==null||String(cur.price).trim()===""))cur.price=pr;ov[k]=cur;}G=G==null?G:{...G,thingOverrides:ov};A(G);pe((G!=null&&G.thingOverrides&&typeof G.thingOverrides=="object")?G.thingOverrides:{});me(!0);ge(!1)})';
export const PE_EFFECT_PATCH = 'lf.getSharedTrip(r).then(G=>{const ov=(G!=null&&G.thingOverrides&&typeof G.thingOverrides=="object")?{...G.thingOverrides}:{};const tsNm=n=>String(n||"").replace(/[\\u2019\']/g,"\'").trim().toLowerCase(),tsVal=v=>v!=null&&String(v).trim()!=="";for(const p of (G!=null&&G.places)||[]){if(!p||p.id==null)continue;const k="place:"+p.id,cur=ov[k]&&typeof ov[k]==="object"?{...ov[k]}:{};const pr=p.price??p.total_price??cur.price;if(pr!=null&&pr!==""&&(cur.price==null||String(cur.price).trim()===""))cur.price=pr;ov[k]=cur;}const tsBest=new Map();for(const p of (G!=null&&G.places)||[]){if(!p)continue;const k="place:"+p.id,cur=ov[k]&&typeof ov[k]==="object"?ov[k]:{};const pr=cur.price??p.price??p.total_price;if(tsVal(pr)){const nm=tsNm(p.name);if(nm&&!tsBest.has(nm))tsBest.set(nm,pr);}}for(const p of (G!=null&&G.places)||[]){if(!p||p.id==null)continue;const k="place:"+p.id,cur=ov[k]&&typeof ov[k]==="object"?{...ov[k]}:{};if(!tsVal(cur.price)&&tsBest.has(tsNm(p.name)))cur.price=tsBest.get(tsNm(p.name));ov[k]=cur;}G=G==null?G:{...G,thingOverrides:ov};A(G);pe((G!=null&&G.thingOverrides&&typeof G.thingOverrides=="object")?G.thingOverrides:{});me(!0);ge(!1)})';

export function applyPeEffectPriceHydratePatch(patched, needles) {
  let js = patched;
  if (js.includes(needles.peEffectNeedle)) js = js.replace(needles.peEffectNeedle, PE_EFFECT_PATCH);
  else if (js.includes(needles.peEffectSimple)) js = js.replace(needles.peEffectSimple, PE_EFFECT_PATCH);
  else if (js.includes(PE_EFFECT_PATCH_PREV)) js = js.replace(PE_EFFECT_PATCH_PREV, PE_EFFECT_PATCH);
  return js;
}

export function applyMoBudgetPriceCoveragePatch(patched, moBudgetNeedle) {
  let js = patched;
  if (js.includes(moBudgetNeedle)) js = js.replace(moBudgetNeedle, MO_BUDGET_PATCH);
  else if (js.includes(MO_BUDGET_PATCH_PREV)) js = js.replace(MO_BUDGET_PATCH_PREV, MO_BUDGET_PATCH);
  return js;
}

export function applyFlightEuGateBListTitlePatch(js = '') {
  if (js.includes('return[ua,(v=>{const fareLbl') && !js.includes('return[Re||ua,(v=>{const fareLbl')) {
    return js.replace('return[ua,(v=>{const fareLbl', 'return[Re||ua,(v=>{const fareLbl');
  }
  return js;
}
