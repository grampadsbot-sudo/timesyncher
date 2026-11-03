import assert from 'node:assert/strict'; import fs from 'node:fs';
const js = fs.readFileSync('public/assets/index-BKun7ofk.js','utf8');
const i = js.indexOf('data-ts-map-marker-logo="1"'); assert.ok(i>0,'marker wrapper present');
const seg = js.slice(i, i+3000);
assert.ok(seg.includes('data-ts-map-logo-fb="1"') && seg.includes('onerror="') && seg.includes('onload="'), 'marker img has onerror+onload fallback');
assert.ok(seg.includes('icons.duckduckgo.com/ip3/') && seg.includes('google.com/s2/favicons') && seg.includes('data:image/svg+xml'), 'DDG->Google->emoji chain');
assert.ok(seg.includes('naturalWidth<16'), '<16px triggers fallback');
const m = seg.match(/onerror="([^"]*)"/); const code = m[1].replace(/&quot;/g,'"').replace(/&#128205;/g,'\u{1F4CD}');
for (const u of ['https://statuecitycruises.com/favicon.ico','https://www.macys.com/favicon.ico','https://www.wholefoodsmarket.com/favicon.ico','https://carbonenewyork.com/assets/favicons/carbone.png']) {
  const img = { src:u, dataset:{ logoSrc:u } }; const f = new Function(code);
  f.call(img); assert.match(img.src, /duckduckgo\.com\/ip3\/(statuecitycruises|macys|wholefoodsmarket|carbonenewyork)\.com\.ico/);
  f.call(img); assert.match(img.src, /google\.com\/s2\/favicons/);
  f.call(img); assert.match(img.src, /^data:image\/svg\+xml/); assert.equal(img.dataset.tsLogoFallbackEmoji,'1');
}
const t = js.indexOf('function tsTimelineLogoFallback('); assert.ok(t>0,'timeline logo fallback present');
const tl = new Function(`${js.slice(t, js.indexOf('function tsPaintTabEmoji(', t))};return tsTimelineLogoFallback;`)();
const brand = 'https://carbonenewyork.com/assets/favicons/carbone.png';
const attrs = { 'data-logo-src': brand }; const row = { src: brand, getAttribute:(k)=>attrs[k]??null, setAttribute:(k,v)=>{ attrs[k]=String(v); } };
tl(row,'🍝'); assert.equal(row.src, 'https://icons.duckduckgo.com/ip3/carbonenewyork.com.ico', 'blocked brand asset falls back to its domain favicon');
tl(row,'🍝'); assert.match(row.src, /google\.com\/s2\/favicons\?sz=64&domain=carbonenewyork\.com/);
tl(row,'🍝'); assert.match(row.src, /^data:image\/svg\+xml/); assert.doesNotMatch(decodeURIComponent(row.src), />\?</);
console.log('map marker logo fallback ok');
