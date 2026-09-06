import { describe, expect, it } from 'vitest';
import { parsePriceText } from '../../src/sources/sympla.price';

describe('parsePriceText', () => {
  it('parses a single price', () => {
    expect(parsePriceText('Ingresso único\nR$ 15,00\nComprar')).toBe(15);
  });

  it('parses the lowest of a price range', () => {
    expect(parsePriceText('R$ 15,00 a R$ 45,00')).toBe(15);
  });

  it('parses "a partir de"', () => {
    expect(parsePriceText('A partir de R$ 20,00')).toBe(20);
  });

  it('parses thousands separators', () => {
    expect(parsePriceText('R$ 1.234,56')).toBe(1234.56);
  });

  it('returns null when there is no price in the text', () => {
    expect(parsePriceText('Grátis\nVendas até 09/09/2026')).toBeNull();
  });
});
