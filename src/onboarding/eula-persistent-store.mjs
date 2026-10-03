import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { hasDatabase } from '../vacation/db.mjs';

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

async function eulaDb(env) {
  const { sql } = await import('../vacation/db.mjs');
  return sql(env);
}

export class DatabaseJsonStore {
  constructor({ prefix = 'timesyncher-eula', env = process.env } = {}) {
    this.prefix = prefix.replace(/^\/+|\/+$/g, '');
    this.env = env;
  }

  key(key) {
    return `${this.prefix}/${key}`.replace(/\/+/g, '/');
  }

  async putJson(key, value) {
    const pathname = this.key(key);
    const db = await eulaDb(this.env);
    await db`
      insert into eula_store_objects (key, document, updated_at)
      values (${pathname}, ${value}, now())
      on conflict (key) do update set document = excluded.document, updated_at = now()
    `;
    return { key: pathname };
  }

  async getDocument(key) {
    const pathname = this.key(key);
    const db = await eulaDb(this.env);
    const rows = await db`select document from eula_store_objects where key = ${pathname} limit 1`;
    return rows[0]?.document ?? null;
  }

  async getJson(key) {
    const document = await this.getDocument(key);
    if (!document) return null;
    if (document?.kind === 'text') return null;
    return document;
  }

  async putText(key, text, contentType = 'text/plain') {
    return this.putJson(key, { kind: 'text', text, contentType });
  }

  async listJson(prefix) {
    const db = await eulaDb(this.env);
    const pathPrefix = `${this.key(prefix)}/`;
    const prefixLen = pathPrefix.length;
    const rows = await db`
      select document
      from eula_store_objects
      where left(key, ${prefixLen}) = ${pathPrefix}
        and right(key, 5) = '.json'
    `;
    return rows.map((row) => row.document).filter((doc) => doc && doc.kind !== 'text');
  }
}

export function isDeployedEulaRuntime(env = process.env) {
  return Boolean(env.VERCEL || env.VERCEL_ENV || env.NODE_ENV === 'production');
}

export function isEulaStoreTestRuntime(env = process.env) {
  return env.NODE_ENV === 'test';
}

export function createPersistentStoreFromEnv(env = process.env) {
  if (hasDatabase(env)) {
    const prefix = env.TIMESYNCHER_EULA_BLOB_PREFIX || 'timesyncher-eula';
    return new DatabaseJsonStore({ prefix, env });
  }
  if (isDeployedEulaRuntime(env)) {
    throw new Error('EULA receipt store requires DATABASE_URL');
  }
  if (env.TIMESYNCHER_ONBOARDING_STORE) {
    return new LocalJsonStore(env.TIMESYNCHER_ONBOARDING_STORE);
  }
  if (isEulaStoreTestRuntime(env)) {
    return new LocalJsonStore(env.TIMESYNCHER_ONBOARDING_STORE || 'runtime/onboarding-eula');
  }
  return new LocalJsonStore(env.TIMESYNCHER_ONBOARDING_STORE || 'runtime/onboarding-eula');
}
