import { describe, expect, it } from 'vitest';
import { detectIngressePrice, extractIngresseCity } from '../../src/sources/ingresse.price';

describe('detectIngressePrice', () => {
  it('detects a free event from "Grátis" text with no lot price at all', () => {
    expect(detectIngressePrice('Ingresso: Grátis\nEntrada livre')).toEqual({
      isFree: true,
      minPrice: 0,
    });
  });

  it('detects "gratuito" too', () => {
    expect(detectIngressePrice('Evento gratuito, sujeito à lotação')).toEqual({
      isFree: true,
      minPrice: 0,
    });
  });

  it('picks the lowest lot price ("R$ X + taxas"), ignoring the cart subtotal', () => {
    // Real checkout pages always show "Subtotal R$ 0,00" before any ticket
    // is selected — that must never be read as the event's price.
    const text =
      'Detalhes da compra\nSubtotal\nR$ 0,00\nProsseguir\nPISTA\n3° Lote\nR$ 40,00\n+ taxas\nVIP\n1° Lote\nR$ 25,00\n+ taxas';
    expect(detectIngressePrice(text)).toEqual({ isFree: false, minPrice: 25 });
  });

  it('treats a R$ 0,00 lot price (not the subtotal) as free', () => {
    const text = 'Subtotal\nR$ 0,00\nProsseguir\nENTRADA\n1° Lote\nR$ 0,00\n+ taxas';
    expect(detectIngressePrice(text)).toEqual({ isFree: true, minPrice: 0 });
  });

  it('returns null minPrice when no lot price or "grátis" text is found at all', () => {
    expect(detectIngressePrice('Ingressos esgotados\nEntre na lista de espera')).toEqual({
      isFree: false,
      minPrice: null,
    });
  });
});

describe('extractIngresseCity', () => {
  it('extracts the city after the "|" on the checkout page\'s venue line', () => {
    const text = 'Nosso Domingo\nComplexo Esportivo Melodia | Nova Friburgo\nVer página do evento';
    expect(extractIngresseCity(text)).toBe('Nova Friburgo');
  });

  it('falls back to "Rio de Janeiro" when no venue-line pattern is found', () => {
    expect(extractIngresseCity('sem local nesta página')).toBe('Rio de Janeiro');
  });
});
