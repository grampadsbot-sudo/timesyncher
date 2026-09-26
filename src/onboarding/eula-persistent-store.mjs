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

function blobDenied(error) {
  return /403|access denied|valid token/i.test(String(error?.message || error));
}

async function eulaDb() {
  const { sql } = await import('../vacation/db.mjs');
  const db = sql(process.env);
  await db`
    create table if not exists eula_store_objects (
      key text primary key,
      document jsonb,
      updated_at timestamptz not null default now()
    )
  `;
  return db;
}

export class VercelBlobStore {
  constructor({ prefix = 'timesyncher-eula' } = {}) {
    this.prefix = prefix.replace(/^\/+|\/+$/g, '');
  }

  key(key) {
    return `${this.prefix}/${key}`.replace(/\/+/g, '/');
  }

  async blob() {
    return await import('@vercel/blob');
  }

  async putJson(key, value) {
    try {
      const { put } = await this.blob();
      const body = JSON.stringify(value, null, 2) + '\n';
      return await put(this.key(key), body, {
        access: 'private',
        addRandomSuffix: false,
        contentType: 'application/json',
        allowOverwrite: true,
      });
    } catch (error) {
      if (!blobDenied(error)) throw error;
      const db = await eulaDb();
      await db`
        insert into eula_store_objects (key, document, updated_at)
        values (${this.key(key)}, ${value}, now())
        on conflict (key) do update set document = excluded.document, updated_at = now()
      `;
      return { key: this.key(key), fallback: 'database' };
    }
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
      if (!blobDenied(error)) throw error;
      const db = await eulaDb();
      const rows = await db`select document from eula_store_objects where key = ${this.key(key)} limit 1`;
      return rows[0]?.document || null;
    }
  }

  async putText(key, text, contentType = 'text/plain') {
    try {
      const { put } = await this.blob();
      return await put(this.key(key), text, {
        access: 'private',
        addRandomSuffix: false,
        contentType,
        allowOverwrite: true,
      });
    } catch (error) {
      if (!blobDenied(error)) throw error;
      const db = await eulaDb();
      const document = { kind: 'text', text, contentType };
      await db`
        insert into eula_store_objects (key, document, updated_at)
        values (${this.key(key)}, ${document}, now())
        on conflict (key) do update set document = excluded.document, updated_at = now()
      `;
      return { key: this.key(key), fallback: 'database' };
    }
  }

  async listJson(prefix) {
    try {
      return await this.listBlobJson(prefix);
    } catch (error) {
      if (!blobDenied(error)) throw error;
      const db = await eulaDb();
      const like = `${this.key(prefix)}%`;
      const rows = await db`
        select document
        from eula_store_objects
        where key like ${like}
          and key like '%.json'
      `;
      return rows.map((row) => row.document).filter(Boolean);
    }
  }

  async listBlobJson(prefix) {
    const { get, list } = await this.blob();
    const result = await list({ prefix: this.key(prefix) });
    const out = [];
    for (const item of result.blobs || []) {
      if (!item.pathname.endsWith('.json')) continue;
      const response = await get(item.pathname, { access: 'private', useCache: false });
      if (response?.statusCode === 200 && response.stream) {
        out.push(JSON.parse(await new Response(response.stream).text()));
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
