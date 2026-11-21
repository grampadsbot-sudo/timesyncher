import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBannedHosts } from '../../harness/fetch-guard.mjs';

export const PINNED_EMBEDDING_MODEL = 'BAAI/bge-small-en-v1.5';
export const PINNED_EMBEDDING_REVISION = '5c38ec7c405ec4b44b94cc5a9bb96e735b38267a';

const BGE_SCRIPT = fileURLToPath(new URL('./bge_embed.py', import.meta.url));
const REQUIRED_SNAPSHOT_FILES = ['config.json', 'tokenizer.json'];
const WEIGHT_FILES = ['model.safetensors', 'pytorch_model.bin'];
const SHA_RE = /^[0-9a-f]{40}$/;

export function assertPinnedEmbeddingConfig({
  model = PINNED_EMBEDDING_MODEL,
  revision = PINNED_EMBEDDING_REVISION,
  provider = 'local-huggingface-cache',
  baseUrl = '',
} = {}) {
  const bannedHosts = loadBannedHosts();
  const providerLower = String(provider || '').trim().toLowerCase();
  const urlLower = String(baseUrl || '').trim().toLowerCase();
  const modelText = String(model || '').trim();
  const revText = String(revision || '').trim();

  if (providerLower.includes('openrouter') || providerLower.includes('openai') || providerLower.includes('remote')) {
    throw new Error(`refused: remote or OpenRouter embedding provider is banned (${provider})`);
  }
  if (urlLower) {
    if (/^https?:\/\//i.test(urlLower) || urlLower.includes('openrouter') || bannedHosts.some((host) => urlLower.includes(host))) {
      throw new Error(`refused: network embedding baseUrl is banned (${baseUrl})`);
    }
  }
  if (modelText !== PINNED_EMBEDDING_MODEL) {
    throw new Error(`refused: embedding model must be pinned to ${PINNED_EMBEDDING_MODEL}, got ${modelText || '(empty)'}`);
  }
  if (!SHA_RE.test(revText) || revText !== PINNED_EMBEDDING_REVISION) {
    throw new Error(`refused: embedding revision must be locked to ${PINNED_EMBEDDING_REVISION}, got ${revText || '(empty)'}`);
  }
  return { model: modelText, revision: revText, provider: providerLower || 'local-huggingface-cache' };
}

function defaultHubCacheDirs(env = process.env, home = os.homedir()) {
  const dirs = [];
  if (env.HF_HUB_CACHE) dirs.push(env.HF_HUB_CACHE);
  if (env.HF_HOME) dirs.push(path.join(env.HF_HOME, 'hub'));
  dirs.push(path.join(home, '.cache', 'huggingface', 'hub'));
  return [...new Set(dirs.filter(Boolean))];
}

function snapshotValid(dir) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return false;
  for (const name of REQUIRED_SNAPSHOT_FILES) {
    if (!fs.existsSync(path.join(dir, name))) return false;
  }
  return WEIGHT_FILES.some((name) => fs.existsSync(path.join(dir, name)));
}

export function resolveLocalModelSnapshot({
  model = PINNED_EMBEDDING_MODEL,
  revision = PINNED_EMBEDDING_REVISION,
  snapshotDir = process.env.SSR_MODEL_SNAPSHOT_DIR || '',
  cacheDir = '',
  env = process.env,
} = {}) {
  assertPinnedEmbeddingConfig({ model, revision });
  if (snapshotDir) {
    const resolved = path.resolve(snapshotDir);
    if (!resolved.includes(revision)) {
      throw new Error(`refused: snapshotDir does not match pinned revision ${revision}`);
    }
    if (!snapshotValid(resolved)) {
      throw new Error(`refused: local snapshot incomplete at ${resolved}`);
    }
    return resolved;
  }
  const repoDir = `models--${model.replace('/', '--')}`;
  const roots = cacheDir ? [cacheDir] : defaultHubCacheDirs(env);
  for (const root of roots) {
    const candidate = path.join(root, repoDir, 'snapshots', revision);
    if (snapshotValid(candidate)) return candidate;
  }
  throw new Error(
    `refused: pinned local model ${model}@${revision} is not cached locally (no network download allowed at score time)`,
  );
}

