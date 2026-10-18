const text = (value) => String(value ?? '').trim();

const suffixes = ['com', 'org', 'net', 'edu', 'gov', 'test', 'example', 'co.uk', 'org.uk', 'com.au', 'github.io'];
function safeUrl(value) {
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u : null;
  } catch { return null; }
}
function pathname(value) {
  try { return decodeURIComponent(safeUrl(value)?.pathname || ''); } catch { return ''; }
}
function registrable(value) {
  const host = safeUrl(value)?.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return '';
  const suffix = suffixes.filter((s) => host.endsWith(`.${s}`)).sort((a, b) => b.length - a.length)[0];
  if (!suffix) return '';
  return host.split('.').slice(-(suffix.split('.').length + 1)).join('.');
}
function guesser(value) {
  const u = safeUrl(value);
  if (!u) return false;
  const host = u.hostname;
  const onHost = (root) => host === root || host.endsWith(`.${root}`);
  return (onHost('google.com') && /^\/s2\/favicons(?:\/|$)/i.test(u.pathname))
    || (onHost('gstatic.com') && (/^\/faviconV2(?:\/|$)/i.test(u.pathname) || /^t[^.]*\.gstatic\.com$/i.test(host)))
    || ['duckduckgo.com', 'clearbit.com', 'icon.horse', 'faviconkit.com', 'favicongrabber.com', 'favicon.io'].some((h) => onHost(h));
}
function logoHasDeclaringDocument(record, logo, website) {
  const provenance = record.logoProvenance;
  if (!provenance || text(provenance.iconUrl) !== logo) return false;
  const source = safeUrl(provenance.pageUrl);
  if (!source || source.href === safeUrl(logo)?.href) return false;
  if (/\.(?:ico|png|jpe?g|gif|svg|webp)$/i.test(source.pathname) || guesser(source.href)) return false;
  if (!registrable(website) || registrable(source.href) !== registrable(website)) return false;
  if (provenance.verified === false) return false;
  return true;
}

export function effectiveCcabDeclaredLogoUrl(record = {}) {
  const website = text(record.website);
  const logo = text(record.logoUrl);
  if (!logo || guesser(logo)) return '';
  if (/\/favicon\.ico$/i.test(pathname(logo)) && !logoHasDeclaringDocument(record, logo, website)) return '';
  return logo;
}
