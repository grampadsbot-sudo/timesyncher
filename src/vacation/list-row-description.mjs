function text(value, max = 2000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `$${value}`;
  const raw = text(value, 80);
  if (!raw) return '';
  if (/^\$/.test(raw)) return raw;
  if (/[\d]/.test(raw)) return `$${raw.replace(/^\$/, '')}`;
  return '';
}

function reputationFromThemes(themes) {
  if (!Array.isArray(themes)) return '';
  return themes.map((row) => text(row, 200)).filter(Boolean).join('; ');
}

function hotelReputation(row = {}) {
  const bits = [];
  if (text(row.googleRating)) {
    bits.push(`Google ${row.googleRating}${text(row.googleReviewCount) ? ` (${row.googleReviewCount})` : ''}`);
  }
  if (text(row.yelpRating)) {
    bits.push(`Yelp ${row.yelpRating}${text(row.yelpReviewCount) ? ` (${row.yelpReviewCount})` : ''}`);
  }
  if (text(row.thirdPartyRating)) {
    const label = text(row.thirdPartySource, 40) || 'Rating';
    bits.push(`${label} ${row.thirdPartyRating}${text(row.thirdPartyReviewCount) ? ` (${row.thirdPartyReviewCount})` : ''}`);
  }
  return bits.join('; ');
}

export function composeListRowDescription({ category = '', summary = '', fields = {} } = {}) {
  const cat = text(category, 40).toLowerCase();
  const hook = text(summary, 500);
  const parts = [];
  const push = (label, value) => {
    const row = text(value, 500);
    if (row) parts.push(label ? `${label}: ${row}` : row);
  };

  if (cat === 'car') {
    if (hook) parts.push(hook);
    push('Pickup', fields.pickupLocation);
    push('Pickup hours', fields.pickupHours);
    push('Drop-off', fields.returnLocation);
    push('Drop-off hours', fields.dropoffHours);
    const price = formatMoney(fields.price);
    if (price) push('Price', `${price} total`);
    push('Reputation', text(fields.reputationNote, 500) || reputationFromThemes(fields.reviewThemes));
    return parts.join(' · ') || hook;
  }

  if (cat === 'hotel') {
    if (hook) parts.push(hook);
    push('Check-in', fields.checkInTime);
    push('Check-out', fields.checkOutTime);
    push('Location', fields.address);
    const price = formatMoney(fields.price);
    if (price) push('Price', `${price}/night`);
    push('Reputation', hotelReputation(fields) || fields.hotelNote);
    return parts.join(' · ') || hook;
  }

  return hook;
}

export function listRowDescriptionBundleSnippet() {
  return [
    'tsListRowDescription=function(G){',
    'const row=ha(G),cat=String(It(G)||"").toLowerCase(),hook=rr(G)||"";',
    'const parts=[],push=(label,val)=>{const s=String(val||"").replace(/\\s+/g," ").trim();if(s)parts.push(label?label+": "+s:s);};',
    'const money=v=>{if(v==null||v==="")return"";if(typeof v==="number"&&isFinite(v))return"$"+v;',
    'const raw=String(v).replace(/\\s+/g," ").trim();if(!raw)return"";return/^\\$/.test(raw)?raw:/[\\d]/.test(raw)?"$"+raw.replace(/^\\$/,""):"";};',
    'if(cat==="car"){if(hook)parts.push(hook);',
    'push("Pickup",row.pickupLocation);push("Pickup hours",row.pickupHours);',
    'push("Drop-off",row.returnLocation);push("Drop-off hours",row.dropoffHours);',
    'const carPrice=money(row.price??bi(G));if(carPrice)push("Price",carPrice+" total");',
    'const themes=Array.isArray(row.reviewThemes)?row.reviewThemes.map(t=>String(t||"").trim()).filter(Boolean).join("; "):"";',
    'push("Reputation",row.reputationNote||themes);',
    'return parts.join(" · ")||hook;}',
    'if(cat==="hotel"){if(hook)parts.push(hook);',
    'push("Check-in",row.checkInTime);push("Check-out",row.checkOutTime);push("Location",row.address);',
    'const hotelPrice=money(row.price??bi(G));if(hotelPrice)push("Price",hotelPrice+"/night");',
    'const rep=[row.googleRating?"Google "+row.googleRating+(row.googleReviewCount?" ("+row.googleReviewCount+")":""):"",',
    'row.yelpRating?"Yelp "+row.yelpRating+(row.yelpReviewCount?" ("+row.yelpReviewCount+")":""):"",',
    'row.thirdPartyRating?(row.thirdPartySource||"Rating")+" "+row.thirdPartyRating+(row.thirdPartyReviewCount?" ("+row.thirdPartyReviewCount+")":""):""].filter(Boolean).join("; ");',
    'push("Reputation",rep||row.hotelNote);',
    'return parts.join(" · ")||hook;}',
    'return hook;},',
  ].join('');
}
