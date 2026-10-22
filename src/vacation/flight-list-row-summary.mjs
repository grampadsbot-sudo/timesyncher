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
  if (/^Neighborhood:\s*.+;\s*$/i.test(row) && wordCount(row) < 12) return true;
  if (/^Neighborhood:\s*.+;\s*Rating:/i.test(row)) {
    if (/\b(Price:\s*\$|\/night|room|suite|pod|king|queen|bunk|breakfast|cancellation|candidate|walk|subway|week for)\b/i.test(row)) {
      return false;
    }
    return true;
  }
  return false;
}

function shortLineFromStoredSummary(value = '', max = LIST_ROW_SHORT_MAX) {
  const row = text(value);
  if (!row) return '';
  const clauses = row.match(/[^.!?;]+[.!?;]/gy);
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
  't=>{const s=String(t||"").replace(/\\s+/g," ").trim();if(!s)return"";const wc=n=>String(n||"").trim().split(/\\s+/).filter(Boolean).length;const clip=(n,m)=>{const r=String(n||"").trim();return!r||r.length<=m?r:r.slice(0,m).trim()};const thin=n=>{const r=String(n||"").trim();if(/^Neighborhood:\\s*.+;\\s*Rating:\\s*[\\d.]+\\.?\\s*$/i.test(r))return!0;if(/^Neighborhood:\\s*.+;\\s*$/i.test(r)&&wc(r)<12)return!0;if(/^Neighborhood:\\s*.+;\\s*Rating:/i.test(r))return!/\\b(Price:\\s*\\$|\\/night|room|suite|pod|king|queen|bunk|breakfast|cancellation|candidate|walk|subway|week for)\\b/i.test(r);return!1};if(thin(s))return"";if(wc(s)<=20)return s;if(/^Documented .+ option/i.test(s))return s;const cl=s.match(/[^.!?;]+[.!?;]/gy);if(cl){let line="";for(const x of cl){const next=clip((line?line+" ":"")+x,4000);if(line&&next.length>120)break;line=next;if(wc(line)>=6&&!thin(line))break}const out=clip(line,120);return wc(out)>=6&&!thin(out)?out:""}const ten=clip(s.split(/\\s+/).slice(0,10).join(" "),120);return wc(ten)>=6&&!thin(ten)?ten:""}';
