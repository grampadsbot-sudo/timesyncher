const FLIGHT_QO_GRID_NEEDLE = 'Qo=({item:G})=>n.jsx("span",{style:{display:"grid",gridTemplateColumns:"minmax(54px, 1fr) 44px 54px 54px",gap:8,width:"100%",alignItems:"center"},children:eu(G).map((Re,zt)=>n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:Re},zt))})';
const FLIGHT_QO_GRID_PATCH = 'Qo=({item:G})=>{const parts=eu(G);return n.jsxs("span",{style:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto auto auto",gap:8,width:"100%",alignItems:"center",minWidth:0},children:[n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:bn(G)?Bs(mr(G)):(parts[0]||"")}),n.jsx("span",{style:{whiteSpace:"nowrap",flexShrink:0,color:"#0f766e",fontWeight:900},children:parts[1]||""}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:parts[2]||""}),n.jsx("span",{style:{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",minWidth:0},children:parts[3]||""})]})}';
const MR_FLIGHT_TITLE_NEEDLE = 'return bn(G)?String(Re).replace(/^\\s*Flight option:\\s*/i,""):Re';
const MR_FLIGHT_TITLE_PATCH = 'return bn(G)?String(Re).replace(/^\\s*Flight option:\\s*/i,""):String(Re||"").replace(/\\u2019/g,"\'")';
const BUDGET_ROW_PRICE_NEEDLE = 'children:di.hasPrice?Re(di.amount):"Add price"';
const BUDGET_ROW_PRICE_PATCH = 'children:(di.hasPrice||/\\$?\\d/.test(String(bi(di.item)||"")))?(di.hasPrice?Re(di.amount):ie(di.item)):"Add price"';

export function patchGatebListBudgetRows(source = '', options = {}) {
  const served = options.served === true;
  let js = String(source || '');
  if (js.includes(FLIGHT_QO_GRID_NEEDLE)) js = js.replace(FLIGHT_QO_GRID_NEEDLE, FLIGHT_QO_GRID_PATCH);
  else if (served && !js.includes('Qo=({item:G})=>{const parts=eu(G)')) {
    throw new Error('flight Qo price column patch did not apply');
  }
  if (js.includes(MR_FLIGHT_TITLE_NEEDLE)) js = js.replace(MR_FLIGHT_TITLE_NEEDLE, MR_FLIGHT_TITLE_PATCH);
  else if (served && js.includes('Flight option:\\s*/i,""):Re')) {
    throw new Error('shared trip mr() title patch did not apply');
  }
  if (js.includes(BUDGET_ROW_PRICE_NEEDLE)) js = js.replace(BUDGET_ROW_PRICE_NEEDLE, BUDGET_ROW_PRICE_PATCH);
  else if (served && js.includes(BUDGET_ROW_PRICE_NEEDLE)) {
    throw new Error('budget row fill price patch did not apply');
  }
  return js;
}

export { BUDGET_ROW_PRICE_NEEDLE };
