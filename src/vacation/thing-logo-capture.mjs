import { timelineIcon, timelineCategoryIcon } from './timeline-icons.mjs';

/** Exact Thing titles → bound brand marks. Specific names beat regex (Bellagio Fountains ≠ hotel). */
export const NAMED_THING_LOGOS = {
  Carbone: '/ts-thing-logos/carbone.svg',
  'Carbone at Aria': '/ts-thing-logos/carbone.svg',
  'Shake Shack': '/ts-thing-logos/shake-shack.svg',
  'Shake Shack near Cosmo/Aria': '/ts-thing-logos/shake-shack.svg',
  Eggslut: '/ts-thing-logos/eggslut.svg',
  'Lotus of Siam': '/ts-thing-logos/lotus-of-siam.svg',
  'Bellagio Conservatory': '/ts-thing-logos/bellagio-conservatory.svg',
  'Bellagio Conservatory — Anniversary Cocktails': '/ts-thing-logos/bellagio-conservatory.svg',
  'High Tea Conservatory Walk': '/ts-thing-logos/high-tea-conservatory.svg',
  Bellagio: '/ts-thing-logos/bellagio.svg',
  'Bellagio — Alex & Kim Anniversary Stay': '/ts-thing-logos/bellagio.svg',
  'Bellagio Fountains': '/ts-thing-logos/bellagio-fountains.svg',
  'Bellagio Shops': '/ts-thing-logos/bellagio-shops.svg',
  'Cosmopolitan shops': '/ts-thing-logos/cosmopolitan-shops.svg',
  Cosmopolitan: '/ts-thing-logos/cosmopolitan-shops.svg',
  'SFO to LAS Thu Oct 9': '/ts-thing-logos/flight.svg',
  'LAS to SFO Sun Oct 12': '/ts-thing-logos/flight.svg',
  'Mon Ami Gabi': '/ts-thing-logos/mon-ami-gabi.svg',
  'Bardot Brasserie': '/ts-thing-logos/bardot-brasserie.svg',
  'CATCH Las Vegas': '/ts-thing-logos/catch-las-vegas.svg',
  "Javier's at Aria": '/ts-thing-logos/javiers-at-aria.svg',
  'Estiatorio Milos': '/ts-thing-logos/estiatorio-milos.svg',
  'Best Friend by Roy Choi': '/ts-thing-logos/best-friend-roy-choi.svg',
  Holsteins: '/ts-thing-logos/holsteins.svg',
  "L'Atelier de Joël Robuchon": '/ts-thing-logos/latelier-robuchon.svg',
  Giada: '/ts-thing-logos/giada.svg',
  'Yellowtail Japanese Restaurant': '/ts-thing-logos/yellowtail.svg',
  'Mott 32': '/ts-thing-logos/mott-32.svg',
  'Jean Georges Steakhouse': '/ts-thing-logos/jean-georges.svg',
  'Lago by Julian Serrano': '/ts-thing-logos/lago.svg',
  'Sichuan House': '/ts-thing-logos/sichuan-house.svg',
  'Crystals at Aria': '/ts-thing-logos/crystals-at-aria.svg',
  'Grand Canal Shoppes': '/ts-thing-logos/grand-canal-shoppes.svg',
  'Forum Shops at Caesars': '/ts-thing-logos/forum-shops.svg',
  'Fashion Show Mall': '/ts-thing-logos/fashion-show-mall.svg',
  'Wynn Esplanade': '/ts-thing-logos/wynn-esplanade.svg',
  'Harmon Corner': '/ts-thing-logos/harmon-corner.svg',
  'Shoppes at Mandalay Place': '/ts-thing-logos/mandalay-place.svg',
  'Venetian Shoppes': '/ts-thing-logos/venetian-shoppes.svg',
  'Miracle Mile Shops': '/ts-thing-logos/miracle-mile-shops.svg',
  'High Roller': '/ts-thing-logos/high-roller.svg',
  'The Sphere': '/ts-thing-logos/the-sphere.svg',
  'Fremont Street Experience': '/ts-thing-logos/fremont-street.svg',
  'Neon Museum': '/ts-thing-logos/neon-museum.svg',
  'Atomic Museum': '/ts-thing-logos/atomic-museum.svg',
  'Hoover Dam': '/ts-thing-logos/hoover-dam.svg',
  'Red Rock Canyon': '/ts-thing-logos/red-rock-canyon.svg',
  'STRAT SkyPod': '/ts-thing-logos/strat-skypod.svg',
  'Welcome to Fabulous Las Vegas Sign': '/ts-thing-logos/vegas-sign.svg',
  'LINQ Promenade': '/ts-thing-logos/linq-promenade.svg',
  'O by Cirque du Soleil': '/ts-thing-logos/o-cirque.svg',
  Absinthe: '/ts-thing-logos/absinthe.svg',
  'Lake of Dreams': '/ts-thing-logos/lake-of-dreams.svg',
  'Las Vegas transport and car research queue': '/ts-thing-logos/car.svg',
};

