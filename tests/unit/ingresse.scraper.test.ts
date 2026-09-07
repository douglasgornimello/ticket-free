import { describe, expect, it } from 'vitest';
import { scrapeIngresse, type IngressePage } from '../../src/sources/ingresse';
import type { IngresseCard } from '../../src/sources/ingresse.normalize';

const NOW = new Date('2026-09-06T12:00:00Z');

const CARDS: IngresseCard[] = [
  {
    href: '/evento-gratis/',
    title: 'Evento Grátis',
    imageUrl: 'https://kraken.ingresse.com/event/posters/1001/large/x.jpg',
    dateText: '10 de setembro de 2026',
  },
  {
    href: '/evento-barato/',
    title: 'Evento Barato',
    imageUrl: 'https://kraken.ingresse.com/event/posters/1002/large/x.jpg',
    dateText: '11 de setembro de 2026',
  },
  {
    href: '/evento-caro/',
    title: 'Evento Caro',
    imageUrl: 'https://kraken.ingresse.com/event/posters/1003/large/x.jpg',
    dateText: '12 de setembro de 2026',
  },
  {
    href: '/evento-quebrado/',
    title: 'Evento Quebrado',
    imageUrl: 'https://kraken.ingresse.com/event/posters/1004/large/x.jpg',
    dateText: '13 de setembro de 2026',
  },
  {
    href: '/evento-sem-id/',
    title: 'Evento Sem Id',
    imageUrl: 'https://example.com/no-id-pattern.jpg',
    dateText: '14 de setembro de 2026',
  },
];

const CHECKOUT_TEXT: Record<string, string> = {
  'https://embedstore.ingresse.com/tickets/ingresse.com/event/1001?redirect=true&eventid=1001&client=new-site':
    'Evento Grátis\nClube da Praia | Rio de Janeiro\nEntrada Grátis',
  'https://embedstore.ingresse.com/tickets/ingresse.com/event/1002?redirect=true&eventid=1002&client=new-site':
    'Evento Barato\nBar do Zé | Niterói\nPISTA: R$ 15,00\n+ taxas',
  'https://embedstore.ingresse.com/tickets/ingresse.com/event/1003?redirect=true&eventid=1003&client=new-site':
    'Evento Caro\nArena Grande | Rio de Janeiro\nPISTA: R$ 300,00\n+ taxas',
};

function makeFakePage(): IngressePage {
  const visited: string[] = [];
  return {
    async goto(url: string) {
      visited.push(url);
    },
    async evaluate<T>(): Promise<T> {
      return CARDS as unknown as T;
    },
    async waitForTimeout() {},
    locator() {
      return {
        async innerText() {
          const url = visited[visited.length - 1];
          if (url.includes('/event/1004')) throw new Error('navigation timeout');
          return CHECKOUT_TEXT[url] ?? '';
        },
      };
    },
  };
}

describe('scrapeIngresse', () => {
  it('keeps free and cheap-paid events, drops expensive ones, skips a broken checkout page, and skips a card with no extractable id', async () => {
    const page = makeFakePage();

    const events = await scrapeIngresse(page, NOW);

    expect(events).toHaveLength(2);
    expect(events.map((e) => e.externalId)).toEqual(['evento-gratis', 'evento-barato']);
    expect(events[0]).toMatchObject({ isFree: true, minPrice: 0, city: 'Rio de Janeiro' });
    expect(events[1]).toMatchObject({ isFree: false, minPrice: 15, city: 'Niterói' });
  });

  it('visits the search URL for the RJ state filter, then each event checkout URL by numeric id', async () => {
    const page = makeFakePage();
    const gotoUrls: string[] = [];
    const originalGoto = page.goto.bind(page);
    page.goto = async (url: string) => {
      gotoUrls.push(url);
      await originalGoto(url);
    };

    await scrapeIngresse(page, NOW);

    expect(gotoUrls[0]).toBe('https://www.ingresse.com/search/?location=BRA-RJ&language=pt_br');
    expect(gotoUrls).toContain(
      'https://embedstore.ingresse.com/tickets/ingresse.com/event/1001?redirect=true&eventid=1001&client=new-site',
    );
  });
});
