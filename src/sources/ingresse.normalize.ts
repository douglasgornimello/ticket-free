import type { NormalizedEvent } from '../lib/types';

export interface IngresseCard {
  href: string;
  title: string;
  imageUrl: string;
  dateText: string;
}

// Ingresse's own listing never shows price or checkout links directly —
// the real price lives on a separate checkout subdomain keyed by the
// event's numeric id, which happens to already be embedded in the
// poster image URL (".../event/posters/<id>/large/...") shown on every
// listing card. Extracting it here avoids an extra page visit just to
// discover it.
export function extractEventIdFromImageUrl(imageUrl: string): string | null {
  const match = imageUrl.match(/\/event\/posters\/(\d+)\//);
  return match ? match[1] : null;
}

export interface IngressePriceInfo {
  isFree: boolean;
  minPrice: number | null;
}

const MONTHS: Record<string, string> = {
  janeiro: '01',
  fevereiro: '02',
  março: '03',
  abril: '04',
  maio: '05',
  junho: '06',
  julho: '07',
  agosto: '08',
  setembro: '09',
  outubro: '10',
  novembro: '11',
  dezembro: '12',
};

// Parses Ingresse's listing date format ("8 de setembro de 2026") into
// midnight UTC of that day. The listing never includes a time of day (only
// the event's own detail page sometimes does, in free-form text), so this
// is a known precision limit for this source.
export function parsePtBrDate(text: string): Date | null {
  const match = text.match(/(\d{1,2}) de (\w+) de (\d{4})/i);
  if (!match) return null;
  const [, day, monthName, year] = match;
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  return new Date(`${year}-${month}-${day.padStart(2, '0')}T00:00:00Z`);
}

export function normalizeIngresseEvent(
  card: IngresseCard,
  priceInfo: IngressePriceInfo,
  city: string,
  now: Date = new Date(),
): NormalizedEvent {
  const externalId = card.href.replace(/^\/|\/$/g, '');
  return {
    id: `ingresse:${externalId}`,
    source: 'ingresse',
    externalId,
    title: card.title,
    imageUrl: card.imageUrl,
    date: parsePtBrDate(card.dateText) ?? now,
    city,
    uf: 'RJ',
    minPrice: priceInfo.minPrice,
    isFree: priceInfo.isFree,
    url: `https://www.ingresse.com/${externalId}/`,
    active: true,
    lastSeenAt: now,
  };
}
