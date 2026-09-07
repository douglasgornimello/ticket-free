import {
  normalizeSymplaListResponse,
  type SymplaListResponse,
} from './sympla.normalize';
import { parsePriceText } from './sympla.price';
import type { NormalizedEvent } from '../lib/types';

const RJ_EVENTS_URL = 'https://www.sympla.com.br/eventos/rio-de-janeiro-rj';
const MAX_PRICE = 20;

// Minimal Playwright `Page`/`Locator` surface this module needs. A real
// `playwright.Page` satisfies it structurally; tests supply a hand-written
// fake that records clicks and bounding-box clicks.
//
// Why real-mouse clicks + href sniffing? The Sympla list page is a heavy SPA:
//   • "Preço" only opens its dropdown when clicked with a real OS-level mouse
//     event (Playwright's `.click()` on it does NOT fire the handler that
//     reveals the options).
//   • Once open, "Grátis"/"Pago" exist in TWO shapes: invisible-ish nav
//     `<A href="/eventos/gratis">` links and a real dropdown `<DIV>` option.
//     Only the `<DIV>` (no href) actually triggers the search. So we click by
//     coordinates via `page.mouse` and prefer the match WITHOUT an href.
export interface SymplaPage {
  goto(url: string, options?: { waitUntil?: string }): Promise<void>;
  getByText(text: string, opts?: { exact?: boolean }): {
    count(): Promise<number>;
    nth(i: number): {
      isVisible(): Promise<boolean>;
      boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
      getAttribute(name: string): Promise<string | null>;
    };
  };
  mouse: { click(x: number, y: number): Promise<void> };
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  waitForResponse(
    predicate: (response: { url(): string; request(): { method(): string } }) => boolean,
    opts?: { timeout?: number },
  ): Promise<{ json(): Promise<unknown> }>;
  locator(selector: string): { innerText(): Promise<string> };
}

export async function scrapeSympla(
  page: SymplaPage,
  now: Date = new Date(),
  retries = 4,
): Promise<NormalizedEvent[]> {
  // Applying "Grátis" replaces the "Preço" dropdown with a removable filter
  // chip — it never reappears on the same page. Rather than juggle chip
  // removal/dropdown-reopen state, each filter pass reloads the listing
  // fresh, applies exactly one filter, and reads the result. This also
  // sidesteps any risk of the two filters compounding into "Grátis OR Pago".
  const freeEvents = await withFreshListingPage(
    page,
    () => collectByPriceFilter(page, 'Grátis', { isFree: true, minPrice: 0 }, now),
    retries,
  );

  // Be polite between the two listing loads — reduces the chance of
  // tripping Sympla's rate limiting/WAF on back-to-back automated visits.
  await page.waitForTimeout(2500);

  const paidCandidates = await withFreshListingPage(
    page,
    () => collectByPriceFilter(page, 'Pago', { isFree: false, minPrice: null }, now),
    retries,
  );

  const cheapPaidEvents: NormalizedEvent[] = [];
  for (const candidate of paidCandidates) {
    try {
      const price = await scrapeEventPrice(page, candidate.url);
      if (price !== null && price <= MAX_PRICE) {
        cheapPaidEvents.push({ ...candidate, minPrice: price });
      }
    } catch (error) {
      // A single broken detail page must not discard the whole scrape.
      console.error(`Failed to load price for ${candidate.url}:`, error);
    }
  }

  return [...freeEvents, ...cheapPaidEvents];
}

// Loads the RJ listing fresh, waits for it to be interactive, then runs
// `run` (one filter pass). The site's SPA hydration and anti-bot checks are
// flaky under real automation — a "Preço"/"Grátis"/"Pago" element that isn't
// there on one load routinely is on the next — so any failure here is
// treated as transient and retried up to `retries` times with backoff,
// rather than trying to classify error messages as retryable or not.
async function withFreshListingPage<T>(
  page: SymplaPage,
  run: () => Promise<T>,
  retries: number,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(RJ_EVENTS_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
      try {
        await page.waitForSelector('text=Preço', { timeout: 25000 });
      } catch {
        throw new Error('sympla: price filter "Preço" did not appear (page blocked or not hydrated)');
      }
      return await run();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (attempt < retries) {
        const waitMs = 5000 * attempt;
        console.warn(`sympla: attempt ${attempt}/${retries} failed (${msg}); retrying in ${waitMs}ms`);
        await page.waitForTimeout(waitMs);
        continue;
      }
      throw error;
    }
  }
}

async function collectByPriceFilter(
  page: SymplaPage,
  filterLabel: 'Grátis' | 'Pago',
  priceInfo: { isFree: boolean; minPrice: number | null },
  now: Date,
): Promise<NormalizedEvent[]> {
  // Open the price dropdown with a real OS-level mouse click (required by the
  // SPA; Playwright's locator.click() does not open it).
  await openPriceDropdown(page);

  // Arm the response listener before clicking the option, so we don't miss the
  // network event the search POST produces. If clickDropdownOption below
  // throws first, this promise is never awaited on the happy path below —
  // give it a no-op `.catch` immediately so its eventual timeout rejection
  // can't surface as a fatal unhandled-rejection while a caller elsewhere
  // (the retry loop) is already handling the click failure.
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('discovery-bff/search/category-type') &&
      response.request().method() === 'POST',
    { timeout: 15000 },
  );
  responsePromise.catch(() => {});

  // Click the visible dropdown */option*/ (the DIV without href) that triggers
  // the search.
  await clickDropdownOption(page, filterLabel);

  const response = await responsePromise;
  const json = (await response.json()) as SymplaListResponse;
  return normalizeSymplaListResponse(json, priceInfo, now);
}

// Clicks the first visible "Preço" using its bounding-box center + real mouse.
async function openPriceDropdown(page: SymplaPage): Promise<void> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const count = await page.getByText('Preço', { exact: true }).count();
    for (let i = 0; i < count; i++) {
      const match = page.getByText('Preço', { exact: true }).nth(i);
      const visible = await match.isVisible().catch(() => false);
      const box = visible ? await match.boundingBox().catch(() => null) : null;
      if (visible && box) {
        await realMouseClick(page, match);
        await page.waitForTimeout(700);
        return;
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error('sympla: no visible "Preço" button found');
}

// Clicks the visible dropdown option whose tag has NO href (real `<DIV>` item),
// skipping the nav `<A href="/eventos/...">` links that share the label.
async function clickDropdownOption(page: SymplaPage, label: string): Promise<void> {
  const loc = page.getByText(label, { exact: true });
  const count = await loc.count();
  for (let i = 0; i < count; i++) {
    const match = loc.nth(i);
    if (!(await match.isVisible().catch(() => false))) continue;
    // Prefer the dropdown item: an element with no href attribute.
    const href = await match.getAttribute('href').catch(() => 'ERR');
    if (href === null) {
      await realMouseClick(page, match);
      return;
    }
  }
  throw new Error(`sympla: no visible dropdown "${label}" item (DIV) found`);
}

async function realMouseClick(
  page: SymplaPage,
  match: {
    boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>;
  },
): Promise<void> {
  const box = await match.boundingBox();
  if (!box) throw new Error('sympla: element has no bounding box to click');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function scrapeEventPrice(page: SymplaPage, eventUrl: string): Promise<number | null> {
  await page.goto(eventUrl);
  const text = await page.locator('body').innerText();
  return parsePriceText(text);
}