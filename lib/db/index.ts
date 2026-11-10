import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { DDL } from './ddl';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = { db?: Promise<Db> };
// Survive Next.js hot reloads in dev: one database handle per process.
const holder = globalThis as unknown as { __openshelf?: Holder };
holder.__openshelf ??= {};

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-http');
    db = drizzle(neon(url), { schema }) as unknown as Db;
  } else {
    // No DATABASE_URL: embedded Postgres on disk, so `npm run dev` works with zero setup.
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const dir = process.env.PGLITE_DIR ?? '.pglite';
    db = drizzle(new PGlite(dir === 'memory' ? undefined : dir), { schema }) as unknown as Db;
  }
  await ensureSchema(db);
  return db;
}

export async function ensureSchema(db: Db): Promise<void> {
  for (const statement of DDL.split(';')) {
    if (statement.trim()) await db.execute(sql.raw(statement));
  }
}

export function getDb(): Promise<Db> {
  const h = holder.__openshelf!;
  h.db ??= connect();
  return h.db;
}

export { schema };
