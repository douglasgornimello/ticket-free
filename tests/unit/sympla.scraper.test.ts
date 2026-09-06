import { describe, expect, it, vi } from 'vitest';
import { scrapeSympla, type SymplaPage } from '../../src/sources/sympla';
import fixture from '../../fixtures/sympla-search-response.json';

const NOW = new Date('2026-09-05T12:00:00Z');

function jsonResponse(body: unknown) {
  return { json: async () => body };
}

function makeFakePage(paidEventPriceTexts: Record<string, string>): SymplaPage {
  const clicked: string[] = [];
  const visited: string[] = [];

  const freeResponse = jsonResponse({ data: [fixture.data[0]] });
  const paidResponse = jsonResponse({ data: [fixture.data[1]] });

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
    async waitForResponse() {
      callCount += 1;
      return callCount === 1 ? freeResponse : paidResponse;
    },
    locator() {
      return {
        async innerText() {
          const eventUrl = visited[visited.length - 1];
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
