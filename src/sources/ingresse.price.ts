export interface IngressePriceInfo {
  isFree: boolean;
  minPrice: number | null;
}

// The checkout page always shows "Subtotal R$ 0,00" before any ticket is
// selected — Sympla's generic parsePriceText (lowest R$ anywhere on the
// page) would misread that as a free event every time, so it can't be
// reused here. Instead, only "R$ X,XX" immediately followed by "+ taxas"
// is a real lot price on this checkout layout; the subtotal line never
// has that suffix.
const LOT_PRICE_PATTERN = /R\$\s*([\d.,]+)\s*\n?\s*\+\s*taxas/gi;

export function detectIngressePrice(text: string): IngressePriceInfo {
  const lotMatches = [...text.matchAll(LOT_PRICE_PATTERN)];
  if (lotMatches.length > 0) {
    const values = lotMatches.map((m) => parseFloat(m[1].replace(/\./g, '').replace(',', '.')));
    const minPrice = Math.min(...values);
    return { isFree: minPrice === 0, minPrice };
  }
  if (/gr[aá]tis|gratuito/i.test(text)) {
    return { isFree: true, minPrice: 0 };
  }
  return { isFree: false, minPrice: null };
}

// The checkout page's venue line reads "<Venue name> | <City>" (e.g.
// "Complexo Esportivo Melodia | Nova Friburgo"). Since this source only
// ever searches within the RJ state filter, falling back to "Rio de
// Janeiro" when the pattern isn't found is a safe default, not a guess.
export function extractIngresseCity(text: string): string {
  const match = text.match(/\|\s*([^\n]+)/);
  return match ? match[1].trim() : 'Rio de Janeiro';
}
