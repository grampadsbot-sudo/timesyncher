export const FLIGHT_CARD_TITLE_FN =
  'function tsFlightCardTitle(value,hints){hints=hints||{};var t=function(v){return String(v==null?"":v).replace(/\\s+/g," ").trim()};' +
  'var strip=function(v){var r=t(String(v).replace(/^\\s*Flight option:\\s*/i,""));r=r.replace(/\\b\\d{4}-\\d{2}-\\d{2}\\b/g," ");' +
  'r=r.replace(/\\b\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s*[-\\u2013\\u2014]\\s*\\d{1,2}:\\d{2}(?::\\d{2})?)?(?:\\+\\d+)?\\b/gi," ");' +
  'r=r.replace(/\\b\\d{1,2}:\\d{2}(?::\\d{2})?\\b/g," ");r=r.replace(/\\s*\\+\\d+\\b/g," ");return t(r)};' +
  'var raw=t(value);if(!raw)return"";var cleaned=strip(raw);' +
  'var m=cleaned.match(/\\b([A-Z]{3})\\s*(?:[-\\u2013\\u2014\\u2192]|(?:\\s+to\\s+))\\s*([A-Z]{3})\\b/i)||cleaned.match(/\\b([A-Z]{3})-([A-Z]{3})\\b/);' +
  'var route=m?{dep:m[1].toUpperCase(),arr:m[2].toUpperCase(),index:m.index||0}:null;' +
  'if(!route){var hr=t(hints.route).match(/\\b([A-Z]{3})\\s*[-\\u2013\\u2014]\\s*([A-Z]{3})\\b/i)||String(hints.blob==null?"":hints.blob).match(/\\bRoute:\\s*([A-Z]{3})\\s*[-\\u2013\\u2014]\\s*([A-Z]{3})\\b/i);' +
  'if(hr)route={dep:hr[1].toUpperCase(),arr:hr[2].toUpperCase(),index:0}}' +
  'if(!route)return cleaned;var airline=route.index>0?t(cleaned.slice(0,route.index)):"";if(!airline&&hints.airline)airline=t(hints.airline);' +
  'if(!airline){var tk=cleaned.split(/\\s+/).filter(Boolean);var di=tk.findIndex(function(x){return x.toUpperCase().indexOf(route.dep)===0});if(di>0)airline=tk.slice(0,di).join(" ")}' +
  'if(!airline)return cleaned;var open=(airline.match(/\\(/g)||[]).length-(airline.match(/\\)/g)||[]).length;' +
  'return airline+" "+route.dep+" \\u2192 "+route.arr+(open>0?")".repeat(open):"")}';

const TITLE_NEEDLE =
  'const Re=String((tsPl&&(tsPl.name||tsPl.title))||tsOv.name||G.name||"").trim();return Re},Fl=';
const TITLE_PATCH =
  'const Re=String((tsPl&&(tsPl.name||tsPl.title))||tsOv.name||G.name||"").trim();return bn(G)?tsFlightCardTitle(Re,{airline:tsOv.airline||G.airline,route:tsOv.route||G.route,blob:[tsOv.summary,tsOv.description,G.description].filter(Boolean).join("; ")}):Re},Fl=';

export function patchVk994FlightTitles(source = '') {
  let js = String(source || '');
  if (!js.includes('function tsFlightCardTitle(')) js = `${FLIGHT_CARD_TITLE_FN}${js}`;
  if (!js.includes(TITLE_PATCH)) {
    if (!js.includes(TITLE_NEEDLE)) throw new Error('vk994 flight title anchor missing');
    js = js.replace(TITLE_NEEDLE, TITLE_PATCH);
  }
  return js;
}
