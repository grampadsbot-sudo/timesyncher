import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compareEnvNames, loadRequiredEnv } from './deploy-env-preflight.mjs';

const ENV = '[A-Z][A-Z0-9]*_[A-Z0-9_]+';
const THROW = new RegExp(String.raw`\bMissing\s+(${ENV})\b|\b(${ENV})\s+is not set\b|\b(${ENV})\s+missing\b|\b(${ENV})\s+or\s+(${ENV})\s+is required\b|\|\|\s*['"](${ENV})['"]|(?:brave|foursquare|tavily)Name:\s*['"](${ENV})['"]`, 'g');
const READ = new RegExp(String.raw`\b(?:process\.env|env\??|sourceEnv)\.(${ENV})`, 'g');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (rel.endsWith('.mjs') && !/(^|\/)test/.test(rel)) out.push(rel);
  }
  return out;
}

function requiredBeforeFetch() {
  const names = new Set();
  const alias = new Set();
  const paths = [...walk('src'), ...walk('routes'), ...walk('scripts').filter((rel) => /worker.*\.mjs$/.test(rel))];
  for (const rel of paths) {
    const text = fs.readFileSync(rel, 'utf8');
    const search = /(?:^|\/)(?:place-search|poi-search|db)\.mjs$/.test(rel)
      || rel.endsWith('vacation-public-research-worker.mjs')
      || /fillTripIntake|searchPlaces|searchTavily|places-api\.foursquare|api\.tavily\.com|api\.search\.brave\.com/.test(text);
    if (!search) continue;
    for (const match of text.matchAll(THROW)) {
      const hit = match.slice(1).filter(Boolean);
      if (match[0].includes(' or ')) { names.add(hit[0]); alias.add(hit[1]); }
      else names.add(hit[0]);
    }
    for (const match of text.matchAll(READ)) {
      const line = text.slice(match.index, text.indexOf('\n', match.index));
      const alt = line.match(new RegExp(String.raw`\|\|\s*(?:env\??|sourceEnv|process\.env)\.(${ENV})`));
      if (alt) alias.add(alt[1]);
      if (match[0].startsWith('sourceEnv.') && /\|\|\s*['"]['"]/.test(line)) names.add(match[1]);
    }
  }
  for (const name of alias) names.delete(name);
  return names;
}

const required = loadRequiredEnv();
const found = requiredBeforeFetch();
for (const name of required) assert.equal(found.has(name), true, name);
assert.deepEqual([...found].filter((name) => !required.includes(name)), []);
assert.deepEqual(compareEnvNames(required, required), { missing: [], near: [] });
assert.deepEqual(compareEnvNames(required, required.filter((name) => name !== 'FOURSQUARE_SERVICE_KEY')).missing, ['FOURSQUARE_SERVICE_KEY']);
const typo = required.map((name) => (name === 'TAVILY_API_KEY' ? 'TAVILI_API_KEY' : name));
assert.deepEqual(compareEnvNames(required, typo), { missing: ['TAVILY_API_KEY'], near: [{ name: 'TAVILI_API_KEY', want: 'TAVILY_API_KEY' }] });
const deploy = fs.readFileSync(new URL('./deploy-staging.mjs', import.meta.url), 'utf8');
assert.ok(deploy.indexOf('runPreflight') < deploy.indexOf("spawnSync('vercel'"));
assert.match(deploy, /if \(!result\.ok\) process\.exit\(1\)/);
console.log('deploy required env ok');
