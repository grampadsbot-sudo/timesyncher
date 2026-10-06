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
