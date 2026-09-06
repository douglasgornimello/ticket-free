import { newDb } from 'pg-mem';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema } from '../../src/lib/db';
import {
  getEligibleEvents,
  markInactiveNotSeen,
  recordScanError,
  upsertEvents,
} from '../../src/lib/eventsStore';
import type { NormalizedEvent } from '../../src/lib/types';

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'sympla:1',
    source: 'sympla',
    externalId: '1',
    title: 'Evento Teste',
    imageUrl: 'https://example.com/img.jpg',
    date: new Date('2026-12-01T20:00:00Z'),
    city: 'Rio de Janeiro',
    uf: 'RJ',
    minPrice: 0,
    isFree: true,
    url: 'https://example.com/evento/1',
    active: true,
    lastSeenAt: new Date('2026-09-05T12:00:00Z'),
    ...overrides,
  };
}

async function makeTestPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  await ensureSchema(pool);
  return pool;
}

describe('eventsStore', () => {
  let pool: Awaited<ReturnType<typeof makeTestPool>>;

  beforeEach(async () => {
    pool = await makeTestPool();
  });

  it('upserts new events and returns them when eligible', async () => {
    await upsertEvents(pool, [makeEvent()]);
    const events = await getEligibleEvents(pool);

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('sympla:1');
  });

  it('excludes ineligible events (paid over R$20)', async () => {
    await upsertEvents(pool, [makeEvent({ isFree: false, minPrice: 25 })]);
    const events = await getEligibleEvents(pool);

    expect(events).toHaveLength(0);
  });

  it('updates an existing event on re-upsert instead of duplicating it', async () => {
    await upsertEvents(pool, [makeEvent({ title: 'Título Antigo' })]);
    await upsertEvents(pool, [makeEvent({ title: 'Título Novo' })]);
    const events = await getEligibleEvents(pool);

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Título Novo');
  });

  it('marks events not seen in the latest scan as inactive', async () => {
    await upsertEvents(pool, [makeEvent({ id: 'sympla:1', externalId: '1' })]);
    await upsertEvents(pool, [makeEvent({ id: 'sympla:2', externalId: '2' })]);

    await markInactiveNotSeen(pool, 'sympla', ['sympla:2']);
    const events = await getEligibleEvents(pool);

    expect(events.map((e) => e.id)).toEqual(['sympla:2']);
  });

  it('records a scan error without throwing', async () => {
    await expect(recordScanError(pool, 'sympla', 'boom')).resolves.not.toThrow();
  });
});