function pythonSupportsTransformers(pythonBin) {
  if (!pythonBin) return false;
  if (pythonBin.includes(path.sep) && !fs.existsSync(pythonBin)) return false;
  const check = spawnSync(pythonBin, ['-c', 'import torch, transformers'], {
    encoding: 'utf8',
    timeout: 15000,
  });
  return check.status === 0;
}

export function resolveEmbedPython({ pythonBin = process.env.SSR_EMBED_PYTHON || '', env = process.env, home = os.homedir() } = {}) {
  const candidates = [
    pythonBin,
    env.VIRTUAL_ENV ? path.join(env.VIRTUAL_ENV, 'bin', 'python') : '',
    path.join(home, '.venvs', 'gemma-controller-rl', 'bin', 'python'),
    path.join(home, '.venvs', 'chatterbox', 'bin', 'python'),
    path.join(home, '.venvs', 'chatterbox-streaming', 'bin', 'python'),
    'python3',
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    if (pythonSupportsTransformers(candidate)) return candidate;
  }
  throw new Error('refused: no local Python runtime with torch and transformers available for BAAI/bge-small-en-v1.5');
}

export function createLocalBgeEmbedder({
  model = PINNED_EMBEDDING_MODEL,
  revision = PINNED_EMBEDDING_REVISION,
  provider = 'local-huggingface-cache',
  baseUrl = '',
  snapshotDir = process.env.SSR_MODEL_SNAPSHOT_DIR || '',
  cacheDir = '',
  pythonBin = process.env.SSR_EMBED_PYTHON || '',
  useCache = true,
  spawnImpl = spawnSync,
} = {}) {
  assertPinnedEmbeddingConfig({ model, revision, provider, baseUrl });
  const resolvedSnapshot = resolveLocalModelSnapshot({ model, revision, snapshotDir, cacheDir });
  const resolvedPython = resolveEmbedPython({ pythonBin });
  const cache = new Map();

  function cacheKey(text) {
    return `${model}@${revision}\0${text}`;
  }

  function embedTexts(texts) {
    if (!Array.isArray(texts)) throw new Error('refused: embedTexts requires an array of strings');
    const normalized = texts.map((item) => String(item ?? ''));
    const missing = [];
    const missingSet = new Set();
    for (const text of normalized) {
      const key = cacheKey(text);
      if (useCache && cache.has(key)) continue;
      if (!missingSet.has(text)) {
        missingSet.add(text);
        missing.push(text);
      }
    }

    if (missing.length > 0) {
      const env = {
        ...process.env,
        HF_HUB_OFFLINE: '1',
        TRANSFORMERS_OFFLINE: '1',
        HF_DATASETS_OFFLINE: '1',
        TOKENIZERS_PARALLELISM: 'false',
        HF_HUB_DISABLE_TELEMETRY: '1',
      };
      const proc = spawnImpl(resolvedPython, [BGE_SCRIPT], {
        input: JSON.stringify({
          snapshot_dir: resolvedSnapshot,
          model_id: model,
          revision,
          texts: missing,
        }),
        env,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        timeout: 120000,
      });
      if (proc.error) throw proc.error;
      if (proc.status !== 0) {
        throw new Error(`refused: local bge embedder failed (${proc.status}): ${String(proc.stderr || proc.stdout || '').trim()}`);
      }
      const parsed = JSON.parse(String(proc.stdout || '{}'));
      if (parsed.offline_verified !== true) {
        throw new Error('refused: local bge embedder did not verify offline execution');
      }
      if (!Array.isArray(parsed.vectors) || parsed.vectors.length !== missing.length) {
        throw new Error('refused: local bge embedder returned unexpected vector count');
      }
      for (let index = 0; index < missing.length; index += 1) {
        const vector = parsed.vectors[index];
        if (useCache) cache.set(cacheKey(missing[index]), vector);
        else cache.set(`__ephemeral__\0${index}`, vector);
      }
      if (!useCache) {
        const lookup = new Map(missing.map((text, index) => [text, parsed.vectors[index]]));
        cache.clear();
        return normalized.map((text) => lookup.get(text));
      }
    }

    return normalized.map((text) => cache.get(cacheKey(text)));
  }

  return {
    modelId: model,
    revision,
    provider: 'local-huggingface-cache',
    offlineOnly: true,
    snapshotDir: resolvedSnapshot,
    pythonBin: resolvedPython,
    embedTexts,
    clearCache() {
      cache.clear();
    },
  };
}
