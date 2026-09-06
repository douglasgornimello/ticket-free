import { describe, expect, it } from 'vitest';
import {
  normalizeSymplaEvent,
  normalizeSymplaListResponse,
  type SymplaListResponse,
} from '../../src/sources/sympla.normalize';
import fixture from '../../fixtures/sympla-search-response.json';

const NOW = new Date('2026-09-05T12:00:00Z');

describe('normalizeSymplaEvent', () => {
  it('normalizes a single well-formed raw event as free', () => {
    const raw = (fixture as SymplaListResponse).data[0];
    const result = normalizeSymplaEvent(raw, { isFree: true, minPrice: 0 }, NOW);

    expect(result).toEqual({
      id: 'sympla:50118528',
      source: 'sympla',
      externalId: '50118528',
      title: 'PEARL JAM SYMPHONIC COM BLACK CIRCLE + NOVA ORQUESTRA',
      imageUrl:
        'https://assets.bileto.sympla.com.br/eventmanager/production/2cn1m6ugsm3pdnmtb50mq12dngujvifa66ntmeatepci1glv2779tpj8uemrfd8g4j6usvsnebk1qgqfjpfahbortv7e6gmqn37cnoe.jpeg',
      date: new Date('2026-11-02T23:00:00+00:00'),
      city: 'Rio de Janeiro',
      uf: 'RJ',
      minPrice: 0,
      isFree: true,
      url: 'https://bileto.sympla.com.br/event/118528',
      active: true,
      lastSeenAt: NOW,
    });
  });

  it('normalizes a paid candidate with minPrice null until priced', () => {
    const raw = (fixture as SymplaListResponse).data[1];
    const result = normalizeSymplaEvent(raw, { isFree: false, minPrice: null }, NOW);

    expect(result.isFree).toBe(false);
    expect(result.minPrice).toBeNull();
    expect(result.id).toBe('sympla:3563267');
  });
});

describe('normalizeSymplaListResponse', () => {
  it('normalizes all well-formed events and skips ones missing location.state', () => {
    const results = normalizeSymplaListResponse(
      fixture as SymplaListResponse,
      { isFree: true, minPrice: 0 },
      NOW,
    );

    expect(results).toHaveLength(2);
    expect(results.map((e) => e.externalId)).toEqual(['50118528', '3563267']);
  });
});
