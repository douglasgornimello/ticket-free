import {
  normalizeSymplaListResponse,
  type SymplaListResponse,
} from './sympla.normalize';
import { parsePriceText } from './sympla.price';
import type { NormalizedEvent } from '../lib/types';

const RJ_EVENTS_URL = 'https://www.sympla.com.br/eventos/rio-de-janeiro-rj';
const MAX_PRICE = 20;

// Minimal Playwright `Page`/`Locator` surface this module needs. A real
// `playwright.Page` satisfies it at runtime; tests supply a hand-written
// fake. `getByText(...).last()` is deliberate: "Grátis"/"Pago" appear both
// as nav items and as items inside the price dropdown — the last match is
// always the dropdown option that actually triggers the search API.
export interface SymplaPage {
  goto(
    url: string,
    options?: { waitUntil?: string },
  ): Promise<void>;
  getByText(text: string): { last(): { click(): Promise<void> } };
  waitForTimeout(ms: number): Promise<void>;
  waitForResponse(
    predicate: (response: { url(): string; request(): { method(): string } }) => boolean,
  ): Promise<{ json(): Promise<unknown> }>;
  locator(selector: string): { innerText(): Promise<string> };
}

export async function scrapeSympla(
  page: SymplaPage,
  now: Date = new Date(),
): Promise<NormalizedEvent[]> {
  await page.goto(RJ_EVENTS_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});

  const freeEvents = await collectByPriceFilter(page, 'Grátis', { isFree: true, minPrice: 0 }, now);

  // Respeitar o site: pausa entre as duas varreduras de filtro para reduzir
  // risco de rate-limit (429). A Sympla devolve página de segurança quando
  // o volume de requests é alto.
  await page.waitForTimeout(2500);

  const paidCandidates = await collectByPriceFilter(
    page,
    'Pago',
    { isFree: false, minPrice: null },
    now,
  );

  const cheapPaidEvents: NormalizedEvent[] = [];
  for (const candidate of paidCandidates) {
    try {
      const price = await scrapeEventPrice(page, candidate.url);
      if (price !== null && price <= MAX_PRICE) {
        cheapPaidEvents.push({ ...candidate, minPrice: price });
      }
    } catch (error) {
      // A single broken detail page (timeout, navigation error, 404)
      // must not discard the whole scrape - skip this candidate and
      // keep going so free events and other paid candidates still ship.
      console.error(`Failed to load price for ${candidate.url}:`, error);
    }
  }

  return [...freeEvents, ...cheapPaidEvents];
}

async function collectByPriceFilter(
  page: SymplaPage,
  filterLabel: 'Grátis' | 'Pago',
  priceInfo: { isFree: boolean; minPrice: number | null },
  now: Date,
): Promise<NormalizedEvent[]> {
  // Open the price dropdown. Use the last "Preço" match to avoid any
  // earlier navigation/heading match in strict mode.
  await page.getByText('Preço').last().click();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('discovery-bff/search/category-type') &&
      response.request().method() === 'POST',
  );

  // Click the dropdown option (last match is the dropdown item, not the
  // nav link). This triggers the site's own search POST, which we then
  // intercept for the normalized payload.
  await page.getByText(filterLabel).last().click();

  const response = await responsePromise;
  const json = (await response.json()) as SymplaListResponse;
  return normalizeSymplaListResponse(json, priceInfo, now);
}

async function scrapeEventPrice(page: SymplaPage, eventUrl: string): Promise<number | null> {
  await page.goto(eventUrl);
  const text = await page.locator('body').innerText();
  return parsePriceText(text);
}