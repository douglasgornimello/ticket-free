import { describe, expect, it, vi } from 'vitest';
import { scrapeSympla, type SymplaPage } from '../../src/sources/sympla';
import fixture from '../../fixtures/sympla-search-response.json';

const NOW = new Date('2026-09-05T12:00:00Z');

function jsonResponse(body: unknown) {
  return { json: async () => body };
}

/**
 * Fake `SymplaPage` modeling the real site's ambiguity:
 *  - "Preço" appears once, visible (the button), with a bounding box.
 *  - "Grátis"/"Pago" appear as BOTH a nav `<A href>` link (visible dropdown
 *    opener variant) and a real `<DIV>` option (href=null). The DIV is the
 *    one that triggers the search. The scraper must pick the DIV.
 *  - `mouse.click(x,y)` records coordinates so the test can assert the
 *    real-mouse path was used (not Playwright's locator .click()).
 */
function makeFakePage(
  paidEventPriceTexts: Record<string, string>,
  {
    visibleByLabel = ['Preço', 'Grátis', 'Pago'],
    navHrefByLabel = { 'Grátis': 'https://www.sympla.com.br/eventos/gratis', 'Pago': 'https://www.sympla.com.br/eventos/pagos' },
    paidCandidates = [fixture.data[1]],
    throwingUrls = [],
  }: {
    visibleByLabel?: string[];
    navHrefByLabel?: Record<string, string>;
    paidCandidates?: unknown[];
    throwingUrls?: string[];
  } = {},
): SymplaPage {
  const clicked: string[] = [];
  const mouseClicks: Array<[number, number]> = [];
  const visited: string[] = [];

  const freeResponse = jsonResponse({ data: [fixture.data[0]] });
  const paidResponse = jsonResponse({ data: paidCandidates });

  let callCount = 0;

  // One match per element type per label. "Preço" has a single visible element
  // (the button, no href). "Grátis"/"Pago" have a nav `<A>` + a `<DIV>` option.
  function buildMatches(text: string): Array<{ href: string | null; visible: boolean }> {
    if (text === 'Preço') return [{ href: null, visible: true }];
    // ordered: nav link first, then dropdown DIV (href null)
    return [
      { href: navHrefByLabel[text] ?? null, visible: false }, // nav <A> — hidden
      { href: null, visible: visibleByLabel.includes(text) }, // dropdown <DIV>
    ];
  }

  return {
    async goto(url: string) {
      visited.push(url);
    },
    getByText(text: string, opts?: { exact?: boolean }) {
      const matches = buildMatches(text);
      return {
        async count() {
          return matches.length;
        },
        nth(i: number) {
          const m = matches[i] ?? { href: null, visible: false };
          return {
            async isVisible() {
              return m.visible;
            },
            async boundingBox() {
              return m.visible ? { x: 10 + i * 50, y: 20 + i * 50, width: 60, height: 24 } : null;
            },
            async getAttribute(name: string) {
              return name === 'href' ? m.href : null;
            },
          };
        },
      };
    },
    mouse: {
      async click(x, y) {
        mouseClicks.push([x, y]);
      },
    },
    async waitForSelector() {
      return true;
    },
    async waitForTimeout() {},
    async waitForResponse(predicate) {
      const matchingResponse = {
        url: () => 'https://www.sympla.com.br/api/discovery-bff/search/category-type',
        request: () => ({ method: () => 'POST' }),
      };
      const wrongUrlResponse = {
        url: () => 'https://www.sympla.com.br/api/discovery-bff/search/other-endpoint',
        request: () => ({ method: () => 'POST' }),
      };
      const wrongMethodResponse = {
        url: () => 'https://www.sympla.com.br/api/discovery-bff/search/category-type',
        request: () => ({ method: () => 'GET' }),
      };

      if (!predicate(matchingResponse)) throw new Error('predicate should match category-type POST');
      if (predicate(wrongUrlResponse)) throw new Error('predicate should reject wrong URL');
      if (predicate(wrongMethodResponse)) throw new Error('predicate should reject non-POST');

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

  it('uses real-mouse clicks (page.mouse) for the price button and dropdown options', async () => {
    const page = makeFakePage({});
    const mouseSpy = vi.spyOn(page.mouse, 'click');

    await scrapeSympla(page, NOW);

    // The dropdown DIV opens Preço (1 click) + Grátis option + Pago option.
    expect(mouseSpy).toHaveBeenCalled();
    // And clicks happened at coordinate centers (real-mouse path).
    const coords = mouseSpy.mock.calls;
    expect(coords.length).toBeGreaterThanOrEqual(3);
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

    expect(events.map((event) => event.externalId).sort()).toEqual(
      ['3563267', '50118528'].sort(),
    );
  });

  it('retries when the price filter does not appear, and succeeds on a later attempt', async () => {
    const page = makeFakePage({});
    let call = 0;
    page.waitForSelector = async () => {
      call += 1;
      if (call === 1) throw new Error('sympla: price filter "Preço" did not appear');
      return undefined;
    };

    await scrapeSympla(page, NOW, 2);
    expect(call).toBeGreaterThanOrEqual(2);
  });
});