import { normalizeEbListResponse, type EbSearchResponse } from './eventbrite.normalize';
import type { NormalizedEvent } from '../lib/types';

const RJ_FREE_URL =
  'https://www.eventbrite.com/d/brazil--rio-de-janeiro/free--events/';

// Minimal Playwright surface this source needs. Reuses the same shape as the
// Sympla source so `scripts/scan.ts` can build one adapter of type Page.
export interface EventbritePage {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
  waitForSelector(selector: string, opts?: { timeout?: number; state?: string }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  // Escuta TODAS as respostas do endpoint de busca; o scraper pega a última
  // com dados (a primeira pode ser um request de log/telemetria sem eventos).
  onResponseFetch(
    handler: (response: { status(): number; url(): string; json(): Promise<unknown> }) => void,
  ): { dispose(): void };
}

export async function scrapeEventbrite(
  page: EventbritePage,
  now: Date = new Date(),
  retries = 5,
): Promise<NormalizedEvent[]> {
  for (let attempt = 1; ; attempt++) {
    // Coleta respostas do endpoint de busca durante a navegação.
    const responses: Array<{ status(): number; json(): Promise<unknown> }> = [];
    const sub = page.onResponseFetch((response) => {
      if (response.url().includes('/api/v3/destination/search/')) {
        responses.push(response);
      }
    });

    try {
      await page.goto(RJ_FREE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('a.event-card-link', {
        state: 'attached',
        timeout: 30000,
      });
      // pequena espera pra garantir que a última resposta chegou
      await page.waitForTimeout(1500);

      // Pega a última resposta com dados (as primeiras podem ser vazias/telemetria).
      let events: NormalizedEvent[] = [];
      for (let i = responses.length - 1; i >= 0; i--) {
        try {
          const json = (await responses[i].json()) as Record<string, unknown>;
          if (json && typeof json === 'object' && Object.keys(json).length > 0) {
            const normalized = normalizeEbListResponse(json as EbSearchResponse, now);
            if (normalized.length > 0) {
              events = normalized;
              break;
            }
          }
        } catch {
          // tenta a anterior
        }
      }

      if (events.length === 0) {
        throw new Error('eventbrite: nenhuma resposta com eventos normalizáveis');
      }
      return events;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/timeout|closed|rate.?limit|429|nenhuma resposta/i.test(msg) && attempt < retries) {
        const waitMs = 4000 * attempt;
        console.warn(`eventbrite: attempt ${attempt}/${retries} failed (${msg}); retrying in ${waitMs}ms`);
        await page.waitForTimeout(waitMs);
        continue;
      }
      throw error;
    } finally {
      sub.dispose();
    }
  }
}
