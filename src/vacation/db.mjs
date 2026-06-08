import { neon } from '@neondatabase/serverless';

let sqlClient;

export function getDatabaseUrl(env = process.env) {
  return env.DATABASE_URL || env.NEON_DATABASE_URL || '';
}

export function hasDatabase(env = process.env) {
  return Boolean(getDatabaseUrl(env));
}

export function sql(env = process.env) {
  const databaseUrl = getDatabaseUrl(env);
  if (!databaseUrl) {
    throw new Error('DATABASE_URL or NEON_DATABASE_URL is required for TimeSyncher Vacation backend APIs.');
  }
  if (!sqlClient) sqlClient = neon(databaseUrl);
  return sqlClient;
}
