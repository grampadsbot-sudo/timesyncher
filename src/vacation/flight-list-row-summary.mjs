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

export function isPipelineFlightStubSummary(value = '') {
  const row = text(value);
  if (!row) return false;
  if (/^Documented\b/i.test(row) && /\boption\b/i.test(row)) {
    if (/\boption\s*\(/i.test(row)) return true;
    if (/\boption\s+with\b/i.test(row)) return true;
  }
  if (/\bStatus:\s*candidate\b/i.test(row)) return true;
  if (/\bcandidate only\b/i.test(row)) return true;
  return false;
}

export function stripPipelineFlightStubPrefix(value = '') {
  const row = text(value);
  if (!row) return '';
  const paren = row.replace(/^Documented\s+.+\s+option\s*\([^)]*\)\s*/i, '');
  if (paren !== row) return paren;
  const withWord = row.replace(/^Documented\s+\w+\s+option\s+with\s*/i, '');
  if (withWord !== row) return withWord;
  return row;
}

export function pickFlightListRowSummaryText(value = '') {
  const s = text(value);
  if (!s) return '';
  if (isPipelineFlightStubSummary(s)) {
    return text(stripPipelineFlightStubPrefix(s));
  }
  let line = s;
  if (wordCount(s) > 20) {
    line = shortLineFromStoredSummary(s);
    if (wordCount(line) < LIST_ROW_MIN_WORDS) line = '';
  }
  if (/Airline:/i.test(line) && /Route:/i.test(line)) return line;
  if (/^Airline:/i.test(s) && s.includes(';')) {
    const parts = s.match(/[^;]+;?/g).map((row) => text(row)).filter(Boolean);
    const airlineLine = clipText(parts.slice(0, 5).join(' '), LIST_ROW_SHORT_MAX);
    if (wordCount(airlineLine) >= LIST_ROW_MIN_WORDS) return airlineLine;
  }
  return line;
}

export const STORED_SUMMARY_LIST_ROW_PICK_BUNDLE =
  't=>{const s=String(t??"").trim();if(!s)return"";const wc=n=>String(n??"").trim().split(/\\s+/).filter(Boolean).length;const clip=(n,m)=>{const r=String(n??"").trim();return!r||r.length<=m?r:r.slice(0,m).trim()};const stub=r=>{if(!r)return!1;if(/^Documented\\b/i.test(r)&&/\\boption\\b/i.test(r)){if(/\\boption\\s*\\(/i.test(r))return!0;if(/\\boption\\s+with\\b/i.test(r))return!0}if(/\\bStatus:\\s*candidate\\b/i.test(r))return!0;if(/\\bcandidate only\\b/i.test(r))return!0;return!1};const stripStub=r=>{const p=r.replace(/^Documented\\s.+\\soption\\s*\\([^)]*\\)\\s*/i,"");if(p!==r)return p;const w=r.replace(/^Documented\\s+\\w+\\s+option\\s+with\\s*/i,"");return w!==r?w:r};if(stub(s))return clip(stripStub(s),4000);let line=s;if(wc(s)>20){const cl=s.match(/[^.!?;]+[.!?;]/gy);line="";if(cl){for(const x of cl){const next=clip(line+" "+x,4000);if(line&&next.length>120)break;line=next;if(wc(line)>=6)break}line=clip(line,120)}else line=clip(s.split(/\\s+/).slice(0,10).join(" "),120);if(wc(line)<6)line=""}if(/Airline:/i.test(line)&&/Route:/i.test(line))return line;if(/^Airline:/i.test(s)&&s.includes(";")){const parts=s.match(/[^;]+;?/g).map(r=>String(r??"").trim()).filter(Boolean);const airlineLine=clip(parts.slice(0,5).join(" "),120);if(wc(airlineLine)>=6)return airlineLine}return line}';