/** Regex fallbacks. More-specific patterns first. Never map missing logos to airplane. */
export const BRAND_LOGOS = [
  [/high\s*tea/i, '/ts-thing-logos/high-tea-conservatory.svg'],
  [/bellagio\s*fountain/i, '/ts-thing-logos/bellagio-fountains.svg'],
  [/bellagio\s*shop/i, '/ts-thing-logos/bellagio-shops.svg'],
  [/conservatory/i, '/ts-thing-logos/bellagio-conservatory.svg'],
  [/carbone/i, '/ts-thing-logos/carbone.svg'],
  [/shake\s*shack/i, '/ts-thing-logos/shake-shack.svg'],
  [/eggslut/i, '/ts-thing-logos/eggslut.svg'],
  [/lotus of siam/i, '/ts-thing-logos/lotus-of-siam.svg'],
  [/mon ami gabi/i, '/ts-thing-logos/mon-ami-gabi.svg'],
  [/bardot/i, '/ts-thing-logos/bardot-brasserie.svg'],
  [/\bcatch\b/i, '/ts-thing-logos/catch-las-vegas.svg'],
  [/javier/i, '/ts-thing-logos/javiers-at-aria.svg'],
  [/milos/i, '/ts-thing-logos/estiatorio-milos.svg'],
  [/best friend|roy choi/i, '/ts-thing-logos/best-friend-roy-choi.svg'],
  [/holstein/i, '/ts-thing-logos/holsteins.svg'],
  [/robuchon|l['']atelier/i, '/ts-thing-logos/latelier-robuchon.svg'],
  [/giada/i, '/ts-thing-logos/giada.svg'],
  [/yellowtail/i, '/ts-thing-logos/yellowtail.svg'],
  [/mott\s*32/i, '/ts-thing-logos/mott-32.svg'],
  [/jean\s*georges/i, '/ts-thing-logos/jean-georges.svg'],
  [/\blago\b/i, '/ts-thing-logos/lago.svg'],
  [/sichuan/i, '/ts-thing-logos/sichuan-house.svg'],
  [/crystals/i, '/ts-thing-logos/crystals-at-aria.svg'],
  [/grand canal/i, '/ts-thing-logos/grand-canal-shoppes.svg'],
  [/forum shops/i, '/ts-thing-logos/forum-shops.svg'],
  [/fashion show/i, '/ts-thing-logos/fashion-show-mall.svg'],
  [/wynn/i, '/ts-thing-logos/wynn-esplanade.svg'],
  [/harmon corner/i, '/ts-thing-logos/harmon-corner.svg'],
  [/mandalay/i, '/ts-thing-logos/mandalay-place.svg'],
  [/venetian shop/i, '/ts-thing-logos/venetian-shoppes.svg'],
  [/miracle mile/i, '/ts-thing-logos/miracle-mile-shops.svg'],
  [/cosmopolitan|cosmo.*shop/i, '/ts-thing-logos/cosmopolitan-shops.svg'],
  [/high\s*roller/i, '/ts-thing-logos/high-roller.svg'],
  [/sphere/i, '/ts-thing-logos/the-sphere.svg'],
  [/fremont/i, '/ts-thing-logos/fremont-street.svg'],
  [/neon museum/i, '/ts-thing-logos/neon-museum.svg'],
  [/atomic museum/i, '/ts-thing-logos/atomic-museum.svg'],
  [/hoover/i, '/ts-thing-logos/hoover-dam.svg'],
  [/red rock/i, '/ts-thing-logos/red-rock-canyon.svg'],
  [/\bstrat\b|skypod/i, '/ts-thing-logos/strat-skypod.svg'],
  [/fabulous las vegas|welcome to/i, '/ts-thing-logos/vegas-sign.svg'],
  [/\blinq\b/i, '/ts-thing-logos/linq-promenade.svg'],
  [/\bo by cirque|cirque du soleil/i, '/ts-thing-logos/o-cirque.svg'],
  [/absinthe/i, '/ts-thing-logos/absinthe.svg'],
  [/lake of dreams/i, '/ts-thing-logos/lake-of-dreams.svg'],
  [/bellagio/i, '/ts-thing-logos/bellagio.svg'],
  [/\bsfo\b.*\blas\b|\blas\b.*\bsfo\b|boarding pass/i, '/ts-thing-logos/flight.svg'],
  [/transport and car|car research|rental car/i, '/ts-thing-logos/car.svg'],
];

const BOUND_MEDIA_RE = /\/api\/bind-thing-media\b|\/ts-thing-media\//i;
const PLACEHOLDER_LOGO_RE = /admit\s*one|pDe|family-event-placeholder|data:image\/svg\+xml/i;

export function isBoundStoryMediaUrl(value = '') {
  return BOUND_MEDIA_RE.test(String(value || ''));
}

export function isPlaceholderLogoUrl(value = '') {
  const src = String(value || '').trim();
  if (!src) return true;
  if (src.startsWith('/ts-thing-logos/')) return false;
  if (PLACEHOLDER_LOGO_RE.test(src) && !src.includes('/ts-thing-logos/')) return true;
  if (src.startsWith('data:image/svg+xml')) return true;
  return false;
}

