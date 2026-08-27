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
    const { get } = await this.blob();
    const pathname = this.key(key);
    const result = await get(pathname, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
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
      const response = await get(item.pathname, { access: 'private', useCache: false });
      if (response?.statusCode === 200 && response.stream) {
        out.push(JSON.parse(await new Response(response.stream).text()));
      }
    }
    return out;
  }
}

export class PostgresJsonStore {
  constructor(env = process.env) {
    this.env = env;
    this.dbPromise = null;
  }

  databaseUrl() {
    return this.env.DATABASE_URL || this.env.NEON_DATABASE_URL || this.env.POSTGRES_URL;
  }

  async db() {
    if (!this.dbPromise) {
      this.dbPromise = (async () => {
        const url = this.databaseUrl();
        if (!url) throw new Error('DATABASE_URL, NEON_DATABASE_URL, or POSTGRES_URL is required for Postgres EULA store');
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(url);
        await sql`
          create table if not exists eula_persistent_store (
            key text primary key,
            kind text not null,
            json_value jsonb,
            text_value text,
            content_type text,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
          )
        `;
        return sql;
      })();
    }
    return this.dbPromise;
  }

  async putJson(key, value) {
    const sql = await this.db();
    await sql`
      insert into eula_persistent_store (key, kind, json_value, text_value, content_type, updated_at)
      values (${key}, 'json', ${value}, null, 'application/json', now())
      on conflict (key) do update set
        kind = excluded.kind,
        json_value = excluded.json_value,
        text_value = null,
        content_type = excluded.content_type,
        updated_at = now()
    `;
    return { key, url: `postgres:eula_persistent_store:${key}`, contentType: 'application/json' };
  }

  async getJson(key) {
    const sql = await this.db();
    const rows = await sql`
      select json_value
      from eula_persistent_store
      where key = ${key} and kind = 'json'
      limit 1
    `;
    return rows[0]?.json_value || null;
  }

  async putText(key, text, contentType = 'text/plain') {
    const sql = await this.db();
    await sql`
      insert into eula_persistent_store (key, kind, json_value, text_value, content_type, updated_at)
      values (${key}, 'text', null, ${text}, ${contentType}, now())
      on conflict (key) do update set
        kind = excluded.kind,
        json_value = null,
        text_value = excluded.text_value,
        content_type = excluded.content_type,
        updated_at = now()
    `;
    return { key, url: `postgres:eula_persistent_store:${key}`, contentType };
  }

  async listJson(prefix) {
    const sql = await this.db();
    const cleanPrefix = String(prefix || '').replace(/^\/+|\/+$/g, '');
    const likePrefix = cleanPrefix ? `${cleanPrefix}/%` : '%';
    const rows = await sql`
      select json_value
      from eula_persistent_store
      where kind = 'json' and key like ${likePrefix}
      order by updated_at desc
    `;
    return rows.map((row) => row.json_value).filter(Boolean);
  }
}

export function createPersistentStoreFromEnv(env = process.env) {
  if (env.TIMESYNCHER_EULA_STORE === 'postgres') {
    return new PostgresJsonStore(env);
  }
  if (env.BLOB_READ_WRITE_TOKEN || env.VERCEL_BLOB_STORE_ID || env.TIMESYNCHER_EULA_STORE === 'vercel-blob') {
    return new VercelBlobStore({ prefix: env.TIMESYNCHER_EULA_BLOB_PREFIX || 'timesyncher-eula' });
  }
  return new LocalJsonStore(env.TIMESYNCHER_ONBOARDING_STORE || 'runtime/onboarding-eula');
}
