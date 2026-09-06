import type { NormalizedEvent } from '../lib/types';

export interface SymplaRawEvent {
  id: number;
  name: string;
  url: string;
  start_date: string;
  images: { original: string };
  location: { city: string; state?: string };
}

export interface SymplaListResponse {
  data: SymplaRawEvent[];
}

export interface SymplaPriceInfo {
  isFree: boolean;
  minPrice: number | null;
}

export function normalizeSymplaEvent(
  raw: SymplaRawEvent,
  priceInfo: SymplaPriceInfo,
  now: Date = new Date(),
): NormalizedEvent {
  const externalId = String(raw.id);
  return {
    id: `sympla:${externalId}`,
    source: 'sympla',
    externalId,
    title: raw.name,
    imageUrl: raw.images.original,
    date: new Date(raw.start_date),
    city: raw.location.city,
    uf: raw.location.state ?? '',
    minPrice: priceInfo.minPrice,
    isFree: priceInfo.isFree,
    url: raw.url,
    active: true,
    lastSeenAt: now,
  };
}

export function normalizeSymplaListResponse(
  response: SymplaListResponse,
  priceInfo: SymplaPriceInfo,
  now: Date = new Date(),
): NormalizedEvent[] {
  return response.data
    .filter((raw) => Boolean(raw.location.state))
    .map((raw) => normalizeSymplaEvent(raw, priceInfo, now));
}
