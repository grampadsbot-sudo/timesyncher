function text(value) {
  return String(value || '').trim();
}

export function googleFaviconV2Url(pageUrl, size = 64) {
  const page = text(pageUrl);
  if (!page) return '';
  try {
    const u = new URL(page);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(u.origin)}&size=${size}`;
  } catch {
    return '';
  }
}

export function duckDuckGoIp3LogoUrl(pageUrl) {
  const page = text(pageUrl);
  if (!page) return '';
  try {
    const host = new URL(page).hostname.replace(/^www\./i, '');
    if (!host) return '';
    return `https://icons.duckduckgo.com/ip3/${host}.ico`;
  } catch {
    return '';
  }
}

const EXPLICIT_LOGO_REPAIRS = new Map([
  ['https://statuecitycruises.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/statuecitycruises.com.ico'],
  ['https://www.macys.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/macys.com.ico'],
  ['https://www.wholefoodsmarket.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/wholefoodsmarket.com.ico'],
  ['https://www.hyatt.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/hyatt.com.ico'],
  ['https://www.tiffany.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/tiffany.com.ico'],
  ['https://www.delta.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/delta.com.ico'],
  ['https://www.united.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/united.com.ico'],
  ['https://www.ameliebistro.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/ameliewinebar.com.ico'],
  ['https://www.latraviatapizzeria.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/latraviatapizzany.com.ico'],
  ['https://www.cilantrorestaurant.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/cilantrorestaurant.com.ico'],
  ['https://www.hertz.com/favicon.ico', 'https://icons.duckduckgo.com/ip3/hertz.com.ico'],
]);

export function repairExplicitLogoUrl(logoUrl, pageUrl = '') {
  const src = text(logoUrl);
  if (!src) return '';
  const direct = EXPLICIT_LOGO_REPAIRS.get(src);
  if (direct) return direct;
  return src;
}

export function logoFallbackChain(logoUrl, pageUrl = '') {
  const primary = repairExplicitLogoUrl(logoUrl, pageUrl);
  const chain = [];
  if (primary) chain.push(primary);
  const duck = duckDuckGoIp3LogoUrl(pageUrl || primary);
  if (duck && !chain.includes(duck)) chain.push(duck);
  const g = googleFaviconV2Url(pageUrl || primary);
  if (g && !chain.includes(g)) chain.push(g);
  return chain;
}

export function categoryEmojiGlyph(raw, fallback = '📍') {
  const ic = text(raw);
  if (!ic || ic === '?') return fallback;
  return ic;
}

export function logoImgOnErrorInline() {
  return [
    'var img=this,chip=img.closest(\'[data-ts-logo-chip]\');',
    'if(!chip||chip.dataset.tsLogoFailed===\'1\')return;',
    'var stage=img.dataset.tsLogoFallback||\'0\';',
    'if(stage===\'0\'){img.dataset.tsLogoFallback=\'1\';try{var h=new URL(img.src).hostname.replace(/^www\\./i,\'\');img.src=\'https://icons.duckduckgo.com/ip3/\'+h+\'.ico\';return}catch(e){}}',
    'if(stage===\'1\'){img.dataset.tsLogoFallback=\'2\';try{var o=new URL(img.src).origin;img.src=\'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=\'+encodeURIComponent(o)+\'&size=64\';return}catch(e){}}',
    'chip.dataset.tsLogoFailed=\'1\';',
    'img.style.display=\'none\';',
    'var fb=chip.querySelector(\'.tsv-logo-fallback\');',
    'if(fb&&typeof tsCenterThingLogoFallbackEl===\'function\'){tsCenterThingLogoFallbackEl(fb);return;}',
    'var emoji=chip.getAttribute(\'data-ts-fallback-emoji\')||\'\\uD83D\\uDCCD\';',
    'if(emoji===\'?\')emoji=\'\\uD83D\\uDCCD\';',
    'chip.innerHTML=\'<span class="thing-emoji" style="width:22px;height:22px;font-size:13px;display:inline-grid;place-items:center">\'+emoji+\'</span>\';',
  ].join('');
}

export function logoImgOnLoadInline() {
  const fail = logoImgOnErrorInline();
  return [
    'var img=this,chip=img.closest(\'[data-ts-logo-chip]\');',
    'if(!chip||chip.dataset.tsLogoFailed===\'1\')return;',
    'var box=img.getBoundingClientRect();',
    'if(box.width<4||box.height<4||img.naturalWidth<16||img.naturalHeight<16){' + fail + 'return;}',
  ].join('');
}
