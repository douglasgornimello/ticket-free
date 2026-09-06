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
  const page = await browser.newPage();

  // Adapter: Playwright's real Page satisfies SymplaPage structurally for
  // every method except `goto`, whose real return type (Promise<Response |
  // null>) is wider than the SymplaPage interface's declared Promise<void>.
  // This forwards calls only — no scraping logic lives here.
  const symplaPage: SymplaPage = {
    goto: async (url) => {
      await page.goto(url);
    },
    getByText: (text) => page.getByText(text),
    waitForResponse: (predicate) => page.waitForResponse(predicate),
    locator: (selector) => page.locator(selector),
  };

  try {
    await runScan('sympla', () => scrapeSympla(symplaPage), {
      upsertEvents: (events) => upsertEvents(pool, events),
      markInactiveNotSeen: (source, ids) => markInactiveNotSeen(pool, source, ids),
      recordScanError: (source, message) => recordScanError(pool, source, message),
    });
  } finally {
    await browser.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
