const BUDGET_SR_NEEDLE = 'sr=(di,Xi)=>{const go=le.__budgetTargets||{},fr=Pn(di,Xi);return Object.prototype.hasOwnProperty.call(go,fr)?String(go[fr]??""):String(Zn(di,Xi)||"")}';
const BUDGET_SR_PATCH = 'sr=(di,Xi)=>{const go=le.__budgetTargets||{},fr=Pn(di,Xi);return Object.prototype.hasOwnProperty.call(go,fr)?String(go[fr]??""):""}';
const BUDGET_XR_NEEDLE = 'Xr=(di,Xi)=>{const go=sr(di,Xi);return go===""||go===void 0||go===null?0:Number(go)||0}';
const BUDGET_XR_PATCH = 'Xr=(di,Xi)=>{const go=le.__budgetTargets||{},fr=Pn(di,Xi);if(!Object.prototype.hasOwnProperty.call(go,fr))return null;const Ul=String(go[fr]??"");return Ul===""?0:Number(Ul)||0}';
const BUDGET_EO_NEEDLE = 'Eo=nr.reduce((di,Xi)=>di+Xr(Xi),0)';
const BUDGET_EO_PATCH = 'Eo=(()=>{let di=0,au=!1;for(const Xi of nr){const go=Xr(Xi);if(go==null)continue;au=!0;di+=go}return au?di:null})()';
const BUDGET_JS_SPAN_NEEDLE = 'children:[Re(Xi)," / ",fr?gr(di,fr,Ul):Re(go)]})';
const BUDGET_JS_SPAN_PATCH = 'children:[Re(Xi),...(fr?Object.prototype.hasOwnProperty.call(le.__budgetTargets||{},Pn(fr,Ul))?[" / ",gr(di,fr,Ul)]:[]:go!=null?[" / ",Re(go)]:[])]})';
const BUDGET_IS_NEEDLE = 'children:Xi?`${fr?"Under":"Over"} by ${Re(Math.abs(go))}`:`${Re(di)} timeline`})}';
const BUDGET_IS_PATCH = 'children:Xi==null?`${Re(di)} timeline`:Xi?`${fr?"Under":"Over"} by ${Re(Math.abs(go))}`:`${Re(di)} timeline`})}';
const BUDGET_TARGET_PLACEHOLDER_NEEDLE = 'onChange:fr=>zr(Xi,go,fr.target.value),placeholder:"0",inputMode:"decimal"';
const BUDGET_TARGET_PLACEHOLDER_PATCH = 'onChange:fr=>zr(Xi,go,fr.target.value),placeholder:"",inputMode:"decimal"';

const MO_BUDGET_NEEDLE = 'Mo=Array.from(new Map(Qa.flatMap(di=>Ci(di)).filter(di=>(di==null?void 0:di.item)&&!["travel","travel-to-thing","transport","hotel-wake","hotel-sleep","hotel-checkout"].includes(di.type)).map(di=>{const Xi=di.item;return[Qt(Xi),{item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))}]})).values())';
const MO_BUDGET_PATCH = 'Mo=Array.from(new Map([].concat(rs,Po,bc,Oc,Fs,Cc).filter(Boolean).map(Xi=>[Qt(Xi),{item:Xi,bucket:ua(Xi),amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))}])).values())';

const BUDGET_ROW_NEEDLE = 'zl=({r:di})=>n.jsxs("div",{style:{display:"flex",justifyContent:"space-between",gap:10,padding:"4px 0 4px 12px",fontSize:11,color:"#6b7280"},children:';
const BUDGET_ROW_PATCH = 'zl=({r:di})=>n.jsxs("div",{"data-ts-budget-row":"1","data-ts-budget-place-id":String((di==null?void 0:(di.item.id??di.item.place_id))??""),style:{display:"flex",justifyContent:"space-between",gap:10,padding:"4px 0 4px 12px",fontSize:11,color:"#6b7280"},children:';

/** Live Budget Mo: union list-tab catalog rows (Gate B parity), not Ci(day) only. */
export function patchBudgetListTabCatalogRows(source = '') {
  let js = String(source || '');
  if (js.includes(MO_BUDGET_NEEDLE)) {
    js = js.replace(MO_BUDGET_NEEDLE, MO_BUDGET_PATCH);
  }
  if (js.includes(BUDGET_ROW_NEEDLE)) {
    js = js.replace(BUDGET_ROW_NEEDLE, BUDGET_ROW_PATCH);
  }
  return js;
}

export function assertBudgetListTabCatalogPatch(js = '') {
  if (!js.includes(MO_BUDGET_PATCH) || js.includes('(Gt||[]).filter(Xi=>Xi&&Ds(Xi)&&!Mi(Xi))')) {
    throw new Error('Style two live budget must list every tab item, including cars and off-timeline rows.');
  }
  if (!js.includes(BUDGET_ROW_NEEDLE) && !js.includes('data-ts-budget-row":"1"')) {
    return;
  }
  if (!js.includes('data-ts-budget-row":"1"') || (js.includes(BUDGET_ROW_NEEDLE) && !js.includes(BUDGET_ROW_PATCH))) {
    throw new Error('Style two live budget rows must expose data-ts-budget-row hooks for Gate B.');
  }
}

/** Budget tab: only show/sync targets saved on thingOverrides.__budgetTargets (no expense-derived defaults). */
export function patchBudgetSavedTargetsOnly(source = '', options = {}) {
  const served = options.served === true;
  let js = String(source || '');
  if (js.includes(BUDGET_SR_NEEDLE)) js = js.replace(BUDGET_SR_NEEDLE, BUDGET_SR_PATCH);
  else if (served && js.includes('String(Zn(di,Xi)||"")')) {
    throw new Error('budget saved-target-only sr() patch did not apply');
  }
  if (js.includes(BUDGET_XR_NEEDLE)) js = js.replace(BUDGET_XR_NEEDLE, BUDGET_XR_PATCH);
  else if (served && !js.includes('if(!Object.prototype.hasOwnProperty.call(go,fr))return null')) {
    throw new Error('budget nullable Xr() patch did not apply');
  }
  if (js.includes(BUDGET_EO_NEEDLE)) js = js.replace(BUDGET_EO_NEEDLE, BUDGET_EO_PATCH);
  if (js.includes(BUDGET_JS_SPAN_NEEDLE)) js = js.replace(BUDGET_JS_SPAN_NEEDLE, BUDGET_JS_SPAN_PATCH);
  if (js.includes(BUDGET_IS_NEEDLE)) js = js.replace(BUDGET_IS_NEEDLE, BUDGET_IS_PATCH);
  if (js.includes(BUDGET_TARGET_PLACEHOLDER_NEEDLE)) {
    js = js.replace(BUDGET_TARGET_PLACEHOLDER_NEEDLE, BUDGET_TARGET_PLACEHOLDER_PATCH);
  }
  return js;
}
