// scripts/scan.ts
import { chromium } from 'playwright';
import { createPool, ensureSchema } from '../src/lib/db';
import {
  markInactiveNotSeen,
  recordScanError,
  upsertEvents,
} from '../src/lib/eventsStore';
import { runScan } from '../src/lib/runScan';
import { scrapeSympla, type SymplaPage } from '../src/sources/sympla';

async function main(): Promise<void> {
  const pool = createPool();
  await ensureSchema(pool);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });

  // Adapter: Playwright's real Page satisfies SymplaPage structurally for
  // every method except `goto`, whose real return type (Promise<Response |
  // null>) is wider than the SymplaPage interface's declared Promise<void>.
  // This forwards calls only — no scraping logic lives here.
  const symplaPage: SymplaPage = {
    goto: async (url, options) => {
      await page.goto(url, options as never);
    },
    getByText: (text) => page.getByText(text),
    waitForTimeout: (ms) => page.waitForTimeout(ms),
    waitForResponse: (predicate) => page.waitForResponse(predicate),
    locator: (selector) => page.locator(selector),
  };

  try {
    const success = await runScan('sympla', () => scrapeSympla(symplaPage), {
      upsertEvents: (events) => upsertEvents(pool, events),
      markInactiveNotSeen: (source, ids) => markInactiveNotSeen(pool, source, ids),
      recordScanError: (source, message) => recordScanError(pool, source, message),
    });

    if (!success) {
      // The scan failed (scrape threw, or returned 0 events) and already
      // recorded a scan_errors row. Fail the process so CI/cron surfaces
      // it instead of going green on a silent no-op scan.
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