function text(value) {
  return String(value || '').trim();
}

function haystack(thing = {}, override = {}) {
  return [
    override.title,
    thing.name,
    thing.title,
    override.category,
    thing.category_name,
    thing.category?.name,
  ].map(text).join(' ');
}

export function namedLogoPath(name = '') {
  const source = text(name);
  if (!source) return '';
  if (NAMED_THING_LOGOS[source]) return NAMED_THING_LOGOS[source];
  const folded = Object.entries(NAMED_THING_LOGOS).find(([label]) => label.toLowerCase() === source.toLowerCase());
  return folded ? folded[1] : '';
}

export function brandLogoPath(thing = {}, override = {}) {
  const name = text(override.title || thing.name || thing.title);
  const named = namedLogoPath(name);
  if (named) return named;
  const source = haystack(thing, override);
  for (const [pattern, path] of BRAND_LOGOS) {
    if (pattern.test(source)) return path;
  }
  return '';
}

export function logoLookupRuntimeSource() {
  const named = JSON.stringify(NAMED_THING_LOGOS);
  const rows = JSON.stringify(BRAND_LOGOS.map(([pattern, path]) => [pattern.source, path]));
  return `(name)=>{const s=String(name||"");const named=${named};if(named[s])return named[s];const k=Object.keys(named).find(n=>n.toLowerCase()===s.toLowerCase());if(k)return named[k];const hit=${rows}.find(row=>new RegExp(row[0],"i").test(s));return hit?hit[1]:""}`;
}

export function generatedLogoDataUri(thing = {}, override = {}, type = 'other') {
  const name = text(override.title || thing.name || thing.title || 'Thing');
  const letter = (name.replace(/[^A-Za-z0-9]/g, '')[0] || '?').toUpperCase();
  const colors = {
    flight: ['#0f766e', '#ccfbf1'],
    hotel: ['#1d4ed8', '#dbeafe'],
    restaurant: ['#b91c1c', '#fee2e2'],
    store: ['#c2410c', '#ffedd5'],
    shopping: ['#c2410c', '#ffedd5'],
    car: ['#0e7490', '#cffafe'],
    transport: ['#334155', '#e2e8f0'],
    bar: ['#b45309', '#fef3c7'],
    attraction: ['#6d28d9', '#ede9fe'],
    event: ['#7c3aed', '#ede9fe'],
    theatre: ['#9d174d', '#fce7f3'],
    other: ['#334155', '#e2e8f0'],
  };
  const [fg, bg] = colors[type] || colors.other;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${name}">
  <rect width="64" height="64" rx="16" fill="${bg}"/>
  <text x="32" y="40" text-anchor="middle" font-family="Georgia,serif" font-size="28" font-weight="700" fill="${fg}">${letter}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function captureThingLogo(thing = {}, override = {}, rowType = '') {
  const resolved = timelineIcon(thing, override, rowType);
  const brand = brandLogoPath(thing, override);
  if (brand) return brand;
  const explicit = text(override.logoUrl || override.iconUrl || thing.logoUrl || thing.iconUrl);
  if (explicit && !isBoundStoryMediaUrl(explicit) && !isPlaceholderLogoUrl(explicit)) return explicit;
  const imageUrl = text(thing.image_url || thing.imageUrl);
  if (imageUrl && !isBoundStoryMediaUrl(imageUrl) && !isPlaceholderLogoUrl(imageUrl)) return imageUrl;
  if (resolved.type === 'flight') return '/ts-thing-logos/flight.svg';
  if (resolved.type === 'car' || resolved.type === 'transport') return '/ts-thing-logos/car.svg';
  return generatedLogoDataUri(thing, override, resolved.type);
}

export function applyCapturedLogos(shared = {}) {
  const next = {
    ...shared,
    places: Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [],
    thingOverrides: shared.thingOverrides && typeof shared.thingOverrides === 'object'
      ? { ...shared.thingOverrides }
      : {},
  };
  for (const place of next.places) {
    const key = `place:${place.id}`;
    const override = { ...(next.thingOverrides[key] || {}) };
    const resolved = timelineIcon(place, override);
    const logoUrl = captureThingLogo(place, override);
    override.logoUrl = logoUrl;
    override.icon = resolved.icon;
    if (resolved.isFlight) override.icon = '✈️';
    else if (!override.icon || /plane|✈️|\u2708/i.test(String(override.icon))) {
      override.icon = timelineCategoryIcon(resolved.type);
    }
    next.thingOverrides[key] = override;
    if (!place.image_url || isBoundStoryMediaUrl(place.image_url)) {
      place.logoUrl = logoUrl;
    } else {
      place.logoUrl = place.image_url;
    }
    place.captured_logo_url = logoUrl;
  }
  return next;
}

export function thingCreateLogoFields(title, category, extras = {}) {
  const thing = { name: title, category_name: category, address: extras.address || '' };
  const override = { title, category };
  const resolved = timelineIcon(thing, override);
  return {
    logoUrl: captureThingLogo(thing, override),
    icon: resolved.icon,
    category: resolved.type,
    isFlight: resolved.isFlight,
  };
}
