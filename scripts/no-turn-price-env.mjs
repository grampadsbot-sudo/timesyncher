import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
export const RULE = 'NO-TURN-PRICE-ENV';
const PRICE_NAME = /^(?:.*_PRICE_CENTS|TIMESYNCHER_ORDER_[A-Z0-9_]*)$/;
const CALL_WORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'function']);
function norm(file) {
  return String(file || '').split('\\').join('/');
}
function baseName(file) {
  return norm(file).split('/').pop();
}
function priceName(name) {
  return PRICE_NAME.test(name);
}
function isUnitTest(file) {
  const base = baseName(file);
  return /(?:^|\/)(?:test_|smoke_)/.test(norm(file)) || /\.(?:test|spec)\.(?:mjs|js|cjs)$/.test(base);
}
function checkoutStem(spec) {
  const base = String(spec || '').split('?')[0].split('/').pop().replace(/_/g, '-');
  return /^(?:checkout-config|checkout-products|create-payment-intent|checkout-coupon)/.test(base);
}
function allowed(file) {
  const flat = norm(file).replace(/_/g, '-');
  const base = baseName(flat);
  if (/^(?:checkout-config|checkout-products|create-payment-intent|checkout-coupon).*\.(?:mjs|js|cjs)$/.test(base)) return true;
  return isUnitTest(file) && /checkout-config|checkout-products|create-payment-intent|checkout-coupon/.test(flat);
}
export function inTurnPriceScope(file) {
  const name = norm(file);
  const base = baseName(name);
  if (name === 'src/vacation/live-app-turn.mjs') return true;
  if ((name.startsWith('src/') || name.startsWith('routes/')) && /-turn\.mjs$/.test(base)) return true;
  if (/(?:^|\/)vacation-[^/]*-turn\.(?:mjs|js|cjs)$/.test(name)) return true;
  if (name === 'scripts/vacation-app-reply-rules.mjs') return true;
  if (name.startsWith('src/') && base.includes('reply-rules')) return true;
  if (/reply.*rules/.test(base) && /\.(?:mjs|js|cjs)$/.test(base)) return true;
  return false;
}
function maskCode(text) {
  const out = text.split('');
  const walk = (start, untilBrace) => {
    let i = start;
    while (i < text.length) {
      const c = text[i];
      const d = text[i + 1];
      if (c === '/' && d === '/') {
        while (i < text.length && text[i] !== '\n') {
          out[i] = ' ';
          i += 1;
        }
        continue;
      }
      if (c === '/' && d === '*') {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 2;
        while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
          out[i] = ' ';
          i += 1;
        }
        if (i < text.length) {
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 2;
        }
        continue;
      }
      if (c === "'" || c === '"') {
        i += 1;
        while (i < text.length && text[i] !== c && text[i] !== '\n') {
          if (text[i] === '\\') {
            out[i] = ' ';
            if (i + 1 < text.length) out[i + 1] = ' ';
            i += 2;
            continue;
          }
          out[i] = ' ';
          i += 1;
        }
        if (i < text.length && text[i] === c) i += 1;
        continue;
      }
      if (c === '`') {
        i += 1;
        while (i < text.length) {
          if (text[i] === '\\') {
            out[i] = ' ';
            if (i + 1 < text.length) out[i + 1] = ' ';
            i += 2;
            continue;
          }
          if (text[i] === '`') {
            i += 1;
            break;
          }
          if (text[i] === '$' && text[i + 1] === '{') {
            i = walk(i + 2, true);
            continue;
          }
          out[i] = ' ';
          i += 1;
        }
        continue;
      }
      if (untilBrace && c === '}') return i + 1;
      i += 1;
    }
    return i;
  };
  walk(0, false);
  return out.join('');
}
function lineOf(text, index) {
  return text.slice(0, Math.max(0, index)).split('\n').length;
}
function lineText(text, index) {
  const start = text.lastIndexOf('\n', Math.max(0, index - 1)) + 1;
  const end = text.indexOf('\n', index);
  return text.slice(start, end === -1 ? text.length : end).trim();
}
function symbol(label, text, index) {
  const start = Math.max(0, index - 80);
  const hash = createHash('sha256').update(`${text.slice(start, index)}\0${lineText(text, index)}`).digest('hex').slice(0, 8);
  return `${label}#${hash}`;
}
function readStringSpan(text, index) {
  const quote = text[index];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  let value = '';
  let i = index + 1;
  for (; i < text.length; i += 1) {
    if (text[i] === '\\') {
      value += text[i + 1] || '';
      i += 1;
      continue;
    }
    if (text[i] === quote) return { value, end: i + 1 };
    if (quote === '`' && text[i] === '$') return null;
    value += text[i];
  }
  return null;
}
function bindingName(part) {
  const trimmed = part.trim();
  if (!trimmed || trimmed.startsWith('...')) return '';
  const quoted = trimmed.match(/^(['"`])([A-Z0-9_]+)\1/);
  if (quoted) return quoted[2];
  const ident = trimmed.match(/^([A-Za-z_$][\w$]*)/);
  return ident ? ident[1] : '';
}
function destructureNames(inner) {
  const names = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < inner.length; i += 1) {
    const c = inner[i];
    if (quote) {
      if (c === '\\') {
        current += c + (inner[i + 1] || '');
        i += 1;
        continue;
      }
      if (c === quote) quote = '';
      current += c;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      current += c;
      continue;
    }
    if (c === ',') {
      names.push(bindingName(current));
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) names.push(bindingName(current));
  return names.filter(Boolean);
}
function prevSigil(masked, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(masked[i])) i -= 1;
  if (i < 0) return '';
  if (masked[i] === '=') {
    const prev = masked[i - 1];
    if (prev === '=' || prev === '!' || prev === '<' || prev === '>') return 'compare';
    return '=';
  }
  return masked[i];
}
function afterIsAssign(masked, index) {
  let i = index;
  while (i < masked.length && /\s/.test(masked[i])) i += 1;
  return masked[i] === '=' && masked[i + 1] !== '=';
}
function calleeAt(masked, parenIndex) {
  let j = parenIndex - 1;
  while (j >= 0 && /\s/.test(masked[j])) j -= 1;
  const end = j + 1;
  while (j >= 0 && /[A-Za-z0-9_$.?]/.test(masked[j])) j -= 1;
  const name = masked.slice(j + 1, end);
  if (!name || CALL_WORDS.has(name)) return '';
  return name;
}
function enclosingCallee(masked, index) {
  let depth = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    const c = masked[i];
    if (c === ')') depth += 1;
    else if (c === '(') {
      if (depth === 0) return calleeAt(masked, i);
      depth -= 1;
    }
  }
  return '';
}
function pushHit(hits, seen, text, index, label, assignment) {
  const value = symbol(label, text, index);
  if (seen.has(value)) return;
  seen.add(value);
  hits.push({ index, symbol: value, assignment: Boolean(assignment) });
}
function namedHits(masked, text, hits, seen) {
  const dot = /process\.env\s*(?:\?\.)?\s*\.\s*([A-Za-z_$][\w$]*)/g;
  let match = dot.exec(masked);
  while (match) {
    if (priceName(match[1])) {
      const end = match.index + match[0].length;
      pushHit(hits, seen, text, match.index, `process.env.${match[1]}`, afterIsAssign(masked, end));
    }
    match = dot.exec(masked);
  }
  const envRe = /process\.env\b/g;
  match = envRe.exec(masked);
  while (match) {
    let j = match.index + match[0].length;
    while (j < text.length && /\s/.test(text[j])) j += 1;
    if (text.startsWith('?.', j)) {
      j += 2;
      while (j < text.length && /\s/.test(text[j])) j += 1;
    }
    if (text[j] === '[') {
      j += 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      const parsed = readStringSpan(text, j);
      if (parsed && priceName(parsed.value)) {
        let end = parsed.end;
        while (end < text.length && /\s/.test(text[end])) end += 1;
        if (text[end] === ']') end += 1;
        const quote = text[j];
        pushHit(hits, seen, text, match.index, `process.env[${quote}${parsed.value}${quote}]`, afterIsAssign(masked, end));
      }
    }
    match = envRe.exec(masked);
  }
  const assign = /=\s*process\.env\b/g;
  match = assign.exec(masked);
  while (match) {
    let i = match.index - 1;
    while (i >= 0 && /\s/.test(masked[i])) i -= 1;
    if (masked[i] !== '}') {
      match = assign.exec(masked);
      continue;
    }
    let depth = 0;
    let open = -1;
    for (let j = i; j >= 0; j -= 1) {
      if (masked[j] === '}') depth += 1;
      else if (masked[j] === '{') {
        depth -= 1;
        if (depth === 0) {
          open = j;
          break;
        }
      }
    }
    if (open >= 0) {
      for (const name of destructureNames(text.slice(open + 1, i))) {
        if (priceName(name)) pushHit(hits, seen, text, open, `{${name}}=process.env`, false);
      }
    }
    match = assign.exec(masked);
  }
}
function bareHits(masked, text, hits, seen) {
  const re = /process\.env\b/g;
  let match = re.exec(masked);
  while (match) {
    const after = masked.slice(match.index + match[0].length);
    if (/^\s*(?:\?\.)?\s*[.\[]/.test(after)) {
      match = re.exec(masked);
      continue;
    }
    const sigil = prevSigil(masked, match.index);
    if (sigil === '(' || sigil === ',' || sigil === ':') {
      const callee = enclosingCallee(masked, match.index);
      let label = 'process.env';
      if (callee) label = `${callee}(process.env)`;
      else if (sigil === ':') {
        let i = match.index - 1;
        while (i >= 0 && /\s/.test(masked[i])) i -= 1;
        i -= 1;
        while (i >= 0 && /\s/.test(masked[i])) i -= 1;
        const end = i + 1;
        while (i >= 0 && /[A-Za-z0-9_$]/.test(masked[i])) i -= 1;
        const key = masked.slice(i + 1, end);
        label = `${key || 'field'}:process.env`;
      }
      pushHit(hits, seen, text, match.index, label, false);
    }
    match = re.exec(masked);
  }
}
function readString(text) {
  const parsed = readStringSpan(text, 0);
  return parsed ? parsed.value : '';
}
function readCallString(rest) {
  const open = rest.search(/\S/);
  if (rest[open] !== '(') return '';
  return readString(rest.slice(open + 1).trimStart());
}
function importNames(clause) {
  const names = [];
  const brace = clause.indexOf('{');
  const before = (brace >= 0 ? clause.slice(0, brace) : clause).replace(/,/g, '').trim();
  if (before) names.push('default');
  if (brace < 0) return names;
  const body = clause.slice(brace + 1, clause.lastIndexOf('}'));
  for (const part of body.split(',')) {
    const source = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
    if (!source) continue;
    names.push(source === 'default' ? 'default' : source);
  }
  return names;
}
function importsIn(text, masked) {
  const found = [];
  const re = /\b(import|require)\b/g;
  let match = re.exec(masked);
  while (match) {
    const rest = text.slice(match.index + match[1].length);
    if (match[1] === 'require') {
      const spec = readCallString(rest);
      if (spec) found.push({ index: match.index, spec, names: ['*'] });
    } else {
      const trimmed = rest.trimStart();
      if (trimmed.startsWith('(')) {
        const spec = readCallString(trimmed);
        if (spec) found.push({ index: match.index, spec, names: ['*'] });
      } else if (trimmed.startsWith("'") || trimmed.startsWith('"') || trimmed.startsWith('`')) {
        const spec = readString(trimmed);
        if (spec) found.push({ index: match.index, spec, names: ['*'] });
      } else {
        const fromAt = trimmed.search(/\bfrom\b/);
        if (fromAt >= 0) {
          const spec = readString(trimmed.slice(fromAt + 4).trimStart());
          if (spec) found.push({ index: match.index, spec, names: importNames(trimmed.slice(0, fromAt)) });
        }
      }
    }
    match = re.exec(masked);
  }
  return found;
}
function braceEnd(masked, open) {
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    if (masked[i] === '{') depth += 1;
    else if (masked[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return masked.length - 1;
}
function functionRanges(masked) {
  const ranges = [];
  const re = /\bfunction\b/g;
  let match = re.exec(masked);
  while (match) {
    const open = masked.indexOf('{', match.index);
    if (open >= 0) {
      const head = masked.slice(match.index, open);
      const named = head.match(/\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/);
      const before = masked.slice(Math.max(0, match.index - 48), match.index);
      ranges.push({ start: open, end: braceEnd(masked, open), name: named ? named[1] : '', exported: /\bexport\s+(?:default\s+)?(?:async\s+)?$/.test(before), isDefault: /\bexport\s+default\s+(?:async\s+)?$/.test(before) });
    }
    match = re.exec(masked);
  }
  const arrow = /=>/g;
  match = arrow.exec(masked);
  while (match) {
    let j = match.index + 2;
    while (masked[j] === ' ' || masked[j] === '\n' || masked[j] === '\r') j += 1;
    if (masked[j] === '{') ranges.push({ start: j, end: braceEnd(masked, j), name: '', exported: false, isDefault: false });
    match = arrow.exec(masked);
  }
  return ranges;
}
function priceReaders(source) {
  const masked = maskCode(source);
  const hits = [];
  namedHits(masked, source, hits, new Set());
  const ranges = functionRanges(masked);
  const readers = new Set();
  for (const range of ranges) {
    if (!range.exported) continue;
    if (!hits.some((hit) => hit.index >= range.start && hit.index <= range.end)) continue;
    if (range.name) readers.add(range.name);
    if (range.isDefault) readers.add('default');
  }
  const top = hits.some((hit) => !ranges.some((range) => hit.index >= range.start && hit.index <= range.end));
  if (top) readers.add('default');
  return readers;
}
function resolveSpec(fromFile, spec, cwd) {
  if (!spec.startsWith('.')) return '';
  const rel = path.posix.normalize(path.posix.join(path.posix.dirname(norm(fromFile)), spec.split('?')[0]));
  const abs = path.join(cwd, rel);
  for (const candidate of [abs, `${abs}.mjs`, `${abs}.js`, `${abs}.cjs`]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return '';
}
function importHits(text, masked, file, hits, seen, cwd) {
  for (const item of importsIn(text, masked)) {
    const stem = checkoutStem(item.spec);
    let readers = new Set();
    const resolved = resolveSpec(file, item.spec, cwd);
    if (resolved) readers = priceReaders(fs.readFileSync(resolved, 'utf8'));
    else if (stem) {
      for (const root of ['routes', 'src/vacation']) {
        const candidate = path.join(cwd, root, item.spec.split('?')[0].split('/').pop());
        if (fs.existsSync(candidate)) {
          readers = priceReaders(fs.readFileSync(candidate, 'utf8'));
          break;
        }
      }
    }
    const named = item.names.filter((name) => name !== '*' && readers.has(name));
    if (named.length) pushHit(hits, seen, text, item.index, `fn:${named.join(',')}`, false);
    else if (stem || (item.names.includes('*') && readers.size)) pushHit(hits, seen, text, item.index, `module:${item.spec}`, false);
  }
}
export function turnPriceFindings(file, text, cwd = process.cwd()) {
  const name = norm(file);
  if (allowed(name) || !inTurnPriceScope(name)) return [];
  const value = String(text || '');
  const masked = maskCode(value);
  const hits = [];
  const seen = new Set();
  namedHits(masked, value, hits, seen);
  bareHits(masked, value, hits, seen);
  importHits(value, masked, name, hits, seen, cwd);
  const kept = isUnitTest(name) ? hits.filter((hit) => !hit.assignment) : hits;
  return kept.map((hit) => ({
    rule: RULE,
    file: name,
    line: lineOf(value, hit.index),
    symbol_or_pattern: hit.symbol,
  }));
}
