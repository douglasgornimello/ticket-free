import type { Pool } from 'pg';
import { isEligible } from './filters';
import type { NormalizedEvent } from './types';

export async function upsertEvents(pool: Pool, events: NormalizedEvent[]): Promise<void> {
  for (const event of events) {
    await pool.query(
      `INSERT INTO events (
         id, source, external_id, title, image_url, event_date,
         city, uf, min_price, is_free, url, active, last_seen_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         image_url = EXCLUDED.image_url,
         event_date = EXCLUDED.event_date,
         city = EXCLUDED.city,
         uf = EXCLUDED.uf,
         min_price = EXCLUDED.min_price,
         is_free = EXCLUDED.is_free,
         url = EXCLUDED.url,
         active = true,
         last_seen_at = EXCLUDED.last_seen_at`,
      [
        event.id,
        event.source,
        event.externalId,
        event.title,
        event.imageUrl,
        event.date,
        event.city,
        event.uf,
        event.minPrice,
        event.isFree,
        event.url,
        event.lastSeenAt,
      ],
    );
  }
}

export async function markInactiveNotSeen(
  pool: Pool,
  source: string,
  seenIds: string[],
): Promise<void> {
  await pool.query(
    `UPDATE events SET active = false WHERE source = $1 AND NOT (id = ANY($2::text[]))`,
    [source, seenIds],
  );
}

export async function getEligibleEvents(pool: Pool): Promise<NormalizedEvent[]> {
  const { rows } = await pool.query(
    `SELECT id, source, external_id, title, image_url, event_date,
            city, uf, min_price, is_free, url, active, last_seen_at
     FROM events
     WHERE active = true
     ORDER BY event_date ASC`,
  );
  // RJ + price eligibility is decided once, in filters.ts, so the DB
  // layer and the pure business rule can't drift apart. Fine at this
  // scale (one city, hundreds of rows, not millions).
  return rows.map(rowToEvent).filter(isEligible);
}

export async function recordScanError(
  pool: Pool,
  source: string,
  message: string,
): Promise<void> {
  await pool.query(`INSERT INTO scan_errors (source, message) VALUES ($1, $2)`, [source, message]);
}

function rowToEvent(row: Record<string, unknown>): NormalizedEvent {
  return {
    id: row.id as string,
    source: row.source as string,
    externalId: row.external_id as string,
    title: row.title as string,
    imageUrl: row.image_url as string,
    date: new Date(row.event_date as string),
    city: row.city as string,
    uf: row.uf as string,
    minPrice: row.min_price === null ? null : Number(row.min_price),
    isFree: row.is_free as boolean,
    url: row.url as string,
    active: row.active as boolean,
    lastSeenAt: new Date(row.last_seen_at as string),
  };
}
