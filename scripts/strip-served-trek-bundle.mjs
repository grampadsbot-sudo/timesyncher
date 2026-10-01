export const SERVED_SO = 'So=G=>{const Re=String(G||"").trim();if(!Re)return"";if(/^data:|^blob:/i.test(Re))return Re;try{const zt=(typeof location<"u"&&location.origin)||"";if(!zt)return Re;const ua=new URL(Re,zt);if(/\\/ts-thing-media\\/|\\/api\\/bind-thing-media\\b/i.test(ua.pathname+ua.search)||ua.host==="localhost:3010"||ua.host==="127.0.0.1:3010")return`${zt}${ua.pathname}${ua.search}${ua.hash}`;return ua.toString()}catch{return Re}}';

export const SO_ORIGIN_NEEDLE = 'So=G=>{const Re=String(G||"").trim();if(!Re)return"";try{const zt="https://travel.timesyncher.com",ua=new URL(Re,zt);return["192.168.1.15:3010","100.66.47.62:3010","localhost:3010","127.0.0.1:3010"].includes(ua.host)?`${zt}${ua.pathname}${ua.search}${ua.hash}`:ua.toString()}catch{return Re}}';

const EMPTY = '""';

const GEO_TABLE_START = 'Bi={JFK:[40.6413,-73.7781]';
const GEO_TABLE_END = ',Wo=([G,Re])=>';
const TRAVEL_GAP_LABEL = /jl=G=>\{const Re=Wn\(G\)[\s\S]*?min to get there`\}/;

function stripHardcodedGeoTables(source) {
  let patched = String(source || '');
  if (patched.includes(GEO_TABLE_START) && patched.includes(GEO_TABLE_END)) {
    const start = patched.indexOf(GEO_TABLE_START);
    const end = patched.indexOf(GEO_TABLE_END, start);
    if (start >= 0 && end > start) patched = `${patched.slice(0, start)}Bi={},Si=[],ii=[]${patched.slice(end)}`;
  }
  if (TRAVEL_GAP_LABEL.test(patched)) patched = patched.replace(TRAVEL_GAP_LABEL, 'jl=G=>""');
  return patched;
}

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
  out = stripHardcodedGeoTables(out);
  out = stripServedQaCopy(out);
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
  for (const needle of SERVED_QA_NEEDLES) {
    if (text.includes(needle)) {
      throw new Error(`served bundle still contains QA needle ${needle}`);
    }
  }
}

/** Drop every getAppConfig caller after the auth-client method is removed (no Promise.resolve stubs). */
const APP_CONFIG_REMOVALS = [
  {
    id: 'login-oidc-bootstrap',
    needle: '(Yt=Cr.getAppConfig)==null||Yt.call(Cr).catch(()=>null).then(Gt=>{Gt&&(W(Gt),Gt.has_users||c("register"),!Gt.password_login&&Gt.oidc_login&&Gt.oidc_configured&&Gt.has_users&&!la&&!ze&&(window.location.href="/api/auth/oidc/login"))})',
    replacement: '',
  },
  {
    id: 'forgot-password-email-channel',
    needle: 'I.useEffect(()=>{var A;(A=Cr.getAppConfig)==null||A.call(Cr).then(N=>{var U;const H=!!((U=N==null?void 0:N.available_channels)!=null&&U.email);z(H)}).catch(()=>z(null))},[]);',
    replacement: '',
  },
  {
    id: 'trip-create-reminders',
    needle: 'e&&Cr.getAppConfig().then(ht=>{(ht==null?void 0:ht.trip_reminders_enabled)!==void 0&&A(ht.trip_reminders_enabled)}).catch(()=>{}),',
    replacement: '',
  },
  {
    id: 'trip-tab-allowed-file-types',
    needle: ',Cr.getAppConfig().then(lt=>{lt.allowed_file_types&&Ne(lt.allowed_file_types)}).catch(()=>{})',
    replacement: '',
  },
  {
    id: 'admin-load-app-config',
    needle: 'const It=await Cr.getAppConfig();Se(It.password_login??!0),qe(It.password_registration??It.allow_registration??!0),Ye(It.oidc_login??!0),ht(It.oidc_registration??It.allow_registration??!0),Jt(It.env_override_oidc_only??!1),it(It.oidc_configured??!1),It.require_mfa!==void 0&&Pt(!!It.require_mfa),It.allowed_file_types&&Kt(It.allowed_file_types)',
    replacement: 'Se(!0),qe(!0),Ye(!0),ht(!0),Jt(!1),it(!1)',
  },
  {
    id: 'admin-save-reminders-refresh-a',
    needle: ',Cr.getAppConfig().then(rr=>{(rr==null?void 0:rr.trip_reminders_enabled)!==void 0&&so(rr.trip_reminders_enabled)}).catch(()=>{})',
    replacement: '',
  },
  {
    id: 'admin-save-reminders-refresh-b',
    needle: ',Cr.getAppConfig().then(Un=>{(Un==null?void 0:Un.trip_reminders_enabled)!==void 0&&so(Un.trip_reminders_enabled)}).catch(()=>{})',
    replacement: '',
  },
  {
    id: 'register-oidc-only',
    needle: 'I.useEffect(()=>{var Bt;(Bt=Cr.getAppConfig)==null||Bt.call(Cr).then(rt=>{rt!=null&&rt.oidc_only_mode&&Ce(!0)}).catch(()=>{})},[]);',
    replacement: '',
  },
  {
    id: 'settings-version',
    needle: 'I.useEffect(()=>{var N;c(),(N=Cr.getAppConfig)==null||N.call(Cr).then(H=>x(H==null?void 0:H.version)).catch(()=>{})},[])',
    replacement: 'I.useEffect(()=>{c()},[])',
  },
  {
    id: 'app-boot-demo-mode',
    needle: ',Cr.getAppConfig().then(async le=>{if(le!=null&&le.demo_mode&&c(!0),le!=null&&le.dev_mode&&h(!0),(le==null?void 0:le.is_prerelease)!==void 0&&p(le.is_prerelease),le!=null&&le.version&&g(le.version),(le==null?void 0:le.has_maps_key)!==void 0&&r(le.has_maps_key),le!=null&&le.timezone&&x(le.timezone),(le==null?void 0:le.require_mfa)!==void 0&&z(!!le.require_mfa),(le==null?void 0:le.trip_reminders_enabled)!==void 0&&P(le.trip_reminders_enabled),(le==null?void 0:le.places_photos_enabled)!==void 0&&A(le.places_photos_enabled),(le==null?void 0:le.places_autocomplete_enabled)!==void 0&&N(le.places_autocomplete_enabled),(le==null?void 0:le.places_details_enabled)!==void 0&&H(le.places_details_enabled),le!=null&&le.permissions&&FX.getState().setPermissions(le.permissions),le!=null&&le.version){const pe=localStorage.getItem("trek_app_version");if(pe&&pe!==le.version){try{if("caches"in window){const te=await caches.keys();await Promise.all(te.map(me=>caches.delete(me)))}if("serviceWorker"in navigator){const te=await navigator.serviceWorker.getRegistrations();await Promise.all(te.map(me=>me.unregister()))}}catch{}localStorage.setItem("trek_app_version",le.version),window.location.reload();return}localStorage.setItem("trek_app_version",le.version)}}).catch(()=>{})',
    replacement: '',
  },
];

export function rewriteAppConfigCallers(source = '') {
  let js = String(source || '');
  for (const rule of APP_CONFIG_REMOVALS) {
    const count = js.split(rule.needle).length - 1;
    if (count !== 1) throw new Error(`app config strip ${rule.id} matched ${count} time(s); expected 1`);
    js = js.replace(rule.needle, rule.replacement);
  }
  if (js.includes('getAppConfig')) throw new Error('trek bundle still references getAppConfig');
  return js;
}

export const SERVED_QA_NEEDLES = [
  'Anniversary Escape',
  '$1,180 under target',
  '75-90 min airport transfer',
  'Plan 75–90 min airport transfer',
  'First stop / TBD',
  'speedishuttle',
  'Bi={JFK:',
  'Craig_Kim_NYC_June_2026',
  'placeholder:"Craig"',
  'travel.timesyncher.com',
];

export function stripServedQaCopy(source = '') {
  let js = String(source || '');
  js = js.replace(/"TBD"/g, '""');
  js = js.replace(/Quote TBD/g, '');
  return js;
}
