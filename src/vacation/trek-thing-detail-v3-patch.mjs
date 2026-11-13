function detailBodyV3({ n, d, edit, days, selectedDays, scheduled, start, duration, status, write, update, stars, media, renderMedia, captionWrite, extras }) {
  const text = value => String(value ?? '').trim();
  const clock = value => {
    const raw = text(value).replace(/(\d{1,2}:\d{2}):\d{2}/g, '$1');
    const match = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return raw;
    const hour = Number(match[1]);
    return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
  };
  const sectionStyle = { borderTop: '1px solid #eceef1', padding: '12px 0', minWidth: 0 };
  const headingStyle = { margin: '0 0 7px', fontSize: 10, fontWeight: 800, letterSpacing: 1, color: '#6b7280', textTransform: 'uppercase' };
  const inputStyle = { width: '100%', minWidth: 0, boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, padding: '8px 7px', font: 'inherit', color: '#111827', background: 'white' };
  const buttonStyle = { ...inputStyle, width: 'auto', cursor: 'pointer', fontSize: 11 };
  const fieldHeading = (key, label) => {
    if (key === 'itineraryNote') {
      return n.jsx('div', {
        style: {
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: 1.2,
          color: '#0f766e',
          textTransform: 'uppercase',
          marginBottom: 6,
        },
        children:"Itinerary note",
      });
    }
    if (key === 'longDetails') {
      return n.jsx('div', {
        style: {
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: 1.2,
          color: '#0f766e',
          textTransform: 'uppercase',
          marginBottom: 6,
        },
        children:"Details",
      });
    }
    return n.jsx('h3', { style: headingStyle, children: label });
  };
  const field = (key, label, multiline = false, value = d[key]) => {
    if (!edit && !text(value)) return null;
    return n.jsxs('section', { 'data-ts-detail-field': key, style: sectionStyle, children: [
      fieldHeading(key, label),
      edit ? n.jsx(multiline ? 'textarea' : 'input', {
        'aria-label': label, value: String(value ?? ''), rows: multiline ? 3 : undefined,
        onChange: event => write(key, event.target.value),
        style: { ...inputStyle, ...(multiline ? { minHeight: 72, resize: 'vertical' } : {}) },
      }) : n.jsx('p', { style: { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children:
        key === 'phone' ? n.jsx('a', { href: 'tel:' + text(value).replace(/\s+/g, ''), style: { color: 'inherit' }, children: value }) :
        key === 'website' ? n.jsx('a', { href: /^https?:\/\//i.test(text(value)) ? text(value) : 'https://' + text(value), target: '_blank', rel: 'noreferrer', style: { color: 'inherit' }, children: value }) : value }),
    ] });
  };
  const flag = (key, label) => edit || d[key] === true ? n.jsxs('label', {
    'data-ts-detail-flag': key, style: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, padding: '8px 0' },
    children: [n.jsx('input', { type: 'checkbox', checked: d[key] === true, disabled: !edit, readOnly: !edit,
      onChange: event => write(key, event.target.checked), style: { accentColor: '#111827' } }), label],
  }) : null;
  const visits = scheduled ? selectedDays.flatMap(dayId => {
    const day = days.find(row => String(row.id) === String(dayId));
    if (!day) return [];
    const schedule = d.perDaySchedule?.[String(dayId)] || {};
    const rows = Array.isArray(schedule.visits) ? schedule.visits : [{ startTime: schedule.startTime ?? start, duration: schedule.duration ?? duration, status: schedule.status ?? status }];
    return rows.map(row => ({ ...row, dayId: day.id, dayNumber: day.day_number }));
  }) : [];
  const saveVisits = rows => update(previous => {
    const dayIds = [...new Set(rows.map(row => row.dayId))];
    const perDaySchedule = { ...previous.perDaySchedule };
    for (const id of selectedDays) delete perDaySchedule[String(id)];
    for (const id of dayIds) {
      const items = rows.filter(row => String(row.dayId) === String(id)).map(({ startTime, duration, status }) => ({ startTime, duration, status }));
      perDaySchedule[String(id)] = { ...previous.perDaySchedule?.[String(id)], ...items[0], visits: items };
    }
    return { ...previous, timeline: rows.length > 0, dayIds, dayId: dayIds[0] ?? null, perDaySchedule };
  });
  const changeVisit = (index, key, value) => saveVisits(visits.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const visitInput = (index, key, label, value) => n.jsxs('label', { style: { minWidth: 0, fontSize: 9, color: '#6b7280' }, children: [label,
    n.jsx('input', { 'aria-label': `Visit ${index + 1} ${label}`, value: key === 'startTime' ? clock(value) : String(value ?? ''), onChange: event => changeVisit(index, key, event.target.value), style: { ...inputStyle, padding: '7px 3px', fontSize: 10, marginTop: 3 } }),
  ] });
  const timeline = edit || visits.length ? n.jsxs('section', { 'data-ts-detail-timeline': '1', style: sectionStyle, children: [
    n.jsx('h3', { style: headingStyle, children: 'Timeline' }),
    edit ? n.jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 10 }, children: [
      n.jsx('span', { style: { fontSize: 10, color: '#6b7280', marginRight: 4 }, children: 'Days' }),
      days.map(day => {
        const selected = visits.some(row => String(row.dayId) === String(day.id));
        return n.jsx('button', { type: 'button', 'aria-label': `Day ${day.day_number}`, 'aria-pressed': selected,
          onClick: () => saveVisits(selected ? visits.filter(row => String(row.dayId) !== String(day.id)) : [...visits, { dayId: day.id, startTime: '', duration: '', status: 'considering' }]),
          style: { ...buttonStyle, minWidth: 26, background: selected ? '#111827' : 'white', color: selected ? 'white' : '#6b7280', padding: '5px' }, children: day.day_number,
        }, day.id);
      }),
    ] }) : null,
    visits.map((visit, index) => edit ? n.jsxs('div', { 'data-ts-detail-visit': '1', style: { display: 'grid', gridTemplateColumns: 'minmax(0, .8fr) minmax(0, 1fr) minmax(0, .8fr) minmax(0, 1.6fr) 24px', alignItems: 'end', gap: 4, marginBottom: 8 }, children: [
      n.jsxs('label', { style: { fontSize: 9, color: '#6b7280', minWidth: 0 }, children: ['Day', n.jsx('select', {
        'aria-label': `Visit ${index + 1} Day`, value: visit.dayId, onChange: event => changeVisit(index, 'dayId', Number(event.target.value)),
        style: { ...inputStyle, padding: '7px 0', fontSize: 10, marginTop: 3 }, children: days.map(day => n.jsx('option', { value: day.id, children: `Day ${day.day_number}` }, day.id)),
      })] }),
      visitInput(index, 'startTime', 'Start', visit.startTime), visitInput(index, 'duration', 'Duration', visit.duration),
      n.jsxs('label', { style: { fontSize: 9, color: '#6b7280', minWidth: 0 }, children: ['Status', n.jsx('select', {
        'aria-label': `Visit ${index + 1} Status`, value: visit.status || 'considering', onChange: event => changeVisit(index, 'status', event.target.value),
        style: { ...inputStyle, fontSize: 10, padding: '7px 0', marginTop: 3 }, children: [...new Set(['considering', 'preferred', 'reservation', 'booked', 'confirmed', 'eliminated', visit.status].filter(Boolean))].map(value => n.jsx('option', { value, children: value.charAt(0).toUpperCase() + value.slice(1) }, value)),
      })] }),
      n.jsx('button', { type: 'button', 'aria-label': `Remove visit ${index + 1}`, onClick: () => saveVisits(visits.filter((row, i) => i !== index)), style: { ...buttonStyle, padding: '6px 0', fontSize: 15 }, children: '×' }),
    ] }, index) : n.jsx('p', { 'data-ts-detail-visit': '1', style: { margin: '0 0 8px', fontSize: 'clamp(9px, 2.55vw, 12px)', fontWeight: 700, whiteSpace: 'nowrap' },
      children: [`Day ${visit.dayNumber}`, text(visit.startTime) ? `Start: ${clock(visit.startTime)}` : '', text(visit.duration) ? /^\d+$/.test(text(visit.duration)) ? `${visit.duration} min` : text(visit.duration) : '', text(visit.status) ? `Status: ${visit.status.charAt(0).toUpperCase() + visit.status.slice(1)}` : ''].filter(Boolean).join(' · '),
    }, index)),
    edit ? n.jsx('button', { type: 'button', disabled: !days.length, onClick: () => saveVisits([...visits, { dayId: days[0]?.id, startTime: '', duration: '', status: 'considering' }]), style: buttonStyle, children: '+ Add visit' }) : null,
  ] }) : null;
  const reviews = [1, 2, 3, 4].filter(index => text(d[`review${index}`]));
  const platformRatings = edit ? n.jsx('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }, children: [
    ['googleRating', 'Google rating'],
    ['yelpRating', 'Yelp rating'],
    ['thirdPartyRating', 'Other rating'],
  ].map(([key, label]) => {
    const rv = d[key];
    const starHtml = stars(rv);
    if (!starHtml) return null;
    return n.jsxs('label', { style: { display: 'grid', gap: 4, minWidth: 0, position: 'relative' }, children: [
      label,
      n.jsx('div', {
        'data-ts-detail-rating-stars': '1',
        style: { display: 'flex', alignItems: 'center', minHeight: 28 },
        dangerouslySetInnerHTML: { __html: starHtml },
        role: 'img',
        'aria-label': typeof tsStarRatingAria === 'function' ? tsStarRatingAria(rv) : '',
      }),
      n.jsx('input', {
        value: String(rv ?? ''),
        onChange: event => write(key, event.target.value),
        placeholder: '',
        style: { ...inputStyle, position: 'absolute', opacity: 0, width: 1, height: 1, padding: 0, border: 0 },
        tabIndex: -1,
        'aria-hidden': 'true',
      }),
    ] }, key);
  }).filter(Boolean) }) : null;
  const happyHourBlock = (() => {
    const raw = String(d.happyHourDetails || '').replace(/\s+/g, ' ').trim();
    const showHH = !!raw && raw !== 'false' && !/^no happy hour\b/i.test(raw);
    if (!edit && !showHH) return null;
    return field('happyHourDetails', 'Happy Hour', true);
  })();
  return n.jsxs('div', { 'data-ts-detail-v3': '1', 'data-ts-detail-mode': edit ? 'edit' : 'view', style: { fontSize: 13, lineHeight: 1.45, color: '#1f2937', minWidth: 0 }, children: [
    timeline,
    field('story', 'Story', true),
    flag('includeInTripRecap', 'Include this story in the final keepsake'),
    flag('nextTime', 'Add to Next Time list'),
    happyHourBlock, field('summary', 'Summary', true),
    reviews.length ? n.jsxs('section', { 'data-ts-detail-reviews': '1', 'data-ts-detail-reviews-readonly': '1', style: sectionStyle, children: [
      n.jsx('h3', { style: headingStyle, children: 'Reviews' }),
      reviews.map(index => n.jsxs('div', { 'data-ts-detail-review': '1', style: { marginBottom: 8 }, children: [
        n.jsx('div', { 'data-ts-review-stars': '1', style: { lineHeight: 1 }, dangerouslySetInnerHTML: { __html: stars(d[`review${index}Rating`]) } }),
        n.jsx('p', { style: { margin: 0 }, children: d[`review${index}`] }),
      ] }, index)),
    ] }) : null,
    edit || media.length ? n.jsxs('section', { 'data-ts-detail-photos': '1', style: sectionStyle, children: [
      n.jsx('h3', { style: { ...headingStyle, textTransform: 'none', letterSpacing: 0, color: '#111827', fontSize: 12 }, children: 'Photos & videos' }),
      n.jsx('style', { children: '[data-ts-detail-photos] [data-ts-pic-thumb-wrap]{width:100%!important;min-width:0!important}[data-ts-detail-photos] [data-ts-pic-thumb-wrap]>a{width:100%!important;height:100px!important}[data-ts-detail-photos] [data-ts-pic-popup]{max-width:100%;box-sizing:border-box}' }),
      n.jsx('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }, children: media.map(item => n.jsxs('div', { style: { minWidth: 0, gridColumn: item.kind === 'video' ? '1 / -1' : undefined }, children: [
        item.kind === 'video' ? n.jsx('video', { controls: true, preload: 'metadata', src: item.url, poster: item.thumbnailUrl !== item.url ? item.thumbnailUrl : undefined, style: { display: 'block', width: '100%', maxHeight: 190, borderRadius: 8, background: '#20252c' } }) : renderMedia([item]),
        edit ? n.jsx('input', { 'aria-label': `Caption ${item.originalName || item.id}`, value: item.caption || '', onChange: event => captionWrite(item.id, event.target.value), style: { ...inputStyle, fontSize: 11, marginTop: 4 } }) : text(item.caption) ? n.jsx('p', { style: { margin: '4px 0', fontSize: 11, color: '#6b7280' }, children: item.caption }) : null,
      ] }, item.id)) }),
    ] }) : null,
    edit || text(d.address) || text(d.hours) ? n.jsxs('div', { 'data-ts-detail-info-box': 'address-hours', style: { border: '1px solid #e5e7eb', borderRadius: 10, padding: '0 10px', background: '#f8f9fa' }, children: [field('address', 'Address', true), field('hours', 'Hours', true)] }) : null,
    field('phone', 'Phone'), field('website', 'Website'), !edit ? field('area', 'Area') : null,
    field('itineraryNote', 'Itinerary note', true), field('longDetails', 'Details', true),
    field('lat', 'Latitude'), field('lng', 'Longitude'),
    edit ? field('logoUrl', 'Logo URL') : null, edit ? field('travelTime', 'Estimated travel time') : null,
    platformRatings,
    extras,
  ] });
}

