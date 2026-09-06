export interface NormalizedEvent {
  id: string;
  source: string;
  externalId: string;
  title: string;
  imageUrl: string;
  date: Date;
  city: string;
  uf: string;
  minPrice: number | null;
  isFree: boolean;
  url: string;
  active: boolean;
  lastSeenAt: Date;
}
