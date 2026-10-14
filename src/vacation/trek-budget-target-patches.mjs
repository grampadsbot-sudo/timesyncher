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

/** Budget-tab IIFE only: `cn` is API budget[] state (same closure as Zn category sums). */
const BUDGET_TS_LINE_AMT_SNIPPET =
  'tsBudgetLineAmt=Xi=>{const pid=Qt(Xi);for(const row of cn||[]){if(row.place_id!=null&&Number(row.place_id)===Number(pid)){const n=Number(row.total_price);if(Number.isFinite(n))return n}}return null}';
const BUDGET_MO_INJECT_NEEDLE =
  'pe(Ul=>({...Ul,__budgetTargets:{...Ul.__budgetTargets||{},[Pn(di,Xi)]:fr}}))},Mo=Array.from';
const BUDGET_MO_INJECT_PATCH = `pe(Ul=>({...Ul,__budgetTargets:{...Ul.__budgetTargets||{},[Pn(di,Xi)]:fr}}))},${BUDGET_TS_LINE_AMT_SNIPPET},Mo=Array.from`;

const MO_BUDGET_LINE_NEEDLE =
  'amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))';
const MO_BUDGET_LINE_PATCH =
  'amount:(tsBudgetLineAmt(Xi)??0),hasPrice:(tsBudgetLineAmt(Xi)!=null&&tsBudgetLineAmt(Xi)>0)';

const IE_BUDGET_LINE_NEEDLE =
  'ie=G=>{var ua,Rn;const Re=bi(G);if(typeof Re=="number"&&Number.isFinite(Re))return`$${Math.round(Re).toLocaleString()}`;const zt=String(Re||"");return((Rn=(ua=zt.match(/\\$\\s?\\d[\\d,]*/))==null?void 0:ua[0])==null?void 0:Rn.replace(/\\s+/g,""))||(/quote\\s*tbd/i.test(zt)?"Quote TBD":"")}';
const IE_BUDGET_LINE_PATCH =
  'ie=G=>{var ua,Rn;const Re=bi(G);if(typeof Re=="number"&&Number.isFinite(Re))return `$${Math.round(Re).toLocaleString()}`;const zt=String(Re||"");return((Rn=(ua=zt.match(/\\$\\s?\\d[\\d,]*/))==null?void 0:ua[0])==null?void 0:Rn.replace(/\\s+/g,""))||(/quote\\s*tbd/i.test(zt)?"Quote TBD":"")}';

export const PO_HOTELS_LISTONLY_NEEDLE = 'Po=(Gt||[]).filter(Zi)';
export const PO_HOTELS_LISTONLY_PATCH = 'Po=(Gt||[]).filter(G=>Zi(G)&&!ha(G).listOnly)';
export const RS_FLIGHTS_CATALOG_NEEDLE = 'rs=to.length?to:(Ut||[]).filter(bn)';
export const RS_FLIGHTS_CATALOG_PATCH =
  'rs=[...new Map([].concat(to,(Ut||[]).filter(bn)).map(G=>[Qt(G),G])).values()]';
export const BC_CARS_TIMELINE_NEEDLE = 'bc=(Gt||[]).filter(G=>It(G)==="car")';
export const BC_CARS_TIMELINE_PATCH = 'bc=(Gt||[]).filter(G=>It(G)==="car"&&!!ha(G).timeline)';

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
  if (js.includes(BUDGET_MO_INJECT_NEEDLE) && !js.includes(BUDGET_TS_LINE_AMT_SNIPPET)) {
    js = js.replace(BUDGET_MO_INJECT_NEEDLE, BUDGET_MO_INJECT_PATCH);
  }
  if (served && js.includes(BUDGET_MO_INJECT_NEEDLE) && !js.includes(BUDGET_TS_LINE_AMT_SNIPPET)) {
    throw new Error('budget tsBudgetLineAmt inject before Mo did not apply');
  }
  if (js.includes('tsBudgetLineAmt=G=>') || js.includes(',ie=G=>{const bl=tsBudgetLineAmt')) {
    js = js.replace(/tsBudgetLineAmt=G=>\{[^}]+\}(?:\{[^}]+\})*,?/g, '');
    js = js.replace(
      /ie=G=>\{const bl=tsBudgetLineAmt\(G\);if\(bl==null\)return "";if\(typeof bl=="number"&&Number\.isFinite\(bl\)\)return `\$\$\{Math\.round\(bl\)\.toLocaleString\(\)\}`;return ""\}/,
      IE_BUDGET_LINE_PATCH,
    );
  }
  if (!js.includes('ie=G=>{var ua,Rn;const Re=bi(G)')) {
    js = js.replace(IE_BUDGET_LINE_NEEDLE, IE_BUDGET_LINE_PATCH);
  }
  if (js.includes(MO_BUDGET_LINE_NEEDLE)) {
    js = js.replace(MO_BUDGET_LINE_NEEDLE, MO_BUDGET_LINE_PATCH);
  } else if (js.includes(MO_BUDGET_LINE_PATCH.split(',')[0])) {
    js = js.replace(
      /amount:\(tsBudgetLineAmt\(Xi\)\?\?0\),hasPrice:\(tsBudgetLineAmt\(Xi\)!=null&&tsBudgetLineAmt\(Xi\)>0\)\|\|\\\/\\\$\\?\\d\/\.test\(String\(bi\(Xi\)\|\|""\)\)/,
      MO_BUDGET_LINE_PATCH,
    );
  } else if (served && js.includes('amount:zt(Xi),hasPrice:/\\$?\\d/.test(String(bi(Xi)||""))')) {
    throw new Error('budget Mo line amount patch did not apply');
  }
  return js;
}