const REVIEW_V3_EDIT_EXTRAS =
  '[1,2,3,4].filter(G=>String(Ps(Dt,G)||"").trim()).map(G=>n.jsxs("label",{style:Hn,children:["Review ",G,n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"120px minmax(0, 1fr)",gap:8,alignItems:"center"},children:[n.jsx("input",{value:No(Dt,`review${G}Rating`),onChange:Re=>Xa(Dt,`review${G}Rating`,Re.target.value),placeholder:"Star rating",style:De}),n.jsx("textarea",{value:Ps(Dt,G),onChange:Re=>Xa(Dt,`review${G}`,Re.target.value),style:ur})]})]},G))';

const HH_V3_EDIT_EXTRAS =
  '(zi(Dt)||It(Dt)==="bar")&&n.jsxs("label",{style:{...Hn,flexDirection:"row",alignItems:"center",gap:8,textTransform:"none",fontSize:12,paddingBottom:8},children:[n.jsx("input",{type:"checkbox",checked:!!(ha(Dt).happyHour||tsPf.some(row=>row.happyHour===true&&row.match.test(String(Dt.name||Dt.title||"")))),onChange:G=>Xa(Dt,"happyHour",G.target.checked)})," Happy hour"]}),(zi(Dt)||It(Dt)==="bar")&&(Ce||((()=>{const raw=String(ha(Dt).happyHourDetails||"").replace(/\\s+/g," ").trim();return !!raw&&raw!=="false"&&!/^no happy hour\\b/i.test(raw)})()))&&n.jsxs("label",{style:Hn,children:["Happy hour details",n.jsx("textarea",{value:String(ha(Dt).happyHourDetails||""),onChange:G=>Xa(Dt,"happyHourDetails",G.target.value),placeholder:"Recent/current happy-hour offer, menu items, discount, days/times, caveats, and source note",style:{...ur,minHeight:84},disabled:!Ce})]})';

