import { describe, expect, it, vi } from 'vitest';
import { runScan, type ScanStore } from '../../src/lib/runScan';
import type { NormalizedEvent } from '../../src/lib/types';

function makeEvent(id: string): NormalizedEvent {
  return {
    id,
    source: 'sympla',
    externalId: id,
    title: 'Evento',
    imageUrl: 'https://example.com/img.jpg',
    date: new Date(),
    city: 'Rio de Janeiro',
    uf: 'RJ',
    minPrice: 0,
    isFree: true,
    url: 'https://example.com',
    active: true,
    lastSeenAt: new Date(),
  };
}

function makeStore(): ScanStore {
  return {
    upsertEvents: vi.fn().mockResolvedValue(undefined),
    markInactiveNotSeen: vi.fn().mockResolvedValue(undefined),
    recordScanError: vi.fn().mockResolvedValue(undefined),
  };
}

describe('runScan', () => {
  it('upserts scraped events and marks the rest of the source inactive', async () => {
    const store = makeStore();
    const events = [makeEvent('sympla:1'), makeEvent('sympla:2')];

    const success = await runScan('sympla', async () => events, store);

    expect(success).toBe(true);
    expect(store.upsertEvents).toHaveBeenCalledWith(events);
    expect(store.markInactiveNotSeen).toHaveBeenCalledWith('sympla', ['sympla:1', 'sympla:2']);
    expect(store.recordScanError).not.toHaveBeenCalled();
  });

  it('records a scan error, does not throw, and reports failure when scraping fails', async () => {
    const store = makeStore();

    let success: boolean | undefined;
    await expect(
      runScan(
        'sympla',
        async () => {
          throw new Error('site changed layout');
        },
        store,
      ).then((result) => {
        success = result;
      }),
    ).resolves.not.toThrow();

    expect(success).toBe(false);
    expect(store.recordScanError).toHaveBeenCalledWith('sympla', 'site changed layout');
    expect(store.upsertEvents).not.toHaveBeenCalled();
  });

  it('records a scan error and skips markInactiveNotSeen when the scrape returns 0 events', async () => {
    const store = makeStore();

    const success = await runScan('sympla', async () => [], store);

    expect(success).toBe(false);
    expect(store.upsertEvents).not.toHaveBeenCalled();
    expect(store.markInactiveNotSeen).not.toHaveBeenCalled();
    expect(store.recordScanError).toHaveBeenCalledWith(
      'sympla',
      expect.stringContaining('0 events'),
    );
  });
});
