import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { SHARED_FILES, MANIFEST, checkLocal, compareWith, copyTo, manifestText } from './chat-composer-sync.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

assert.deepEqual(checkLocal(root), [], 'shared composer matches its manifest');
assert.equal(read(MANIFEST), manifestText(root), 'manifest is current');
const release = 'https://raw.githubusercontent.com/grampadsbot-sudo/timesyncher/943ef3ac2061dc0fc6b07895363285ac28c2867e';
const canonical = await compareWith(release, root);
assert.ok(canonical.found, 'the canonical VK release is available');
assert.deepEqual(canonical.problems, [], 'the local composer matches the canonical release');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-composer-'));
try {
  copyTo(tmp, root);
  assert.deepEqual((await compareWith(tmp, root)).problems, [], 'copy is byte-identical');
  fs.appendFileSync(path.join(tmp, 'public/chat-composer/chat-composer.css'), '.drift{}\n');
  assert.deepEqual(checkLocal(tmp), ['public/chat-composer/chat-composer.css differs from public/chat-composer/SHA256SUMS'], 'edited copy fails the manifest check');
  const cmp = await compareWith(tmp, root);
  assert.ok(cmp.problems.some((p) => p.includes('chat-composer.css differs')), 'edited copy fails the byte compare');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

const page = read('vacation-app.html');
assert.match(page, /<link rel="stylesheet" href="\/chat-composer\/chat-composer\.css" \/>/);
assert.match(page, /<script src="\/chat-composer\/chat-composer\.js"><\/script>/);
assert.match(page, /window\.tsChatComposer\.markup\(\)/);
assert.match(page, /window\.tsChatComposer\.bind\(\{ getState, onSubmit: sendMessage \}\)/);
assert.doesNotMatch(page, /id="attachButton"/, 'composer markup lives only in the shared file');
assert.doesNotMatch(page, /\.compose-grid\s*\{/, 'composer CSS lives only in the shared file');

const sandbox = { window: {}, document: { getElementById: () => null } };
vm.runInNewContext(read('public/chat-composer/chat-composer.js'), sandbox);
const html = sandbox.window.tsChatComposer.markup();
assert.match(html, /id="attachButton"[\s\S]*id="messageText"[\s\S]*id="voiceButton"[\s\S]*id="sendButton"/);
assert.match(html, /<textarea id="messageText" name="message" rows="1" aria-label="Message" enterkeyhint="send"><\/textarea>/);
assert.match(html, /<input id="fileInput" type="file" accept="image\/\*,video\/\*,\.pdf,\.txt,\.ics,\.csv,\.json" multiple hidden>/);
assert.doesNotMatch(html, /placeholder=|voice-label|Talk/);
assert.equal(SHARED_FILES.length, 3);
console.log('test_chat_composer_shared ok');
