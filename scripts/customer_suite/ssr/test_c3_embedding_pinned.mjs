#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PINNED_EMBEDDING_MODEL,
  PINNED_EMBEDDING_REVISION,
  assertPinnedEmbeddingConfig,
  createLocalBgeEmbedder,
  resolveLocalModelSnapshot,
} from './embedder.mjs';

assert.equal(PINNED_EMBEDDING_MODEL, 'BAAI/bge-small-en-v1.5');
assert.match(PINNED_EMBEDDING_REVISION, /^[0-9a-f]{40}$/);

assert.throws(
  () => assertPinnedEmbeddingConfig({ provider: 'openrouter' }),
  /OpenRouter embedding provider is banned/,
);
assert.throws(
  () => assertPinnedEmbeddingConfig({ provider: 'remote-api' }),
  /banned/,
);
assert.throws(
  () => assertPinnedEmbeddingConfig({ baseUrl: `https://${['openrouter', 'ai'].join('.')}/api/v1` }),
  /network embedding baseUrl is banned/,
);
assert.throws(
  () => assertPinnedEmbeddingConfig({ model: 'unpinned/remote-embedding-model' }),
  /must be pinned to BAAI\/bge-small-en-v1\.5/,
);
assert.throws(
  () => assertPinnedEmbeddingConfig({ revision: 'main' }),
  /must be locked to/,
);

const emptyCache = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-empty-cache-'));
try {
  assert.throws(
    () => resolveLocalModelSnapshot({ cacheDir: emptyCache }),
    /not cached locally/,
  );
} finally {
  fs.rmSync(emptyCache, { recursive: true, force: true });
}

const snapshot = resolveLocalModelSnapshot();
assert.ok(snapshot.includes(PINNED_EMBEDDING_REVISION));
assert.ok(fs.existsSync(path.join(snapshot, 'config.json')));
assert.ok(fs.existsSync(path.join(snapshot, 'tokenizer.json')));

const embedder = createLocalBgeEmbedder({ useCache: false });
assert.equal(embedder.modelId, PINNED_EMBEDDING_MODEL);
assert.equal(embedder.revision, PINNED_EMBEDDING_REVISION);
assert.equal(embedder.offlineOnly, true);

const vectors = embedder.embedTexts([
  'This AI vacation planner saved our family hours of organizing.',
]);
assert.equal(vectors.length, 1);
assert.equal(vectors[0].length, 384);
const norm = Math.sqrt(vectors[0].reduce((sum, item) => sum + item * item, 0));
assert.ok(Math.abs(norm - 1) < 1e-4);

console.log('test_c3_embedding_pinned: ok');
