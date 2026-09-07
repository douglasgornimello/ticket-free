import { describe, expect, it } from 'vitest';
import {
  extractEventIdFromImageUrl,
  normalizeIngresseEvent,
  parsePtBrDate,
  type IngresseCard,
} from '../../src/sources/ingresse.normalize';

const NOW = new Date('2026-09-06T12:00:00Z');

describe('parsePtBrDate', () => {
  it('parses a Portuguese long-form date into midnight UTC of that day', () => {
    expect(parsePtBrDate('8 de setembro de 2026')).toEqual(new Date('2026-09-08T00:00:00Z'));
  });

  it('parses a single-digit day without leading zero', () => {
    expect(parsePtBrDate('1 de janeiro de 2027')).toEqual(new Date('2027-01-01T00:00:00Z'));
  });

  it('returns null for unparseable text', () => {
    expect(parsePtBrDate('data a confirmar')).toBeNull();
  });
});

describe('extractEventIdFromImageUrl', () => {
  it('extracts the numeric event id from a poster URL', () => {
    expect(
      extractEventIdFromImageUrl(
        'https://kraken.ingresse.com/event/posters/105608/large/1788383091.7799504.jpg',
      ),
    ).toBe('105608');
  });

  it('returns null when the URL does not match the poster pattern', () => {
    expect(extractEventIdFromImageUrl('https://example.com/other.jpg')).toBeNull();
  });
});

describe('normalizeIngresseEvent', () => {
  it('normalizes a card plus price info into a NormalizedEvent', () => {
    const card: IngresseCard = {
      href: '/one-night-with-lauren-jauregui-in-rio-de-janeiro/',
      title: 'ONE NIGHT WITH LAUREN JAUREGUI IN RIO DE JANEIRO',
      imageUrl: 'https://kraken.ingresse.com/event/posters/105608/large/1788383091.jpg',
      dateText: '10 de setembro de 2026',
    };

    const result = normalizeIngresseEvent(
      card,
      { isFree: false, minPrice: 15 },
      'Rio de Janeiro',
      NOW,
    );

    expect(result).toEqual({
      id: 'ingresse:one-night-with-lauren-jauregui-in-rio-de-janeiro',
      source: 'ingresse',
      externalId: 'one-night-with-lauren-jauregui-in-rio-de-janeiro',
      title: 'ONE NIGHT WITH LAUREN JAUREGUI IN RIO DE JANEIRO',
      imageUrl: 'https://kraken.ingresse.com/event/posters/105608/large/1788383091.jpg',
      date: new Date('2026-09-10T00:00:00Z'),
      city: 'Rio de Janeiro',
      uf: 'RJ',
      minPrice: 15,
      isFree: false,
      url: 'https://www.ingresse.com/one-night-with-lauren-jauregui-in-rio-de-janeiro/',
      active: true,
      lastSeenAt: NOW,
    });
  });

  it('strips a trailing slash from the href to build a stable externalId', () => {
    const card: IngresseCard = {
      href: '/guapo-6-anos-rio-de-janeiro/',
      title: 'GUAPO 6 AÑOS - RIO DE JANEIRO',
      imageUrl: 'https://example.com/img.jpg',
      dateText: '30 de dezembro de 2026',
    };

    const result = normalizeIngresseEvent(card, { isFree: true, minPrice: 0 }, 'Rio de Janeiro', NOW);

    expect(result.externalId).toBe('guapo-6-anos-rio-de-janeiro');
    expect(result.id).toBe('ingresse:guapo-6-anos-rio-de-janeiro');
  });
});
