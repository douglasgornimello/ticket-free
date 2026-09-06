import { describe, expect, it, vi } from 'vitest';
import { scrapeSympla, type SymplaPage } from '../../src/sources/sympla';
import fixture from '../../fixtures/sympla-search-response.json';

const NOW = new Date('2026-09-05T12:00:00Z');

function jsonResponse(body: unknown) {
  return { json: async () => body };
}

interface MakeFakePageOptions {
  /** Raw events returned as "Pago" candidates. Defaults to fixture.data[1]. */
  paidCandidates?: unknown[];
  /** Detail-page URLs whose innerText() call should throw instead of resolving. */
  throwingUrls?: string[];
}

function makeFakePage(
  paidEventPriceTexts: Record<string, string>,
  { paidCandidates = [fixture.data[1]], throwingUrls = [] }: MakeFakePageOptions = {},
): SymplaPage {
  const clicked: string[] = [];
  const visited: string[] = [];

  const freeResponse = jsonResponse({ data: [fixture.data[0]] });
  const paidResponse = jsonResponse({ data: paidCandidates });

  let callCount = 0;

  return {
    async goto(url: string) {
      visited.push(url);
    },
    getByText(text: string) {
      return {
        async click() {
          clicked.push(text);
        },
      };
    },
    async waitForResponse(predicate) {
      // Exercise the real predicate from src/sources/sympla.ts against
      // stub responses, so a bug in the URL/method matching (e.g. wrong
      // URL fragment or wrong HTTP method check) would fail this test
      // instead of going unnoticed because the fake ignored `predicate`.
      const matchingResponse = {
        url: () => 'https://www.sympla.com.br/discovery-bff/search/category-type',
        request: () => ({ method: () => 'POST' }),
      };
      const wrongUrlResponse = {
        url: () => 'https://www.sympla.com.br/discovery-bff/search/other-endpoint',
        request: () => ({ method: () => 'POST' }),
      };
      const wrongMethodResponse = {
        url: () => 'https://www.sympla.com.br/discovery-bff/search/category-type',
        request: () => ({ method: () => 'GET' }),
      };

      if (!predicate(matchingResponse)) {
        throw new Error('predicate should match a category-type POST response');
      }
      if (predicate(wrongUrlResponse)) {
        throw new Error('predicate should reject a response with the wrong URL');
      }
      if (predicate(wrongMethodResponse)) {
        throw new Error('predicate should reject a non-POST response');
      }

      callCount += 1;
      return callCount === 1 ? freeResponse : paidResponse;
    },
    locator() {
      return {
        async innerText() {
          const eventUrl = visited[visited.length - 1];
          if (throwingUrls.includes(eventUrl)) {
            throw new Error(`failed to load detail page: ${eventUrl}`);
          }
          return paidEventPriceTexts[eventUrl] ?? '';
        },
      };
    },
  };
}

describe('scrapeSympla', () => {
  it('returns free events as-is and cheap paid events priced from their detail page', async () => {
    const page = makeFakePage({
      'https://www.sympla.com.br/evento/conservacao-e-adaptacao-gestao-de-acervos-tecnologicos/3563267':
        'R$ 15,00',
    });

    const events = await scrapeSympla(page, NOW);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ externalId: '50118528', isFree: true, minPrice: 0 });
    expect(events[1]).toMatchObject({ externalId: '3563267', isFree: false, minPrice: 15 });
  });

  it('drops paid candidates priced above R$20', async () => {
    const page = makeFakePage({
      'https://www.sympla.com.br/evento/conservacao-e-adaptacao-gestao-de-acervos-tecnologicos/3563267':
        'R$ 45,00',
    });

    const events = await scrapeSympla(page, NOW);

    expect(events).toHaveLength(1);
    expect(events[0].externalId).toBe('50118528');
  });

  it('skips a paid candidate whose detail-page visit throws, without losing free events or other candidates', async () => {
    const okUrl =
      'https://www.sympla.com.br/evento/conservacao-e-adaptacao-gestao-de-acervos-tecnologicos/3563267';
    const failingCandidate = {
      id: 777777,
      name: 'Evento Pago Que Falha',
      url: 'https://www.sympla.com.br/evento/falha/777777',
      start_date: '2026-09-10T22:00:00+00:00',
      images: { original: 'https://images.sympla.com.br/falha.png' },
      location: { city: 'Rio de Janeiro', state: 'RJ' },
    };

    const page = makeFakePage(
      { [okUrl]: 'R$ 15,00' },
      {
        paidCandidates: [fixture.data[1], failingCandidate],
        throwingUrls: [failingCandidate.url],
      },
    );

    const events = await scrapeSympla(page, NOW);

    // Free event (50118528) plus the one paid candidate that resolved
    // (3563267); the failing candidate (777777) is skipped, not thrown.
    expect(events.map((event) => event.externalId).sort()).toEqual(
      ['3563267', '50118528'].sort(),
    );
  });

  it('clicks the Preço filter and both price options', async () => {
    const page = makeFakePage({});
    const clickSpy = vi.spyOn(page, 'getByText');

    await scrapeSympla(page, NOW);

    const clickedLabels = clickSpy.mock.calls.map((call) => call[0]);
    expect(clickedLabels).toContain('Preço');
    expect(clickedLabels).toContain('Grátis');
    expect(clickedLabels).toContain('Pago');
  });
});
