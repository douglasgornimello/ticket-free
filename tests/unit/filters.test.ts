import { describe, expect, it } from 'vitest';
import { isEligible } from '../../src/lib/filters';
import type { NormalizedEvent } from '../../src/lib/types';

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'sympla:1',
    source: 'sympla',
    externalId: '1',
    title: 'Evento Teste',
    imageUrl: 'https://example.com/img.jpg',
    date: new Date('2026-12-01T20:00:00Z'),
    city: 'Rio de Janeiro',
    uf: 'RJ',
    minPrice: 0,
    isFree: true,
    url: 'https://example.com/evento/1',
    active: true,
    lastSeenAt: new Date(),
    ...overrides,
  };
}

describe('isEligible', () => {
  it('accepts a free RJ event', () => {
    expect(isEligible(makeEvent({ isFree: true, minPrice: 0 }))).toBe(true);
  });

  it('accepts a paid RJ event costing exactly R$20', () => {
    expect(isEligible(makeEvent({ isFree: false, minPrice: 20 }))).toBe(true);
  });

  it('rejects a paid RJ event costing R$20.01', () => {
    expect(isEligible(makeEvent({ isFree: false, minPrice: 20.01 }))).toBe(false);
  });

  it('rejects a paid RJ event costing R$25', () => {
    expect(isEligible(makeEvent({ isFree: false, minPrice: 25 }))).toBe(false);
  });

  it('rejects an event outside RJ even if free', () => {
    expect(isEligible(makeEvent({ uf: 'SP', isFree: true, minPrice: 0 }))).toBe(false);
  });

  it('rejects an event with no price information', () => {
    expect(isEligible(makeEvent({ isFree: false, minPrice: null }))).toBe(false);
  });

  it('accepts an event with RJ city but missing uf, via city fallback', () => {
    expect(
      isEligible(makeEvent({ uf: '', city: 'Nova Friburgo', isFree: true, minPrice: 0 })),
    ).toBe(true);
  });

  it('rejects an event with missing uf and a city not in RJ', () => {
    expect(
      isEligible(makeEvent({ uf: '', city: 'Belo Horizonte', isFree: true, minPrice: 0 })),
    ).toBe(false);
  });
});
