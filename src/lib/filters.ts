import { RJ_CITIES } from './rjCities';
import type { NormalizedEvent } from './types';

const MAX_PRICE = 20;

export function isEligible(event: NormalizedEvent): boolean {
  const isRJ = event.uf === 'RJ' || (event.uf === '' && RJ_CITIES.includes(event.city));
  if (!isRJ) return false;

  if (event.isFree) return true;
  if (event.minPrice === null) return false;
  return event.minPrice <= MAX_PRICE;
}
