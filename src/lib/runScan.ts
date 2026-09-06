import type { NormalizedEvent } from './types';

export interface ScanStore {
  upsertEvents(events: NormalizedEvent[]): Promise<void>;
  markInactiveNotSeen(source: string, seenIds: string[]): Promise<void>;
  recordScanError(source: string, message: string): Promise<void>;
}

export async function runScan(
  source: string,
  scrape: () => Promise<NormalizedEvent[]>,
  store: ScanStore,
): Promise<void> {
  try {
    const events = await scrape();
    await store.upsertEvents(events);
    await store.markInactiveNotSeen(
      source,
      events.map((event) => event.id),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.recordScanError(source, message);
  }
}
