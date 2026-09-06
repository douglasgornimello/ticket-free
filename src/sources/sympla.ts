import {
  normalizeSymplaListResponse,
  type SymplaListResponse,
} from './sympla.normalize';
import { parsePriceText } from './sympla.price';
import type { NormalizedEvent } from '../lib/types';

const RJ_EVENTS_URL = 'https://www.sympla.com.br/eventos/rio-de-janeiro-rj';
const MAX_PRICE = 20;

export interface SymplaPage {
  goto(url: string): Promise<void>;
  getByText(text: string): { click(): Promise<void> };
  waitForResponse(
    predicate: (response: { url(): string; request(): { method(): string } }) => boolean,
  ): Promise<{ json(): Promise<unknown> }>;
  locator(selector: string): { innerText(): Promise<string> };
}

export async function scrapeSympla(
  page: SymplaPage,
  now: Date = new Date(),
): Promise<NormalizedEvent[]> {
  await page.goto(RJ_EVENTS_URL);

  const freeEvents = await collectByPriceFilter(page, 'Grátis', { isFree: true, minPrice: 0 }, now);
  const paidCandidates = await collectByPriceFilter(
    page,
    'Pago',
    { isFree: false, minPrice: null },
    now,
  );

  const cheapPaidEvents: NormalizedEvent[] = [];
  for (const candidate of paidCandidates) {
    const price = await scrapeEventPrice(page, candidate.url);
    if (price !== null && price <= MAX_PRICE) {
      cheapPaidEvents.push({ ...candidate, minPrice: price });
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
  await page.getByText('Preço').click();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('discovery-bff/search/category-type') &&
      response.request().method() === 'POST',
  );
  await page.getByText(filterLabel).click();
  const response = await responsePromise;
  const json = (await response.json()) as SymplaListResponse;
  return normalizeSymplaListResponse(json, priceInfo, now);
}

async function scrapeEventPrice(page: SymplaPage, eventUrl: string): Promise<number | null> {
  await page.goto(eventUrl);
  const text = await page.locator('body').innerText();
  return parsePriceText(text);
}
