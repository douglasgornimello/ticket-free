import { Pool } from 'pg';

export function createPool(connectionString: string = process.env.DATABASE_URL ?? ''): Pool {
  return new Pool({ connectionString });
}

export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      image_url TEXT NOT NULL,
      event_date TIMESTAMPTZ NOT NULL,
      city TEXT NOT NULL,
      uf TEXT NOT NULL,
      min_price NUMERIC,
      is_free BOOLEAN NOT NULL DEFAULT false,
      url TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      last_seen_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scan_errors (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}
