import { describe, expect, it } from 'vitest';
import { normalizeEbListResponse, type EbSearchResponse } from '../../src/sources/eventbrite.normalize';

const NOW = new Date('2026-09-07T12:00:00Z');

// Base de um evento válido do RJ grátis, no formato real da API da Eventbrite.
function rawEvent(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Curso de Networking',
    eventbrite_event_id: '1012564356247',
    start_date: '2026-09-20T18:00:00',
    primary_venue: {
      address: { city: 'Rio de Janeiro', region: 'RJ', country: 'BR' },
    },
    ticket_availability: {
      minimum_ticket_price: { currency: 'BRL', value: 0, display: '0.00 BRL' },
    },
    tickets_url: 'https://www.eventbrite.com/e/playground-checkout?eid=1012564356247',
    image: { url: 'https://img.evbuc.com/foto.png' },
    ...overrides,
  };
}

function responseWith(events: unknown[]): EbSearchResponse {
  return { events: { results: events as never } };
}

describe('normalizeEbListResponse', () => {
  it('inclui evento grátis do RJ', () => {
    const out = normalizeEbListResponse(responseWith([rawEvent()]), NOW);
    expect(out).toHaveLength(1);
    const e = out[0];
    expect(e.source).toBe('eventbrite');
    expect(e.externalId).toBe('1012564356247');
    expect(e.title).toBe('Curso de Networking');
    expect(e.isFree).toBe(true);
    expect(e.minPrice).toBe(0);
    expect(e.uf).toBe('RJ');
    expect(e.city).toBe('Rio de Janeiro');
    expect(e.id).toBe('eventbrite:1012564356247');
  });

  it('inclui evento pago até R$20 (2000 centavos)', () => {
    const ev = rawEvent({
      name: 'Workshop Leve',
      eventbrite_event_id: '999',
      ticket_availability: {
        minimum_ticket_price: { currency: 'BRL', value: 1500, display: '15.00 BRL' },
      },
    });
    const out = normalizeEbListResponse(responseWith([ev]), NOW);
    expect(out).toHaveLength(1);
    expect(out[0].isFree).toBe(false);
    expect(out[0].minPrice).toBe(15);
  });

  it('descarta evento pago acima de R$20', () => {
    const ev = rawEvent({
      ticket_availability: {
        minimum_ticket_price: { currency: 'BRL', value: 2500, display: '25.00 BRL' },
      },
    });
    expect(normalizeEbListResponse(responseWith([ev]), NOW)).toHaveLength(0);
  });

  it('descarta evento em moeda não-BRL (ex.: USD) mesmo que "barato"', () => {
    const ev = rawEvent({
      ticket_availability: {
        minimum_ticket_price: { currency: 'USD', value: 1500, display: '15.00 USD' },
      },
    });
    expect(normalizeEbListResponse(responseWith([ev]), NOW)).toHaveLength(0);
  });

  it('descarta evento fora do RJ (outro estado)', () => {
    const ev = rawEvent({
      primary_venue: { address: { city: 'Belo Horizonte', region: 'Minas Gerais', country: 'BR' } },
    });
    expect(normalizeEbListResponse(responseWith([ev]), NOW)).toHaveLength(0);
  });

  it('aceita evento sem region explícita mas com cidade contendo "Rio"', () => {
    const ev = rawEvent({
      primary_venue: { address: { city: 'Rio das Ostras', region: '', country: 'BR' } },
    });
    expect(normalizeEbListResponse(responseWith([ev]), NOW)).toHaveLength(1);
  });

  it('descarta evento sem preço disponível', () => {
    const ev = rawEvent({ ticket_availability: { minimum_ticket_price: undefined } });
    expect(normalizeEbListResponse(responseWith([ev]), NOW)).toHaveLength(0);
  });

  it('descarta evento sem id', () => {
    const ev = rawEvent({ eventbrite_event_id: undefined });
    expect(normalizeEbListResponse(responseWith([ev]), NOW)).toHaveLength(0);
  });
});
