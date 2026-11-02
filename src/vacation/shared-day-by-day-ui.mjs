const DN_GATE_RE = /dn=typeof window<"u"&&(?:\()?\/\(\^\|\\\.\)timesyncher\\\.com\$\/i\.test\(window\.location\.hostname\)(?:\|\|\/\(\^127\\\.0\\\.0\\\.1\$\|\^localhost\$\)\/i\.test\(window\.location\.hostname\))?(?:\))?\|\|\/timesyncher\/i\.test\(`\$\{la\.title\|\|""\} \$\{la\.description\|\|""\}`\)(?:\|\|\/craig \\\/ kim nyc\/i\.test\(`\$\{la\.title\|\|""\}`\))?/g;

const TREK_TAB_FALLBACK = ':[{id:"plan",label:x("shared.tabPlan"),Icon:Xu},...Tn!=null&&Tn.share_bookings?[{id:"bookings",label:x("shared.tabBookings"),Icon:nc}]:[],...Tn!=null&&Tn.share_packing?[{id:"packing",label:x("shared.tabPacking"),Icon:Xm}]:[],...Tn!=null&&Tn.share_budget?[{id:"budget",label:x("shared.tabBudget"),Icon:rm}]:[],...Tn!=null&&Tn.share_collab?[{id:"collab",label:x("shared.tabChat"),Icon:Jm}]:[]]';

const DAY_BY_DAY_TAB_OPEN = '(dn?[{id:"plan",label:"Day-by-Day"';
const DAY_BY_DAY_TAB_OPEN_PATCH = '([{id:"plan",label:"Day-by-Day"';

const TREK_MADE_WITH_FOOTER = ',!dn&&n.jsxs("div",{style:{marginTop:8,fontSize:10,color:"#d1d5db"},children:["Made with ",n.jsx("span",{style:{color:"#ef4444"},children:"♥"})," by Maurice · ",n.jsx("a",{href:"https://github.com/mauriceboe/TREK",style:{color:"#9ca3af",textDecoration:"none"},children:"GitHub"})]})';

const TREK_BRAND_TERNARY = 'dn?n.jsxs("div",{style:{display:"inline-flex"';

const TREK_ONLY_SCREENS = ['q==="bookings"&&', 'q==="packing"&&', 'q==="collab"&&'];

function endOfCall(text, callStart) {
  const open = text.indexOf('(', callStart);
  if (open < 0) return -1;
  let depth = 0;
  let quote = '';
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function deleteSiblingExpression(source, key) {
  const at = source.indexOf(key);
  if (at < 0) return source;
  let depth = 0;
  let quote = '';
  let started = false;
  let end = -1;
  for (let i = at; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      started = true;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
    }
    if (started && depth === 0 && source[i + 1] === ',') {
      end = i + 1;
      break;
    }
  }
  if (end < 0 || source[at - 1] !== ',') {
    throw new Error(`could not remove TREK shared screen ${key}`);
  }
  return source.slice(0, at - 1) + source.slice(end);
}

function dropTrekBrandFallback(source) {
  let js = source;
  let guard = 0;
  while (js.includes(TREK_BRAND_TERNARY)) {
    guard += 1;
    if (guard > 4) throw new Error('TREK brand fallback unwrap did not settle');
    const at = js.indexOf(TREK_BRAND_TERNARY);
    const trueEnd = endOfCall(js, at + 3);
    if (trueEnd < 0 || js[trueEnd] !== ':') throw new Error('TREK brand fallback true branch did not close');
    const falseEnd = endOfCall(js, trueEnd + 1);
    if (falseEnd < 0) throw new Error('TREK brand fallback false branch did not close');
    js = js.slice(0, at) + js.slice(at + 3, trueEnd) + js.slice(falseEnd);
  }
  return js;
}

export function forceSharedDayByDayUi(source = '') {
  let js = String(source || '').replace(DN_GATE_RE, 'dn=!0');
  if (js.includes(TREK_TAB_FALLBACK)) js = js.replace(TREK_TAB_FALLBACK, '');
  if (js.includes(DAY_BY_DAY_TAB_OPEN)) js = js.replace(DAY_BY_DAY_TAB_OPEN, DAY_BY_DAY_TAB_OPEN_PATCH);
  if (js.includes(TREK_MADE_WITH_FOOTER)) js = js.replace(TREK_MADE_WITH_FOOTER, '');
  js = dropTrekBrandFallback(js);
  for (const key of TREK_ONLY_SCREENS) js = deleteSiblingExpression(js, key);
  if (!js.includes('label:"Day-by-Day"')) return js;
  if (!js.includes('dn=!0')) throw new Error('shared trip bundle still gates Day-by-Day on host or trip text');
  if (js.includes('timesyncher\\.com$/i.test(window.location.hostname)')) {
    throw new Error('shared trip bundle still tests timesyncher.com before showing Day-by-Day');
  }
  if (js.includes('/timesyncher/i.test(')) throw new Error('shared trip bundle still tests trip text before showing Day-by-Day');
  if (js.includes('label:x("shared.tabPlan")') || js.includes('id:"bookings"') || js.includes('label:x("shared.tabPacking")') || js.includes('label:x("shared.tabChat")')) {
    throw new Error('shared trip bundle still contains the Plan/Bookings/Packing TREK tab fallback');
  }
  for (const key of TREK_ONLY_SCREENS) {
    if (js.includes(key)) throw new Error(`shared trip bundle still renders ${key}`);
  }
  if (js.includes(TREK_MADE_WITH_FOOTER) || js.includes(TREK_BRAND_TERNARY) || js.includes(DAY_BY_DAY_TAB_OPEN)) {
    throw new Error('shared trip bundle still contains a TREK shared-view fallback');
  }
  return js;
}
