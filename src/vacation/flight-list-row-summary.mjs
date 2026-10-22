const LIST_ROW_MIN_WORDS = 6;
const LIST_ROW_SHORT_MAX = 120;

function text(value) {
  return String(value ?? '').trim();
}

function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

function clipText(value, max) {
  const row = text(value);
  if (!row || row.length <= max) return row;
  return row.slice(0, max).trim();
}

export function isThinNeighborhoodListSummary(value = '') {
  const row = text(value);
  if (!row) return false;
  if (/^Neighborhood:\s*.+;\s*Rating:\s*[\d.]+\.?\s*$/i.test(row)) return true;
  if (/^Neighborhood:\s*.+;\s*Rating:/i.test(row)) {
    if (/\b(Price:\s*\$|\/night|room|suite|pod|king|queen|bunk|breakfast|cancellation|candidate|walk|subway|week for)\b/i.test(row)) {
      return false;
    }
    return true;
  }
  return false;
}

function summaryClauses(row = '') {
  const line = text(row);
  if (!line) return null;
  if (/^Neighborhood:/i.test(line) && line.includes(';')) {
    return line.split(/;\s*/).filter(Boolean).map((part, idx, parts) => {
      const chunk = text(part);
      return idx < parts.length - 1 ? `${chunk};` : chunk;
    });
  }
  return line.match(/[^.!?;]+[.!?;]/gy);
}

function shortLineFromStoredSummary(value = '', max = LIST_ROW_SHORT_MAX) {
  const row = text(value);
  if (!row) return '';
  const clauses = summaryClauses(row);
  if (clauses) {
    let line = '';
    for (const clause of clauses) {
      const next = clipText(`${line} ${clause}`, 4000);
      if (line && next.length > max) break;
      line = next;
      if (wordCount(line) >= LIST_ROW_MIN_WORDS && !isThinNeighborhoodListSummary(line)) break;
    }
    return clipText(line, max);
  }
  return clipText(row.split(/\s+/).slice(0, 10).join(' '), max);
}

export function pickFlightListRowSummaryText(value = '') {
  const s = text(value);
  if (!s) return '';
  if (isThinNeighborhoodListSummary(s)) return '';
  if (wordCount(s) <= 20) return s;
  if (/^Documented .+ option/i.test(s)) return s;
  const line = shortLineFromStoredSummary(s);
  return wordCount(line) >= LIST_ROW_MIN_WORDS ? line : '';
}

export const STORED_SUMMARY_LIST_ROW_PICK_BUNDLE =
  't=>{const s=String(t||"").replace(/\\s+/g," ").trim();if(!s)return"";const wc=n=>String(n||"").trim().split(/\\s+/).filter(Boolean).length;const clip=(n,m)=>{const r=String(n||"").trim();return!r||r.length<=m?r:r.slice(0,m).trim()};const thin=n=>{const r=String(n||"").trim();if(/^Neighborhood:\\s*.+;\\s*Rating:\\s*[\\d.]+\\.?\\s*$/i.test(r))return!0;if(/^Neighborhood:\\s*.+;\\s*Rating:/i.test(r))return!/\\b(Price:\\s*\\$|\\/night|room|suite|pod|king|queen|bunk|breakfast|cancellation|candidate|walk|subway|week for)\\b/i.test(r);return!1};const cl=n=>{const r=String(n||"").trim();if(!r)return null;if(/^Neighborhood:/i.test(r)&&r.includes(";"))return r.split(/;\\s*/).filter(Boolean).map((x,i,a)=>i<a.length-1?String(x).trim()+";":String(x).trim());return r.match(/[^.!?;]+[.!?;]/gy)};if(thin(s))return"";if(wc(s)<=20)return s;if(/^Documented .+ option/i.test(s))return s;const parts=cl(s);if(parts){let line="";for(const x of parts){const next=clip((line?line+" ":"")+x,4000);if(line&&next.length>120)break;line=next;if(wc(line)>=6&&!thin(line))break}const out=clip(line,120);return wc(out)>=6&&!thin(out)?out:""}const ten=clip(s.split(/\\s+/).slice(0,10).join(" "),120);return wc(ten)>=6&&!thin(ten)?ten:""}';
