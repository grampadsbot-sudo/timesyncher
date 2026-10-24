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
      if (wordCount(line) >= LIST_ROW_MIN_WORDS) break;
    }
    return clipText(line, max);
  }
  return clipText(row.split(/\s+/).slice(0, 10).join(' '), max);
}

export function pickFlightListRowSummaryText(value = '') {
  const s = text(value);
  if (!s) return '';
  if (/^Airline:/i.test(s) && s.includes(';')) {
    const parts = s.split(';').map((row) => text(row)).filter(Boolean);
    const line = clipText(parts.slice(0, 5).join('; '), LIST_ROW_SHORT_MAX);
    if (wordCount(line) >= LIST_ROW_MIN_WORDS) return line;
  }
  if (wordCount(s) <= 20) return s;
  if (/^Documented .+ option/i.test(s)) return s;
  const line = shortLineFromStoredSummary(s);
  return wordCount(line) >= LIST_ROW_MIN_WORDS ? line : '';
}

export const STORED_SUMMARY_LIST_ROW_PICK_BUNDLE =
  't=>{const s=String(t||"").replace(/\\s+/g," ").trim();if(!s)return"";const wc=n=>String(n||"").trim().split(/\\s+/).filter(Boolean).length;const clip=(n,m)=>{const r=String(n||"").trim();return!r||r.length<=m?r:r.slice(0,m).trim()};if(/^Airline:/i.test(s)&&s.includes(";")){const parts=s.split(";").map(r=>String(r||"").trim()).filter(Boolean);const line=clip(parts.slice(0,5).join("; "),120);if(wc(line)>=6)return line}if(wc(s)<=20)return s;if(/^Documented .+ option/i.test(s))return s;const cl=s.match(/[^.!?;]+[.!?;]/gy);if(cl){let line="";for(const x of cl){const next=clip((line?line+" ":"")+x,4000);if(line&&next.length>120)break;line=next;if(wc(line)>=6)break}const out=clip(line,120);return wc(out)>=6?out:""}const ten=clip(s.split(/\\s+/).slice(0,10).join(" "),120);return wc(ten)>=6?ten:""}';
