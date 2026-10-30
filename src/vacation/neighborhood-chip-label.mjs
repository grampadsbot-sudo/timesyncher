function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function titleCaseIfAllLower(s) {
  if (!s || s !== s.toLowerCase() || !/[a-z]/.test(s)) return s;
  return s
    .split(' ')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

export function neighborhoodChipLabel(raw = '') {
  let s = text(raw);
  if (!s) return '';
  s = s.split(/\s*[·•|]\s*/)[0].trim();
  s = s.replace(/\s*Read more\b.*$/i, '').trim();
  s = s.replace(/\s*How to get there\b.*$/i, '').trim();
  s = s.replace(/\s*\d+\s*min\b.*$/i, '').trim();
  s = s.replace(/\s*Closest Airport:.*$/i, '').trim();
  s = s.replace(/\s*,\s*Midtown Manhattan\b.*$/i, '').trim();
  s = s.replace(/\s+\d+(?:st|nd|rd|th)\s*(?:–|-|—|•).*$/i, '').trim();
  const andMatch = s.match(/^([A-Za-z][A-Za-z\s'-]+)\s+and\s+([A-Za-z][A-Za-z\s'-]+)/i);
  if (andMatch) s = text(andMatch[1]);
  if (s.length > 48) s = s.slice(0, 48).trim();
  return titleCaseIfAllLower(s);
}

export function dedupeNeighborhoodChipLabels(rawLabels = []) {
  const seen = new Set();
  const chips = [];
  for (const raw of rawLabels) {
    const n = neighborhoodChipLabel(raw);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push(n);
  }
  return chips;
}

export function neighborhoodChipMatchesFilter(chip = '', raw = '') {
  const label = neighborhoodChipLabel(raw);
  if (!label || !chip) return false;
  return String(chip).toLowerCase() === label.toLowerCase();
}

export function neighborhoodChipLabelBundleInject() {
  return 'tsNeighborhoodChipLabel=raw=>{let s=String(raw??"").replace(/\\s+/g," ").trim();if(!s)return "";s=s.split(/\\s*[·•|]\\s*/)[0].trim();s=s.replace(/\\s*Read more\\b.*$/i,"").trim();s=s.replace(/\\s*How to get there\\b.*$/i,"").trim();s=s.replace(/\\s*\\d+\\s*min\\b.*$/i,"").trim();s=s.replace(/\\s*Closest Airport:.*$/i,"").trim();s=s.replace(/\\s*,\\s*Midtown Manhattan\\b.*$/i,"").trim();s=s.replace(/\\s+\\d+(?:st|nd|rd|th)\\s*(?:–|-|—|•).*$/i,"").trim();const m=s.match(/^([A-Za-z][A-Za-z\\s\'-]+)\\s+and\\s+([A-Za-z][A-Za-z\\s\'-]+)/i);if(m)s=m[1].replace(/\\s+/g," ").trim();if(s.length>48)s=s.slice(0,48).trim();if(s===s.toLowerCase()&&/[a-z]/.test(s))s=s.split(" ").map(w=>w?w.charAt(0).toUpperCase()+w.slice(1):"").join(" ");return s;}';
}

export function neighborhoodChipLabelBundleLocal() {
  return neighborhoodChipLabelBundleInject().slice('tsNeighborhoodChipLabel='.length);
}
