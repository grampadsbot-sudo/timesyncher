export const SERVED_SO = 'So=G=>{const Re=String(G||"").trim();if(!Re)return"";if(/^data:|^blob:/i.test(Re))return Re;try{const zt=(typeof location<"u"&&location.origin)||"";if(!zt)return Re;const ua=new URL(Re,zt);if(/\\/ts-thing-media\\/|\\/api\\/bind-thing-media\\b/i.test(ua.pathname+ua.search)||ua.host==="localhost:3010"||ua.host==="127.0.0.1:3010")return`${zt}${ua.pathname}${ua.search}${ua.hash}`;return ua.toString()}catch{return Re}}';

export const SO_ORIGIN_NEEDLE = 'So=G=>{const Re=String(G||"").trim();if(!Re)return"";try{const zt="https://travel.timesyncher.com",ua=new URL(Re,zt);return["192.168.1.15:3010","100.66.47.62:3010","localhost:3010","127.0.0.1:3010"].includes(ua.host)?`${zt}${ua.pathname}${ua.search}${ua.hash}`:ua.toString()}catch{return Re}}';

const EMPTY = '""';

export const CANNED_STRIP_RULES = [
  {
    id: 'share-alias-map',
    needle: 'hDe={"/Craig_Kim_NYC_June_2026":"8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y"}',
    replacement: 'hDe={}',
  },
  {
    id: 'share-token-title',
    needle: 'r==="8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y"&&(document.title="TimeSyncher Vacation")',
    replacement: 'void 0',
  },
  {
    id: 'craig-auth-path',
    needle: '"/reset-password","/Craig_Kim_NYC_June_2026"',
    replacement: '"/reset-password"',
  },
  {
    id: 'craig-auth-guard',
    needle: '!W.pathname.startsWith("/shared/")&&W.pathname!=="/Craig_Kim_NYC_June_2026"&&!W.pathname.startsWith("/public/")',
    replacement: '!W.pathname.startsWith("/shared/")&&!W.pathname.startsWith("/public/")',
  },
  {
    id: 'craig-shared-theme',
    needle: 'W.pathname.startsWith("/shared/")||W.pathname==="/Craig_Kim_NYC_June_2026"',
    replacement: 'W.pathname.startsWith("/shared/")',
  },
  {
    id: 'craig-route',
    needle: 'n.jsx(tc,{path:"/Craig_Kim_NYC_June_2026",element:n.jsx(wse,{})}),',
    replacement: '',
  },
  {
    id: 'craig-kim-title',
    needle: '||/craig \\/ kim nyc/i.test(`${la.title||""}`)',
    replacement: '',
  },
  {
    id: 'so-origin',
    needle: SO_ORIGIN_NEEDLE,
    replacement: SERVED_SO,
  },
  {
    id: 'flight-price-blank',
    needle: '))||"Price TBD"',
    replacement: `))||${EMPTY}`,
  },
  {
    id: 'car-price-blank',
    needle: 'ie(G)||"Price TBD"',
    replacement: `ie(G)||${EMPTY}`,
  },
  {
    id: 'depart-blank',
    needle: ':"Depart TBD"',
    replacement: `:${EMPTY}`,
  },
  {
    id: 'arrive-blank',
    needle: ':"Arrive TBD"',
    replacement: `:${EMPTY}`,
  },
];

export const FORBIDDEN_SERVED_STRINGS = [
  '8CQXghBP4fbUHWVYHkr5r1MUcWg4xz5y',
  'Craig_Kim_NYC_June_2026',
  '/craig \\/ kim nyc/i',
  '192.168.1.15:3010',
  '100.66.47.62:3010',
  'Price TBD',
  'Depart TBD',
  'Arrive TBD',
];

export function stripCannedBundle(source) {
  let out = String(source || '');
  const counts = [];
  for (const rule of CANNED_STRIP_RULES) {
    const parts = out.split(rule.needle);
    const count = parts.length - 1;
    if (count !== 1) {
      throw new Error(`canned strip ${rule.id} matched ${count} time(s); expected 1`);
    }
    out = parts.join(rule.replacement);
    counts.push({ id: rule.id, count });
  }
  assertServedBundleClean(out);
  return { source: out, counts };
}

export function assertServedBundleClean(source) {
  const text = String(source || '');
  for (const forbidden of FORBIDDEN_SERVED_STRINGS) {
    if (text.includes(forbidden)) {
      throw new Error(`served bundle still contains ${forbidden}`);
    }
  }
}
