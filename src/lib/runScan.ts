import type { NormalizedEvent } from './types';

export interface ScanStore {
  upsertEvents(events: NormalizedEvent[]): Promise<void>;
  markInactiveNotSeen(source: string, seenIds: string[]): Promise<void>;
  recordScanError(source: string, message: string): Promise<void>;
}

/**
 * Runs a single source scan.
 *
 * Never lets an exception escape: every failure path is caught, recorded
 * via `store.recordScanError`, and reflected only in the returned boolean.
 * Callers (e.g. scripts/scan.ts) must check the return value to detect
 * failure - a resolved promise no longer implies success.
 *
 * @returns `true` if events were scraped and persisted successfully,
 *   `false` if the scrape threw or returned zero events (a scan error is
 *   recorded in both failure cases).
 */
export async function runScan(
  source: string,
  scrape: () => Promise<NormalizedEvent[]>,
  store: ScanStore,
): Promise<boolean> {
  try {
    const events = await scrape();

    if (events.length === 0) {
      // A well-formed empty result is indistinguishable from a broken
      // scraper here. markInactiveNotSeen(source, []) would flip every
      // row for this source to inactive (id = ANY('{}') is false for
      // every row), wiping the homepage. Treat it as a failure instead.
      await store.recordScanError(
        source,
        'scrape returned 0 events - skipping markInactiveNotSeen to avoid wiping active listings',
      );
      return false;
    }

    await store.upsertEvents(events);
    await store.markInactiveNotSeen(
      source,
      events.map((event) => event.id),
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.recordScanError(source, message);
    return false;
  }
}
