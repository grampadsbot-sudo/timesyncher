import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderEulaMarkdown } from '../src/onboarding/eula-markdown.mjs';
import { loadDefaultEulaText } from '../src/onboarding/eula-persistent-core.mjs';

const source = loadDefaultEulaText();
const html = renderEulaMarkdown(source);

for (const line of html.split('\n')) {
  assert.equal(line.startsWith('#'), false, `rendered line starts with #: ${line}`);
}
const visible = html.replace(/<[^>]+>/g, '\n');
for (const line of visible.split('\n')) {
  assert.equal(line.trimStart().startsWith('#'), false, `visible line starts with #: ${line}`);
}
assert.match(html, /<h1>/);
assert.match(html, /<h2>/);
assert.equal(html.includes('workbench language'), false);
assert.equal(source.includes('workbench language'), false);

const page = await readFile(new URL('../vacation-app.html', import.meta.url), 'utf8');
assert.match(page, /id="eulaScreen"/);
assert.match(page, /id="eulaAgree"/);
assert.match(page, /id="eulaAgreeButton"/);
assert.match(page, /id="eulaName"/);
assert.match(page, /renderEulaMarkdown\(eula\.text\)/);

const hostile = renderEulaMarkdown([
  '# Sample heading',
  '',
  'A **sample** paragraph with <script>alert(1)</script> and <b>raw</b>.',
  '',
  '- First sample item',
  '- Second <img src=x onerror=alert(1)> item',
  '',
  '1. Numbered sample',
].join('\n'));
assert.match(hostile, /<h1>Sample heading<\/h1>/);
assert.match(hostile, /<strong>sample<\/strong>/);
assert.match(hostile, /<ul><li>First sample item<\/li><li>Second &lt;img src=x onerror=alert\(1\)&gt; item<\/li><\/ul>/);
assert.match(hostile, /<ol><li>Numbered sample<\/li><\/ol>/);
assert.match(hostile, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(hostile, /&lt;b&gt;raw&lt;\/b&gt;/);
assert.doesNotMatch(hostile, /<script/i);
assert.doesNotMatch(hostile, /<img/i);
assert.doesNotMatch(hostile, /<b>/i);

console.log('eula markdown render passed');
