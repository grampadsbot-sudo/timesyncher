import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export class LocalJsonStore {
  constructor(rootDir) {
    this.rootDir = rootDir;
    mkdirSync(rootDir, { recursive: true });
  }

  path(key) {
    return join(this.rootDir, key);
  }

  async putJson(key, value) {
    const path = this.path(key);
    mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
    return { key, url: path };
  }

  async getJson(key) {
    const path = this.path(key);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  }

  async putText(key, text, contentType = 'text/plain') {
    const path = this.path(key);
    mkdirSync(path.split('/').slice(0, -1).join('/'), { recursive: true });
    writeFileSync(path, text);
    return { key, url: path, contentType };
  }

  async listJson(prefix) {
    const dir = this.path(prefix);
    if (!existsSync(dir)) return [];
    const out = [];
    const walk = (base) => {
      for (const name of readdirSync(base, { withFileTypes: true })) {
        const p = join(base, name.name);
        if (name.isDirectory()) walk(p);
        else if (name.name.endsWith('.json')) out.push(JSON.parse(readFileSync(p, 'utf8')));
      }
    };
    walk(dir);
    return out;
  }
}

export function isBlobUnreadable(error) {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || '');
  return status === 403
    || status === 404
    || /Failed to fetch blob:\s*(403|404)\b/i.test(message);
}

export class VercelBlobStore {
  constructor({ prefix = 'timesyncher-eula', blobModule } = {}) {
    this.prefix = prefix.replace(/^\/+|\/+$/g, '');
    this.blobModule = blobModule || null;
  }

  key(key) {
    return `${this.prefix}/${key}`.replace(/\/+/g, '/');
  }

  async blob() {
    return this.blobModule || await import('@vercel/blob');
  }

  async putJson(key, value) {
    const { put } = await this.blob();
    const body = JSON.stringify(value, null, 2) + '\n';
    return await put(this.key(key), body, {
      access: 'private',
      addRandomSuffix: false,
      contentType: 'application/json',
      allowOverwrite: true,
    });
  }

  async getJson(key) {
    try {
      const { get } = await this.blob();
      const pathname = this.key(key);
      const result = await get(pathname, { access: 'private', useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const text = await new Response(result.stream).text();
      return JSON.parse(text);
    } catch (error) {
      // Private Blob stores often hide missing or other-store paths as 403, not 404.
      // Treat those reads as empty so onboarding can recreate the session in this token's store.
      if (isBlobUnreadable(error)) return null;
      throw error;
    }
  }

  async putText(key, text, contentType = 'text/plain') {
    const { put } = await this.blob();
    return await put(this.key(key), text, {
      access: 'private',
      addRandomSuffix: false,
      contentType,
      allowOverwrite: true,
    });
  }

  async listJson(prefix) {
    const { get, list } = await this.blob();
    const result = await list({ prefix: this.key(prefix) });
    const out = [];
    for (const item of result.blobs || []) {
      if (!item.pathname.endsWith('.json')) continue;
      try {
        const response = await get(item.url || item.pathname, { access: 'private', useCache: false });
        if (response?.statusCode === 200 && response.stream) {
          out.push(JSON.parse(await new Response(response.stream).text()));
        }
      } catch (error) {
        if (isBlobUnreadable(error)) continue;
        throw error;
      }
    }
    return out;
  }
}

export function createPersistentStoreFromEnv(env = process.env) {
  if (env.BLOB_READ_WRITE_TOKEN || env.VERCEL_BLOB_STORE_ID || env.TIMESYNCHER_EULA_STORE === 'vercel-blob') {
    return new VercelBlobStore({ prefix: env.TIMESYNCHER_EULA_BLOB_PREFIX || 'timesyncher-eula' });
  }
  return new LocalJsonStore(env.TIMESYNCHER_ONBOARDING_STORE || 'runtime/onboarding-eula');
}