export function patchThingDetailV3(source = '') {
  if (source.includes('function detailBodyV3(')) return source;
  const start = source.indexOf('Dt&&n.jsx("div",{style:{position:"fixed",inset:0,zIndex:1e4');
  const end = source.indexOf(',n.jsxs("div",{style:{maxWidth:1120', start);
  if (start < 0 || end < 0) throw new Error('v3 detail panel boundary missing');
  let panel = source.slice(start, end);
  const bodyStart = panel.indexOf('(()=>{const d=ha(Dt)||{},addr=');
  const extrasStart = panel.indexOf('Zi(Dt)&&n.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(2, minmax(0, 1fr))"');
  const extrasEnd = panel.indexOf(',[1,2,3,4].filter', extrasStart);
  const tagsStart = panel.indexOf('(zi(Dt)&&(Ce||or(Dt).length))');
  const tagsEnd = panel.indexOf(',Ce?n.jsxs("label",{style:Hn,children:["Details"', tagsStart);
  if ([bodyStart, extrasStart, tagsStart, tagsEnd].some(index => index < 0)) throw new Error('v3 detail content boundary missing');
  const areaEdit = 'n.jsxs("label",{style:Hn,children:["Area",n.jsx("select",{value:En(Dt),onChange:G=>Xa(Dt,"area",G.target.value),style:he,children:Ke.map(G=>n.jsx("option",{value:G,children:G},G))})]}),';
  const extras = `${panel.slice(extrasStart, extrasEnd >= 0 ? extrasEnd : extrasStart)},${REVIEW_V3_EDIT_EXTRAS},${panel.slice(tagsStart, tagsEnd)},${HH_V3_EDIT_EXTRAS}`;
  panel = panel.slice(0, bodyStart) + `(${detailBodyV3.toString()})({n,d:ha(Dt),edit:Ce&&Sa,days:Qa,selectedDays:Yi(Dt),scheduled:Ds(Dt),start:Ji(Dt),duration:br(Dt),status:hs(Dt),write:(key,value)=>Xa(Dt,key,value),update:fn=>{if(Ce){ge(!0);pe(prev=>({...prev,[Qt(Dt)]:fn(prev[Qt(Dt)]||{})}))}},stars:tsRenderStarRatingHtml,media:fo(Dt),renderMedia:items=>n.jsx(Nr,{items,scopeKey:Qt(Dt)}),captionWrite:(id,caption)=>pi(Qt(Dt),id,caption),extras:Ce&&Sa&&n.jsxs("fieldset",{"data-shared-readonly":void 0,disabled:!1,style:{border:0,padding:0,margin:0,minInlineSize:0,opacity:1},children:[${areaEdit}${extras}]})})]})})`;
  panel = panel.replace('onClick:()=>Ne(null)', 'onClick:()=>{Kt(!1),Ne(null)}');
  panel = panel.replace('maxWidth:760,margin:"24px auto"', 'maxWidth:760,margin:"0 auto"');
  panel = panel.replace('children:[n.jsxs("div",{style:{display:"flex",flexDirection:"row",justifyContent:"space-between"', 'children:[Ce&&Sa?n.jsx("select",{"aria-label":"Type",value:It(Dt),onChange:e=>Xa(Dt,"category",e.target.value),style:{width:120,fontSize:11,padding:6,border:"1px solid #d1d5db",borderRadius:6},children:Fa.map(value=>n.jsx("option",{value,children:Jn(value)},value))}):n.jsx("div",{"data-ts-detail-category":"1",style:{fontSize:10,fontWeight:800,letterSpacing:1,color:"#6b7280",textTransform:"uppercase"},children:Jn(It(Dt))}),n.jsxs("div",{style:{display:"flex",flexDirection:"row",justifyContent:"space-between"');
  panel = panel.replace('}):null,n.jsx("button",{type:"button",className:"tsv-detail-close"', '}):Ce&&Sa?n.jsx("button",{"data-ts-detail-save":"1",type:"button","aria-label":"Save changes",onClick:()=>Kt(!1),style:{border:"1px solid #e5e7eb",background:"#f9fafb",borderRadius:999,width:34,height:34,cursor:"pointer",fontWeight:900},children:"✓"}):null,n.jsx("button",{type:"button",className:"tsv-detail-close"');
  panel = panel.replace('tsHeadStars||tsPriceHas?', 'tsHeadStars||tsPriceHas||(Ce&&Sa)?');
  panel = panel.replace('return tsHeadStars||', 'const tsPriceEditor=Ce&&Sa?n.jsxs("label",{style:{display:"inline-flex",alignItems:"center",gap:4,fontSize:13,flexShrink:0},children:["Price: $",n.jsx("input",{"aria-label":"Price",value:bi(Dt),onChange:e=>Xa(Dt,"price",e.target.value),inputMode:"decimal",style:{width:48,minWidth:0,padding:6,border:"1px solid #d1d5db",borderRadius:6}})]}):null;return tsHeadStars||');
  panel = panel.replace('tsPriceHas?n.jsxs("span",', 'tsPriceEditor?tsPriceEditor:tsPriceHas?n.jsxs("span",');
  return source.slice(0, start) + panel + source.slice(end);
}
