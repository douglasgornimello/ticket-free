import {
  extractEventIdFromImageUrl,
  normalizeIngresseEvent,
  type IngresseCard,
} from './ingresse.normalize';
import { detectIngressePrice, extractIngresseCity } from './ingresse.price';
import type { NormalizedEvent } from '../lib/types';

const RJ_SEARCH_URL = 'https://www.ingresse.com/search/?location=BRA-RJ&language=pt_br';
const MAX_PRICE = 20;

// Ingresse's own event pages never show ticket prices — "Comprar ingresso"
// links out to this separate checkout subdomain, which is where lot prices
// (and, incidentally, the venue's city) actually live.
function checkoutUrl(eventId: string): string {
  return `https://embedstore.ingresse.com/tickets/ingresse.com/event/${eventId}?redirect=true&eventid=${eventId}&client=new-site`;
}

// Minimal Playwright `Page` surface this module needs. `evaluate` runs a
// closure inside the real browser page (Ingresse's listing is a scroll-to-
// load SPA with no server-side filter or JSON API, so the card list is
// read straight from the rendered DOM rather than intercepted network
// traffic, unlike Sympla).
export interface IngressePage {
  goto(url: string, options?: { waitUntil?: string }): Promise<void>;
  evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>;
  locator(selector: string): { innerText(): Promise<string> };
  waitForTimeout(ms: number): Promise<void>;
}

export async function scrapeIngresse(
  page: IngressePage,
  now: Date = new Date(),
): Promise<NormalizedEvent[]> {
  await page.goto(RJ_SEARCH_URL, { waitUntil: 'domcontentloaded' });
  const cards = await page.evaluate(browserSafeCollectCardsFromDom());

  const events: NormalizedEvent[] = [];
  for (const card of cards) {
    try {
      const eventId = extractEventIdFromImageUrl(card.imageUrl);
      if (!eventId) {
        console.error(`Ingresse card has no extractable event id: ${card.href}`);
        continue;
      }

      await page.goto(checkoutUrl(eventId), { waitUntil: 'domcontentloaded' });
      // The checkout widget fetches lot prices via its own API call after
      // load — domcontentloaded fires before that resolves, so reading the
      // text immediately would only ever see the "Subtotal R$ 0,00" shell.
      await page.waitForTimeout(1500);
      const text = await page.locator('body').innerText();

      const priceInfo = detectIngressePrice(text);
      const isEligiblePrice = priceInfo.isFree || (priceInfo.minPrice !== null && priceInfo.minPrice <= MAX_PRICE);
      if (!isEligiblePrice) continue;

      const city = extractIngresseCity(text);
      events.push(normalizeIngresseEvent(card, priceInfo, city, now));
    } catch (error) {
      // A single broken event's checkout page must not discard the whole scrape.
      console.error(`Failed to load Ingresse checkout for ${card.href}:`, error);
    }
  }

  return events;
}

// Runs inside the real browser via page.evaluate — must be a self-contained
// function with no closure over outer variables. Scrolls the search page
// to the bottom repeatedly until the card count stops growing (the listing
// lazy-loads on scroll, with no "load more" button or page numbers), then
// reads each card's link, title, image, and listing date text straight
// from the DOM.
async function collectCardsFromDom(): Promise<IngresseCard[]> {
  function readCards(): IngresseCard[] {
    return Array.from(document.querySelectorAll<HTMLAnchorElement>('main a[href^="/"]'))
      .filter((a) => {
        const href = a.getAttribute('href') ?? '';
        return href !== '/' && !/login|register|criar-evento|language=/.test(href);
      })
      .map((a) => {
        const img = a.querySelector('img');
        const paragraphs = a.querySelectorAll('p');
        return {
          href: a.getAttribute('href') ?? '',
          title: img?.getAttribute('alt') ?? a.querySelector('h3')?.textContent?.trim() ?? '',
          imageUrl: img?.getAttribute('src') ?? '',
          dateText: paragraphs[paragraphs.length - 1]?.textContent?.trim() ?? '',
        };
      })
      .filter((card) => card.href && card.title);
  }

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  // The listing lazy-loads more cards on scroll, with no "load more" button
  // or page numbers — scroll to the bottom repeatedly until the count of
  // distinct events stops growing across two consecutive attempts.
  let previousCount = -1;
  for (let attempt = 0; attempt < 15; attempt++) {
    const cards = readCards();
    if (cards.length === previousCount) break;
    previousCount = cards.length;
    window.scrollTo(0, document.body.scrollHeight);
    await wait(800);
  }

  return readCards();
}

// tsx/esbuild instruments function declarations with a `__name(fn, "name")`
// call to preserve `.name` at runtime. That helper only exists in this
// Node module's own scope — when Playwright serializes `fn.toString()` to
// run it inside the browser page, the leftover `__name(...)` calls throw
// `ReferenceError: __name is not defined` there. Rebuilding the function
// from its own (cleaned) source via the `Function` constructor produces a
// fresh function whose `toString()` has no such calls, since `__name(x, _)`
// always just returns `x` unchanged — safe to unwrap for real execution.
function browserSafeCollectCardsFromDom(): () => Promise<IngresseCard[]> {
  const cleanedSource = stripNameWrapper(collectCardsFromDom.toString());
  // eslint-disable-next-line no-new-func -- documented workaround above
  return new Function(`return (${cleanedSource})();`) as () => Promise<IngresseCard[]>;
}

// A plain regex can't safely strip `__name(EXPR, "name")` because EXPR can
// itself contain commas and parens (e.g. an arrow function with its own
// call expressions) — this walks the string tracking paren depth so it
// only splits EXPR from the trailing `, "name")` at the matching depth.
function stripNameWrapper(source: string): string {
  let result = '';
  let i = 0;
  while (i < source.length) {
    const start = source.indexOf('__name(', i);
    if (start === -1) {
      result += source.slice(i);
      break;
    }
    result += source.slice(i, start);
    let depth = 1;
    let j = start + '__name('.length;
    let splitAt = -1;
    while (j < source.length && depth > 0) {
      if (source[j] === '(') depth++;
      else if (source[j] === ')') depth--;
      else if (source[j] === ',' && depth === 1 && splitAt === -1) splitAt = j;
      j++;
    }
    const exprEnd = splitAt === -1 ? j - 1 : splitAt;
    result += source.slice(start + '__name('.length, exprEnd);
    i = j;
  }
  return result;
}
