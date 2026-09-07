import type { NormalizedEvent } from '../lib/types';

// Estrutura mínima dos objetos retornados por
// POST https://www.eventbrite.com/api/v3/destination/search/
// (capturados via Playwright ao abrir a página de busca de eventos grátis).
export interface EbRawEvent {
  name: string;
  eventbrite_event_id: string;
  start_date: string;
  end_date?: string;
  primary_venue?: {
    address?: {
      city?: string;
      region?: string; // "RJ"
      country?: string; // "BR"
    };
  };
  ticket_availability?: {
    minimum_ticket_price?: {
      currency?: string; // "BRL" | "USD" | ...
      value?: number; // preço em centavos (0 = grátis)
    };
  };
  tickets_url?: string;
  image?: { url?: string };
}

export interface EbSearchResponse {
  events?: {
    results?: EbRawEvent[];
  };
}

export interface EbPriceInfo {
  isFree: boolean;
  minPrice: number | null;
}

const RJ_UF = ['RJ'];

function isInRio(raw: EbRawEvent): boolean {
  const region = raw.primary_venue?.address?.region ?? '';
  const country = raw.primary_venue?.address?.country ?? '';
  // Evento do Brasil com região RJ. Aceita variações de case/acento.
  return country.toUpperCase() === 'BR' || RJ_UF.includes(region.toUpperCase());
}

export function normalizeEbEvent(
  raw: EbRawEvent,
  priceInfo: EbPriceInfo,
  now: Date = new Date(),
): NormalizedEvent | null {
  const externalId = String(raw.eventbrite_event_id ?? '');
  if (!externalId) return null;

  const address = raw.primary_venue?.address ?? {};
  const city = address.city ?? '';
  const uf = address.region ?? '';

  // Filtro de estado: só RJ (fallback para cidade contendo 'Rio').
  if (!RJ_UF.includes(uf.toUpperCase()) && !/rio/i.test(city)) return null;

  const imageUrl =
    raw.image?.url ?? // campo estruturado
    ''; // sem imagem: homepage trata como placeholder
  const fallbackUrl = `https://www.eventbrite.com/e/${externalId}`;
  const date = raw.start_date ? new Date(raw.start_date) : new Date(NaN);

  return {
    id: `eventbrite:${externalId}`,
    source: 'eventbrite',
    externalId,
    title: raw.name ?? '',
    imageUrl,
    date,
    city,
    uf,
    minPrice: priceInfo.minPrice,
    isFree: priceInfo.isFree,
    url: raw.tickets_url ?? fallbackUrl,
    active: true,
    lastSeenAt: now,
  };
}

export function normalizeEbListResponse(
  response: EbSearchResponse,
  now: Date = new Date(),
): NormalizedEvent[] {
  const events = response?.events?.results ?? [];
  const out: NormalizedEvent[] = [];
  for (const raw of events) {
    const price = raw.ticket_availability?.minimum_ticket_price;
    const currency = (price?.currency ?? '').toUpperCase();
    // Ignora eventos sem preço em BRL ou acima de R$20 (2000 centavos).
    // Grátis (0) entra mesmo sem BRL explicito — assume grátis.
    const valueCents = price?.value;
    let isFree: boolean;
    let minPrice: number | null;
    if (valueCents == null) continue; // sem preço disponível, não dá pra avaliar
    if (valueCents === 0) {
      isFree = true;
      minPrice = 0;
    } else {
      if (currency && currency !== 'BRL') continue; // evita USD etc. inflando
      if (valueCents > 2000) continue; // acima de R$20
      isFree = false;
      minPrice = valueCents / 100;
    }
    const ev = normalizeEbEvent(raw, { isFree, minPrice }, now);
    if (ev) out.push(ev);
  }
  return out;
}
