# ticket-free MVP (Sympla end-to-end) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the full pipeline (scrape → filter → store → display →
cron) working end-to-end for one source (Sympla), so the homepage at
`dmticket-free.vercel.app` shows free and ≤R$20 events in the state of
Rio de Janeiro pulled from Sympla, refreshed every 6h.

**Architecture:** Next.js (App Router, TS) deployed to Vercel serves
the homepage, reading events from Postgres. A separate script
(`scripts/scan.ts`), run on a GitHub Actions cron every 6h, drives a
headless Playwright browser against sympla.com.br, clicks the site's
own price filter ("Grátis" / "Pago"), intercepts the resulting network
response, and — for cheap-paid candidates — visits each event's detail
page to read the rendered ticket price. Normalized events are upserted
into Postgres; the homepage never touches Playwright or the network.

**Tech Stack:** Next.js 15 (App Router, TypeScript), React 19, `pg`
(node-postgres) against Vercel Postgres, `playwright` (chromium),
Vitest + `pg-mem` + React Testing Library for tests, `tsx` to run
scripts, GitHub Actions for the scan cron.

**Spec:** [docs/superpowers/specs/2026-09-05-ticket-free-design.md](../specs/2026-09-05-ticket-free-design.md)

## Global Constraints

- Deploy target: Vercel project `dmticket-free` (free subdomain
  `dmticket-free.vercel.app`, no paid custom domain).
- Storage: Vercel Postgres, accessed via a standard `DATABASE_URL`
  connection string and the `pg` driver (not the `@vercel/postgres`
  wrapper) — keeps the code testable with `pg-mem`.
- MVP scope: **Sympla only**. Other sources (Ingresse, Ingresso.com,
  Eventbrite, Even3/Bileto) are explicitly out of scope for this plan;
  each gets its own short spec/plan later that reuses this
  infrastructure (`sources/<name>.ts` implementing the same shape as
  `sources/sympla.ts`).
- Price rule: event qualifies if `isFree === true` OR
  `minPrice <= 20`. Events with no price information are dropped, not
  shown.
- State rule: event qualifies only if `uf === 'RJ'`.
- Package manager: npm.
- No `next/image` — use plain `<img>` tags (avoids remote-image-domain
  allowlist config; out of scope for MVP).

---

### Task 1: Project scaffold + types + RJ eligibility filter

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `next-env.d.ts`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/lib/types.ts`
- Create: `src/lib/rjCities.ts`
- Create: `src/lib/filters.ts`
- Test: `tests/unit/filters.test.ts`

**Interfaces:**
- Produces: `NormalizedEvent` type (`src/lib/types.ts`), used by every
  later task.
- Produces: `isEligible(event: NormalizedEvent): boolean`
  (`src/lib/filters.ts`), used by `eventsStore.getEligibleEvents` (Task
  5, as the reference for the SQL WHERE clause) and directly by tests.
- Produces: `RJ_CITIES: readonly string[]` (`src/lib/rjCities.ts`).

- [ ] **Step 1: Init npm project and directories**

```bash
npm init -y
mkdir -p src/lib src/sources src/components src/app scripts tests/unit tests/component fixtures .github/workflows
```

- [ ] **Step 2: Install dependencies**

```bash
npm install next@^15 react@^19 react-dom@^19 pg playwright
npm install -D typescript @types/node @types/react @types/react-dom @types/pg vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom pg-mem tsx
```

- [ ] **Step 3: Write `package.json` scripts**

Edit `package.json`, replace the `"scripts"` block with:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "scan": "tsx scripts/scan.ts"
  }
}
```

- [ ] **Step 4: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Write `next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 6: Write `next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 7: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 8: Write `.gitignore`**

```
node_modules
.next
.env
.env.local
```

- [ ] **Step 9: Write `src/lib/types.ts`**

```ts
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
```

- [ ] **Step 10: Write `src/lib/rjCities.ts`**

```ts
// 92 municípios do estado do Rio de Janeiro (IBGE).
export const RJ_CITIES: readonly string[] = [
  'Angra dos Reis', 'Aperibé', 'Araruama', 'Areal', 'Armação dos Búzios',
  'Arraial do Cabo', 'Barra do Piraí', 'Barra Mansa', 'Belford Roxo',
  'Bom Jardim', 'Bom Jesus do Itabapoana', 'Cabo Frio', 'Cachoeiras de Macacu',
  'Cambuci', 'Campos dos Goytacazes', 'Cantagalo', 'Carapebus',
  'Cardoso Moreira', 'Carmo', 'Casimiro de Abreu', 'Comendador Levy Gasparian',
  'Conceição de Macabu', 'Cordeiro', 'Duas Barras', 'Duque de Caxias',
  'Engenheiro Paulo de Frontin', 'Guapimirim', 'Iguaba Grande', 'Itaboraí',
  'Itaguaí', 'Italva', 'Itaocara', 'Itaperuna', 'Itatiaia', 'Japeri',
  'Laje do Muriaé', 'Macaé', 'Macuco', 'Magé', 'Mangaratiba', 'Maricá',
  'Mendes', 'Mesquita', 'Miguel Pereira', 'Miracema', 'Natividade',
  'Nilópolis', 'Niterói', 'Nova Friburgo', 'Nova Iguaçu', 'Paracambi',
  'Paraíba do Sul', 'Parati', 'Paty do Alferes', 'Petrópolis', 'Pinheiral',
  'Piraí', 'Porciúncula', 'Porto Real', 'Quatis', 'Queimados', 'Quissamã',
  'Resende', 'Rio Bonito', 'Rio Claro', 'Rio das Flores', 'Rio das Ostras',
  'Rio de Janeiro', 'Santa Maria Madalena', 'Santo Antônio de Pádua',
  'São Fidélis', 'São Francisco de Itabapoana', 'São Gonçalo',
  'São João da Barra', 'São João de Meriti', 'São José de Ubá',
  'São José do Vale do Rio Preto', 'São Pedro da Aldeia', 'São Sebastião do Alto',
  'Sapucaia', 'Saquarema', 'Seropédica', 'Silva Jardim', 'Sumidouro',
  'Tanguá', 'Teresópolis', 'Trajano de Moraes', 'Três Rios', 'Valença',
  'Varre-Sai', 'Vassouras', 'Volta Redonda',
];
```

- [ ] **Step 11: Write the failing test for `isEligible`**

```ts
// tests/unit/filters.test.ts
import { describe, expect, it } from 'vitest';
import { isEligible } from '../../src/lib/filters';
import type { NormalizedEvent } from '../../src/lib/types';

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'sympla:1',
    source: 'sympla',
    externalId: '1',
    title: 'Evento Teste',
    imageUrl: 'https://example.com/img.jpg',
    date: new Date('2026-12-01T20:00:00Z'),
    city: 'Rio de Janeiro',
    uf: 'RJ',
    minPrice: 0,
    isFree: true,
    url: 'https://example.com/evento/1',
    active: true,
    lastSeenAt: new Date(),
    ...overrides,
  };
}

describe('isEligible', () => {
  it('accepts a free RJ event', () => {
    expect(isEligible(makeEvent({ isFree: true, minPrice: 0 }))).toBe(true);
  });

  it('accepts a paid RJ event costing exactly R$20', () => {
    expect(isEligible(makeEvent({ isFree: false, minPrice: 20 }))).toBe(true);
  });

  it('rejects a paid RJ event costing R$20.01', () => {
    expect(isEligible(makeEvent({ isFree: false, minPrice: 20.01 }))).toBe(false);
  });

  it('rejects a paid RJ event costing R$25', () => {
    expect(isEligible(makeEvent({ isFree: false, minPrice: 25 }))).toBe(false);
  });

  it('rejects an event outside RJ even if free', () => {
    expect(isEligible(makeEvent({ uf: 'SP', isFree: true, minPrice: 0 }))).toBe(false);
  });

  it('rejects an event with no price information', () => {
    expect(isEligible(makeEvent({ isFree: false, minPrice: null }))).toBe(false);
  });

  it('accepts an event with RJ city but missing uf, via city fallback', () => {
    expect(
      isEligible(makeEvent({ uf: '', city: 'Nova Friburgo', isFree: true, minPrice: 0 })),
    ).toBe(true);
  });

  it('rejects an event with missing uf and a city not in RJ', () => {
    expect(
      isEligible(makeEvent({ uf: '', city: 'Belo Horizonte', isFree: true, minPrice: 0 })),
    ).toBe(false);
  });
});
```

- [ ] **Step 12: Run test to verify it fails**

Run: `npm test -- tests/unit/filters.test.ts`
Expected: FAIL with "Failed to resolve import" or "isEligible is not a function" (module doesn't exist yet).

- [ ] **Step 13: Implement `isEligible`**

```ts
// src/lib/filters.ts
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
```

- [ ] **Step 14: Run test to verify it passes**

Run: `npm test -- tests/unit/filters.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 15: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts next-env.d.ts vitest.config.ts .gitignore src/lib/types.ts src/lib/rjCities.ts src/lib/filters.ts tests/unit/filters.test.ts
git commit -m "feat: scaffold project and add RJ/price eligibility filter"
```

---

### Task 2: Sympla event normalizer

**Files:**
- Create: `src/sources/sympla.normalize.ts`
- Create: `fixtures/sympla-search-response.json`
- Test: `tests/unit/sympla.normalize.test.ts`

**Interfaces:**
- Consumes: `NormalizedEvent` from `src/lib/types.ts` (Task 1).
- Produces: `SymplaRawEvent` type, `SymplaListResponse` type,
  `normalizeSymplaEvent(raw: SymplaRawEvent, priceInfo: { isFree: boolean; minPrice: number | null }, now?: Date): NormalizedEvent`,
  `normalizeSymplaListResponse(response: SymplaListResponse, priceInfo: { isFree: boolean; minPrice: number | null }, now?: Date): NormalizedEvent[]`
  — consumed by Task 4 (scraper orchestration).

- [ ] **Step 1: Save the real captured fixture**

Create `fixtures/sympla-search-response.json` with this exact content
(trimmed from a real response captured from
`https://www.sympla.com.br/api/discovery-bff/search/category-type`
on 2026-09-05, one event missing `location.state` on purpose to cover
the defensive-skip case):

```json
{
  "data": [
    {
      "id": 50118528,
      "name": "PEARL JAM SYMPHONIC COM BLACK CIRCLE + NOVA ORQUESTRA",
      "url": "https://bileto.sympla.com.br/event/118528",
      "start_date": "2026-11-02T23:00:00+00:00",
      "images": {
        "original": "https://assets.bileto.sympla.com.br/eventmanager/production/2cn1m6ugsm3pdnmtb50mq12dngujvifa66ntmeatepci1glv2779tpj8uemrfd8g4j6usvsnebk1qgqfjpfahbortv7e6gmqn37cnoe.jpeg"
      },
      "location": {
        "city": "Rio de Janeiro",
        "state": "RJ"
      }
    },
    {
      "id": 3563267,
      "name": "Conservação e adaptação: gestão de acervos tecnológicos",
      "url": "https://www.sympla.com.br/evento/conservacao-e-adaptacao-gestao-de-acervos-tecnologicos/3563267",
      "start_date": "2026-09-09T22:00:00+00:00",
      "images": {
        "original": "https://images.sympla.com.br/6a971ad9e94f6.png"
      },
      "location": {
        "city": "Rio de Janeiro",
        "state": "RJ"
      }
    },
    {
      "id": 9999999,
      "name": "Evento sem estado (malformado)",
      "url": "https://www.sympla.com.br/evento/malformado/9999999",
      "start_date": "2026-10-01T20:00:00+00:00",
      "images": {
        "original": "https://images.sympla.com.br/malformado.png"
      },
      "location": {
        "city": "Cidade Desconhecida"
      }
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/sympla.normalize.test.ts
import { describe, expect, it } from 'vitest';
import {
  normalizeSymplaEvent,
  normalizeSymplaListResponse,
  type SymplaListResponse,
} from '../../src/sources/sympla.normalize';
import fixture from '../../fixtures/sympla-search-response.json';

const NOW = new Date('2026-09-05T12:00:00Z');

describe('normalizeSymplaEvent', () => {
  it('normalizes a single well-formed raw event as free', () => {
    const raw = (fixture as SymplaListResponse).data[0];
    const result = normalizeSymplaEvent(raw, { isFree: true, minPrice: 0 }, NOW);

    expect(result).toEqual({
      id: 'sympla:50118528',
      source: 'sympla',
      externalId: '50118528',
      title: 'PEARL JAM SYMPHONIC COM BLACK CIRCLE + NOVA ORQUESTRA',
      imageUrl:
        'https://assets.bileto.sympla.com.br/eventmanager/production/2cn1m6ugsm3pdnmtb50mq12dngujvifa66ntmeatepci1glv2779tpj8uemrfd8g4j6usvsnebk1qgqfjpfahbortv7e6gmqn37cnoe.jpeg',
      date: new Date('2026-11-02T23:00:00+00:00'),
      city: 'Rio de Janeiro',
      uf: 'RJ',
      minPrice: 0,
      isFree: true,
      url: 'https://bileto.sympla.com.br/event/118528',
      active: true,
      lastSeenAt: NOW,
    });
  });

  it('normalizes a paid candidate with minPrice null until priced', () => {
    const raw = (fixture as SymplaListResponse).data[1];
    const result = normalizeSymplaEvent(raw, { isFree: false, minPrice: null }, NOW);

    expect(result.isFree).toBe(false);
    expect(result.minPrice).toBeNull();
    expect(result.id).toBe('sympla:3563267');
  });
});

describe('normalizeSymplaListResponse', () => {
  it('normalizes all well-formed events and skips ones missing location.state', () => {
    const results = normalizeSymplaListResponse(
      fixture as SymplaListResponse,
      { isFree: true, minPrice: 0 },
      NOW,
    );

    expect(results).toHaveLength(2);
    expect(results.map((e) => e.externalId)).toEqual(['50118528', '3563267']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/unit/sympla.normalize.test.ts`
Expected: FAIL — module `src/sources/sympla.normalize.ts` does not exist.

- [ ] **Step 4: Implement the normalizer**

```ts
// src/sources/sympla.normalize.ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/sympla.normalize.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add fixtures/sympla-search-response.json src/sources/sympla.normalize.ts tests/unit/sympla.normalize.test.ts
git commit -m "feat: add Sympla event normalizer"
```

---

### Task 3: Ticket price text parser

**Files:**
- Create: `src/sources/sympla.price.ts`
- Test: `tests/unit/sympla.price.test.ts`

**Interfaces:**
- Produces: `parsePriceText(text: string): number | null` — consumed
  by Task 4 (scraper orchestration).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sympla.price.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/sympla.price.test.ts`
Expected: FAIL — module `src/sources/sympla.price.ts` does not exist.

- [ ] **Step 3: Implement the parser**

```ts
// src/sources/sympla.price.ts
export function parsePriceText(text: string): number | null {
  const matches = [...text.matchAll(/R\$\s*([\d.,]+)/g)];
  if (matches.length === 0) return null;

  const values = matches.map((match) =>
    parseFloat(match[1].replace(/\./g, '').replace(',', '.')),
  );
  return Math.min(...values);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/sympla.price.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sources/sympla.price.ts tests/unit/sympla.price.test.ts
git commit -m "feat: add ticket price text parser"
```

---

### Task 4: Sympla Playwright scraper orchestration

**Files:**
- Create: `src/sources/sympla.ts`
- Test: `tests/unit/sympla.scraper.test.ts`

**Interfaces:**
- Consumes: `normalizeSymplaListResponse` (Task 2),
  `parsePriceText` (Task 3), `NormalizedEvent` (Task 1).
- Produces: `scrapeSympla(page: SymplaPage, now?: Date): Promise<NormalizedEvent[]>`
  — consumed by Task 8 (`scripts/scan.ts`). `SymplaPage` is the minimal
  Playwright `Page` surface this module needs (defined in this file),
  satisfied by a real `playwright.Page` at runtime and by a hand-written
  fake in tests.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sympla.scraper.test.ts
import { describe, expect, it, vi } from 'vitest';
import { scrapeSympla, type SymplaPage } from '../../src/sources/sympla';
import fixture from '../../fixtures/sympla-search-response.json';

const NOW = new Date('2026-09-05T12:00:00Z');

function jsonResponse(body: unknown) {
  return { json: async () => body };
}

function makeFakePage(paidEventPriceTexts: Record<string, string>): SymplaPage {
  const clicked: string[] = [];
  const visited: string[] = [];

  const freeResponse = jsonResponse({ data: [fixture.data[0]] });
  const paidResponse = jsonResponse({ data: [fixture.data[1]] });

  let callCount = 0;

  return {
    async goto(url: string) {
      visited.push(url);
    },
    getByText(text: string) {
      return {
        async click() {
          clicked.push(text);
        },
      };
    },
    async waitForResponse() {
      callCount += 1;
      return callCount === 1 ? freeResponse : paidResponse;
    },
    locator() {
      return {
        async innerText() {
          const eventUrl = visited[visited.length - 1];
          return paidEventPriceTexts[eventUrl] ?? '';
        },
      };
    },
  };
}

describe('scrapeSympla', () => {
  it('returns free events as-is and cheap paid events priced from their detail page', async () => {
    const page = makeFakePage({
      'https://www.sympla.com.br/evento/conservacao-e-adaptacao-gestao-de-acervos-tecnologicos/3563267':
        'R$ 15,00',
    });

    const events = await scrapeSympla(page, NOW);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ externalId: '50118528', isFree: true, minPrice: 0 });
    expect(events[1]).toMatchObject({ externalId: '3563267', isFree: false, minPrice: 15 });
  });

  it('drops paid candidates priced above R$20', async () => {
    const page = makeFakePage({
      'https://www.sympla.com.br/evento/conservacao-e-adaptacao-gestao-de-acervos-tecnologicos/3563267':
        'R$ 45,00',
    });

    const events = await scrapeSympla(page, NOW);

    expect(events).toHaveLength(1);
    expect(events[0].externalId).toBe('50118528');
  });

  it('clicks the Preço filter and both price options', async () => {
    const page = makeFakePage({});
    const clickSpy = vi.spyOn(page, 'getByText');

    await scrapeSympla(page, NOW);

    const clickedLabels = clickSpy.mock.calls.map((call) => call[0]);
    expect(clickedLabels).toContain('Preço');
    expect(clickedLabels).toContain('Grátis');
    expect(clickedLabels).toContain('Pago');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/sympla.scraper.test.ts`
Expected: FAIL — module `src/sources/sympla.ts` does not exist.

- [ ] **Step 3: Implement the scraper**

```ts
// src/sources/sympla.ts
import {
  normalizeSymplaListResponse,
  type SymplaListResponse,
} from './sympla.normalize';
import { parsePriceText } from './sympla.price';
import type { NormalizedEvent } from '../lib/types';

const RJ_EVENTS_URL = 'https://www.sympla.com.br/eventos/rio-de-janeiro-rj';
const MAX_PRICE = 20;

export interface SymplaPage {
  goto(url: string): Promise<void>;
  getByText(text: string): { click(): Promise<void> };
  waitForResponse(
    predicate: (response: { url(): string; request(): { method(): string } }) => boolean,
  ): Promise<{ json(): Promise<unknown> }>;
  locator(selector: string): { innerText(): Promise<string> };
}

export async function scrapeSympla(
  page: SymplaPage,
  now: Date = new Date(),
): Promise<NormalizedEvent[]> {
  await page.goto(RJ_EVENTS_URL);

  const freeEvents = await collectByPriceFilter(page, 'Grátis', { isFree: true, minPrice: 0 }, now);
  const paidCandidates = await collectByPriceFilter(
    page,
    'Pago',
    { isFree: false, minPrice: null },
    now,
  );

  const cheapPaidEvents: NormalizedEvent[] = [];
  for (const candidate of paidCandidates) {
    const price = await scrapeEventPrice(page, candidate.url);
    if (price !== null && price <= MAX_PRICE) {
      cheapPaidEvents.push({ ...candidate, minPrice: price });
    }
  }

  return [...freeEvents, ...cheapPaidEvents];
}

async function collectByPriceFilter(
  page: SymplaPage,
  filterLabel: 'Grátis' | 'Pago',
  priceInfo: { isFree: boolean; minPrice: number | null },
  now: Date,
): Promise<NormalizedEvent[]> {
  await page.getByText('Preço').click();
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('discovery-bff/search/category-type') &&
      response.request().method() === 'POST',
  );
  await page.getByText(filterLabel).click();
  const response = await responsePromise;
  const json = (await response.json()) as SymplaListResponse;
  return normalizeSymplaListResponse(json, priceInfo, now);
}

async function scrapeEventPrice(page: SymplaPage, eventUrl: string): Promise<number | null> {
  await page.goto(eventUrl);
  const text = await page.locator('body').innerText();
  return parsePriceText(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/sympla.scraper.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/sources/sympla.ts tests/unit/sympla.scraper.test.ts
git commit -m "feat: add Sympla Playwright scraper orchestration"
```

---

### Task 5: Postgres schema and events store

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/lib/eventsStore.ts`
- Test: `tests/unit/eventsStore.test.ts`

**Interfaces:**
- Consumes: `NormalizedEvent` (Task 1), `isEligible` (Task 1) — the
  eligibility rule (RJ + price) lives once in `filters.ts` and is
  reused here so the DB layer and the pure logic never drift apart.
- Produces: `createPool(connectionString?: string): Pool`,
  `ensureSchema(pool: Pool): Promise<void>` (`src/lib/db.ts`);
  `upsertEvents(pool: Pool, events: NormalizedEvent[]): Promise<void>`,
  `markInactiveNotSeen(pool: Pool, source: string, seenIds: string[]): Promise<void>`,
  `getEligibleEvents(pool: Pool): Promise<NormalizedEvent[]>`,
  `recordScanError(pool: Pool, source: string, message: string): Promise<void>`
  (`src/lib/eventsStore.ts`) — consumed by Task 8 (`scripts/scan.ts`)
  and Task 9 (homepage).

- [ ] **Step 1: Write `src/lib/db.ts`**

```ts
// src/lib/db.ts
import { Pool } from 'pg';

export function createPool(connectionString: string = process.env.DATABASE_URL ?? ''): Pool {
  return new Pool({ connectionString });
}

export async function ensureSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      image_url TEXT NOT NULL,
      event_date TIMESTAMPTZ NOT NULL,
      city TEXT NOT NULL,
      uf TEXT NOT NULL,
      min_price NUMERIC,
      is_free BOOLEAN NOT NULL DEFAULT false,
      url TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      last_seen_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS scan_errors (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}
```

This has no test of its own — it is exercised by `tests/unit/eventsStore.test.ts` below (`ensureSchema` must run before those tests can query the tables).

- [ ] **Step 2: Write the failing test for the events store**

```ts
// tests/unit/eventsStore.test.ts
import { newDb } from 'pg-mem';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureSchema } from '../../src/lib/db';
import {
  getEligibleEvents,
  markInactiveNotSeen,
  recordScanError,
  upsertEvents,
} from '../../src/lib/eventsStore';
import type { NormalizedEvent } from '../../src/lib/types';

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'sympla:1',
    source: 'sympla',
    externalId: '1',
    title: 'Evento Teste',
    imageUrl: 'https://example.com/img.jpg',
    date: new Date('2026-12-01T20:00:00Z'),
    city: 'Rio de Janeiro',
    uf: 'RJ',
    minPrice: 0,
    isFree: true,
    url: 'https://example.com/evento/1',
    active: true,
    lastSeenAt: new Date('2026-09-05T12:00:00Z'),
    ...overrides,
  };
}

async function makeTestPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();
  await ensureSchema(pool);
  return pool;
}

describe('eventsStore', () => {
  let pool: Awaited<ReturnType<typeof makeTestPool>>;

  beforeEach(async () => {
    pool = await makeTestPool();
  });

  it('upserts new events and returns them when eligible', async () => {
    await upsertEvents(pool, [makeEvent()]);
    const events = await getEligibleEvents(pool);

    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('sympla:1');
  });

  it('excludes ineligible events (paid over R$20)', async () => {
    await upsertEvents(pool, [makeEvent({ isFree: false, minPrice: 25 })]);
    const events = await getEligibleEvents(pool);

    expect(events).toHaveLength(0);
  });

  it('updates an existing event on re-upsert instead of duplicating it', async () => {
    await upsertEvents(pool, [makeEvent({ title: 'Título Antigo' })]);
    await upsertEvents(pool, [makeEvent({ title: 'Título Novo' })]);
    const events = await getEligibleEvents(pool);

    expect(events).toHaveLength(1);
    expect(events[0].title).toBe('Título Novo');
  });

  it('marks events not seen in the latest scan as inactive', async () => {
    await upsertEvents(pool, [makeEvent({ id: 'sympla:1', externalId: '1' })]);
    await upsertEvents(pool, [makeEvent({ id: 'sympla:2', externalId: '2' })]);

    await markInactiveNotSeen(pool, 'sympla', ['sympla:2']);
    const events = await getEligibleEvents(pool);

    expect(events.map((e) => e.id)).toEqual(['sympla:2']);
  });

  it('records a scan error without throwing', async () => {
    await expect(recordScanError(pool, 'sympla', 'boom')).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/unit/eventsStore.test.ts`
Expected: FAIL — module `src/lib/eventsStore.ts` does not exist.

- [ ] **Step 4: Implement the events store**

```ts
// src/lib/eventsStore.ts
import type { Pool } from 'pg';
import { isEligible } from './filters';
import type { NormalizedEvent } from './types';

export async function upsertEvents(pool: Pool, events: NormalizedEvent[]): Promise<void> {
  for (const event of events) {
    await pool.query(
      `INSERT INTO events (
         id, source, external_id, title, image_url, event_date,
         city, uf, min_price, is_free, url, active, last_seen_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         image_url = EXCLUDED.image_url,
         event_date = EXCLUDED.event_date,
         city = EXCLUDED.city,
         uf = EXCLUDED.uf,
         min_price = EXCLUDED.min_price,
         is_free = EXCLUDED.is_free,
         url = EXCLUDED.url,
         active = true,
         last_seen_at = EXCLUDED.last_seen_at`,
      [
        event.id,
        event.source,
        event.externalId,
        event.title,
        event.imageUrl,
        event.date,
        event.city,
        event.uf,
        event.minPrice,
        event.isFree,
        event.url,
        event.lastSeenAt,
      ],
    );
  }
}

export async function markInactiveNotSeen(
  pool: Pool,
  source: string,
  seenIds: string[],
): Promise<void> {
  await pool.query(
    `UPDATE events SET active = false WHERE source = $1 AND NOT (id = ANY($2::text[]))`,
    [source, seenIds],
  );
}

export async function getEligibleEvents(pool: Pool): Promise<NormalizedEvent[]> {
  const { rows } = await pool.query(
    `SELECT id, source, external_id, title, image_url, event_date,
            city, uf, min_price, is_free, url, active, last_seen_at
     FROM events
     WHERE active = true
     ORDER BY event_date ASC`,
  );
  // RJ + price eligibility is decided once, in filters.ts, so the DB
  // layer and the pure business rule can't drift apart. Fine at this
  // scale (one city, hundreds of rows, not millions).
  return rows.map(rowToEvent).filter(isEligible);
}

export async function recordScanError(
  pool: Pool,
  source: string,
  message: string,
): Promise<void> {
  await pool.query(`INSERT INTO scan_errors (source, message) VALUES ($1, $2)`, [source, message]);
}

function rowToEvent(row: Record<string, unknown>): NormalizedEvent {
  return {
    id: row.id as string,
    source: row.source as string,
    externalId: row.external_id as string,
    title: row.title as string,
    imageUrl: row.image_url as string,
    date: new Date(row.event_date as string),
    city: row.city as string,
    uf: row.uf as string,
    minPrice: row.min_price === null ? null : Number(row.min_price),
    isFree: row.is_free as boolean,
    url: row.url as string,
    active: row.active as boolean,
    lastSeenAt: new Date(row.last_seen_at as string),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/eventsStore.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/db.ts src/lib/eventsStore.ts tests/unit/eventsStore.test.ts
git commit -m "feat: add Postgres schema and events store"
```

---

### Task 6: Scan orchestrator (`runScan`)

**Files:**
- Create: `src/lib/runScan.ts`
- Test: `tests/unit/runScan.test.ts`

**Interfaces:**
- Consumes: `NormalizedEvent` (Task 1).
- Produces: `ScanStore` interface and
  `runScan(source: string, scrape: () => Promise<NormalizedEvent[]>, store: ScanStore): Promise<void>`
  — consumed by Task 8 (`scripts/scan.ts`), where `store` is backed by
  the real `eventsStore` functions from Task 5.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/runScan.test.ts
import { describe, expect, it, vi } from 'vitest';
import { runScan, type ScanStore } from '../../src/lib/runScan';
import type { NormalizedEvent } from '../../src/lib/types';

function makeEvent(id: string): NormalizedEvent {
  return {
    id,
    source: 'sympla',
    externalId: id,
    title: 'Evento',
    imageUrl: 'https://example.com/img.jpg',
    date: new Date(),
    city: 'Rio de Janeiro',
    uf: 'RJ',
    minPrice: 0,
    isFree: true,
    url: 'https://example.com',
    active: true,
    lastSeenAt: new Date(),
  };
}

function makeStore(): ScanStore {
  return {
    upsertEvents: vi.fn().mockResolvedValue(undefined),
    markInactiveNotSeen: vi.fn().mockResolvedValue(undefined),
    recordScanError: vi.fn().mockResolvedValue(undefined),
  };
}

describe('runScan', () => {
  it('upserts scraped events and marks the rest of the source inactive', async () => {
    const store = makeStore();
    const events = [makeEvent('sympla:1'), makeEvent('sympla:2')];

    await runScan('sympla', async () => events, store);

    expect(store.upsertEvents).toHaveBeenCalledWith(events);
    expect(store.markInactiveNotSeen).toHaveBeenCalledWith('sympla', ['sympla:1', 'sympla:2']);
    expect(store.recordScanError).not.toHaveBeenCalled();
  });

  it('records a scan error and does not throw when scraping fails', async () => {
    const store = makeStore();

    await expect(
      runScan(
        'sympla',
        async () => {
          throw new Error('site changed layout');
        },
        store,
      ),
    ).resolves.not.toThrow();

    expect(store.recordScanError).toHaveBeenCalledWith('sympla', 'site changed layout');
    expect(store.upsertEvents).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/runScan.test.ts`
Expected: FAIL — module `src/lib/runScan.ts` does not exist.

- [ ] **Step 3: Implement `runScan`**

```ts
// src/lib/runScan.ts
import type { NormalizedEvent } from './types';

export interface ScanStore {
  upsertEvents(events: NormalizedEvent[]): Promise<void>;
  markInactiveNotSeen(source: string, seenIds: string[]): Promise<void>;
  recordScanError(source: string, message: string): Promise<void>;
}

export async function runScan(
  source: string,
  scrape: () => Promise<NormalizedEvent[]>,
  store: ScanStore,
): Promise<void> {
  try {
    const events = await scrape();
    await store.upsertEvents(events);
    await store.markInactiveNotSeen(
      source,
      events.map((event) => event.id),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.recordScanError(source, message);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/runScan.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/runScan.ts tests/unit/runScan.test.ts
git commit -m "feat: add per-source scan orchestrator with error isolation"
```

---

### Task 7: Event card, grid, and homepage

**Files:**
- Create: `src/components/EventCard.tsx`
- Create: `src/components/EventGrid.tsx`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/globals.css`
- Test: `tests/component/EventGrid.test.tsx`

**Interfaces:**
- Consumes: `NormalizedEvent` (Task 1), `createPool` (Task 5),
  `getEligibleEvents` (Task 5).
- Produces: `EventCard({ event }: { event: NormalizedEvent })`,
  `EventGrid({ events }: { events: NormalizedEvent[] })` React
  components.

- [ ] **Step 1: Write the failing component test**

```tsx
// tests/component/EventGrid.test.tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EventGrid } from '../../src/components/EventGrid';
import type { NormalizedEvent } from '../../src/lib/types';

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: 'sympla:1',
    source: 'sympla',
    externalId: '1',
    title: 'Show Grátis no Aterro',
    imageUrl: 'https://example.com/img.jpg',
    date: new Date('2026-12-01T20:00:00Z'),
    city: 'Rio de Janeiro',
    uf: 'RJ',
    minPrice: 0,
    isFree: true,
    url: 'https://example.com/evento/1',
    active: true,
    lastSeenAt: new Date(),
    ...overrides,
  };
}

describe('EventGrid', () => {
  it('renders image, name, date and a link to get the ticket for each event', () => {
    render(<EventGrid events={[makeEvent()]} />);

    const image = screen.getByRole('img', { name: 'Show Grátis no Aterro' });
    expect(image).toHaveAttribute('src', 'https://example.com/img.jpg');
    expect(screen.getByText('Show Grátis no Aterro')).toBeInTheDocument();
    expect(screen.getByText(/dezembro de 2026/)).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /pegar ingresso/i });
    expect(link).toHaveAttribute('href', 'https://example.com/evento/1');
  });

  it('shows an empty-state message when there are no events', () => {
    render(<EventGrid events={[]} />);

    expect(
      screen.getByText(/nenhum evento grátis ou até r\$20/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/component/EventGrid.test.tsx`
Expected: FAIL — module `src/components/EventGrid.tsx` does not exist.

- [ ] **Step 3: Implement `EventCard` and `EventGrid`**

```tsx
// src/components/EventCard.tsx
import type { NormalizedEvent } from '../lib/types';

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function EventCard({ event }: { event: NormalizedEvent }) {
  return (
    <article className="event-card">
      <img src={event.imageUrl} alt={event.title} />
      <h2>{event.title}</h2>
      <p>{formatDate(event.date)}</p>
      <a href={event.url} target="_blank" rel="noopener noreferrer">
        Pegar ingresso
      </a>
    </article>
  );
}
```

```tsx
// src/components/EventGrid.tsx
import type { NormalizedEvent } from '../lib/types';
import { EventCard } from './EventCard';

export function EventGrid({ events }: { events: NormalizedEvent[] }) {
  if (events.length === 0) {
    return <p>Nenhum evento grátis ou até R$20 encontrado no RJ agora.</p>;
  }

  return (
    <div className="event-grid">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/component/EventGrid.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the homepage and layout (no new test — wired manually in Task 9's deploy check)**

```tsx
// src/app/layout.tsx
import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'ticket-free RJ',
  description: 'Eventos grátis e até R$20 no estado do Rio de Janeiro',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

```tsx
// src/app/page.tsx
import { EventGrid } from '../components/EventGrid';
import { createPool } from '../lib/db';
import { getEligibleEvents } from '../lib/eventsStore';

export default async function HomePage() {
  const pool = createPool();
  const events = await getEligibleEvents(pool);

  return (
    <main>
      <h1>Ingressos grátis e até R$20 no Rio de Janeiro</h1>
      <EventGrid events={events} />
    </main>
  );
}
```

```css
/* src/app/globals.css */
body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #fafafa;
  color: #1a1a1a;
}

.event-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.5rem;
  padding: 1.5rem;
}

.event-card {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

.event-card img {
  width: 100%;
  height: 160px;
  object-fit: cover;
}

.event-card h2,
.event-card p {
  margin: 0.5rem 1rem;
}

.event-card a {
  display: block;
  margin: 1rem;
  padding: 0.5rem 1rem;
  text-align: center;
  background: #1a1a1a;
  color: white;
  text-decoration: none;
  border-radius: 4px;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/EventCard.tsx src/components/EventGrid.tsx src/app/layout.tsx src/app/page.tsx src/app/globals.css tests/component/EventGrid.test.tsx
git commit -m "feat: add event card, grid and homepage"
```

---

### Task 8: Scan script wiring

**Files:**
- Create: `scripts/scan.ts`

**Interfaces:**
- Consumes: `createPool`, `ensureSchema` (Task 5), `upsertEvents`,
  `markInactiveNotSeen`, `recordScanError` (Task 5), `runScan` (Task
  6), `scrapeSympla` (Task 4).

This task wires real Playwright and a real Postgres connection
together. It has no unit test of its own (`runScan` and `scrapeSympla`
already cover the logic with fakes) — its correctness is verified
manually in Step 3 against a real database.

- [ ] **Step 1: Write `scripts/scan.ts`**

```ts
// scripts/scan.ts
import { chromium } from 'playwright';
import { createPool, ensureSchema } from '../src/lib/db';
import {
  markInactiveNotSeen,
  recordScanError,
  upsertEvents,
} from '../src/lib/eventsStore';
import { runScan } from '../src/lib/runScan';
import { scrapeSympla } from '../src/sources/sympla';

async function main(): Promise<void> {
  const pool = createPool();
  await ensureSchema(pool);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await runScan('sympla', () => scrapeSympla(page), {
      upsertEvents: (events) => upsertEvents(pool, events),
      markInactiveNotSeen: (source, ids) => markInactiveNotSeen(pool, source, ids),
      recordScanError: (source, message) => recordScanError(pool, source, message),
    });
  } finally {
    await browser.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Install Playwright's browser binary locally**

```bash
npx playwright install --with-deps chromium
```

- [ ] **Step 3: Manually verify against a real database**

This step needs a real `DATABASE_URL` (e.g. from Vercel Postgres —
set up in Task 9) exported in the shell. Run:

```bash
DATABASE_URL="postgres://..." npm run scan
```

Expected: command exits 0, and querying `SELECT count(*) FROM events;`
against that database shows rows inserted. If this step can't be run
yet because no Postgres instance exists, note it as a pending manual
check to run once Task 9's Vercel Postgres is provisioned — do not
skip it silently.

- [ ] **Step 4: Commit**

```bash
git add scripts/scan.ts
git commit -m "feat: wire scan script with real Playwright and Postgres"
```

---

### Task 9: GitHub Actions cron, env config, and deploy docs

**Files:**
- Create: `.github/workflows/scan.yml`
- Create: `.env.example`
- Create: `README.md`

**Interfaces:**
- Consumes: `npm run scan` (Task 8), `DATABASE_URL` env var (Task 5).

This task has no automated test — its deliverable is verified by
manually triggering the workflow once (Step 4) and confirming the
homepage renders real data once deployed.

- [ ] **Step 1: Write `.env.example`**

```
DATABASE_URL=postgres://user:password@host:5432/dbname
```

- [ ] **Step 2: Write `.github/workflows/scan.yml`**

```yaml
name: Scan events

on:
  schedule:
    - cron: '0 */6 * * *'
  workflow_dispatch: {}

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run scan
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

- [ ] **Step 3: Write `README.md`**

```markdown
# ticket-free

Varredura de eventos grátis ou até R$20 no estado do Rio de Janeiro.
MVP cobre só a Sympla — outras fontes (Ingresse, Ingresso.com,
Eventbrite, Even3/Bileto) entram depois, cada uma com sua própria
verificação antes de codar (ver `docs/superpowers/specs/`).

## Rodar localmente

\`\`\`bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env.local   # preencha DATABASE_URL
npm run dev                  # site em http://localhost:3000
\`\`\`

## Rodar a varredura manualmente

\`\`\`bash
DATABASE_URL="postgres://..." npm run scan
\`\`\`

## Testes

\`\`\`bash
npm test
\`\`\`

## Deploy

1. Crie um projeto na Vercel chamado `dmticket-free` (fica em
   `dmticket-free.vercel.app`).
2. Adicione um banco Vercel Postgres ao projeto; copie a connection
   string para a env var `DATABASE_URL` do projeto Vercel.
3. No repositório GitHub, adicione um secret `DATABASE_URL` com a
   mesma connection string (usado pelo workflow em
   `.github/workflows/scan.yml`, que roda a varredura a cada 6h).
4. Rode a varredura manualmente uma vez (Actions → Scan events → Run
   workflow) antes do primeiro deploy, pra homepage não abrir vazia.
```

- [ ] **Step 4: Manually trigger the workflow once**

Push this branch, then in GitHub: Actions → "Scan events" → "Run
workflow". Confirm the run succeeds and the `events` table in the
connected Postgres has rows.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/scan.yml .env.example README.md
git commit -m "docs: add GitHub Actions scan cron and deploy instructions"
```
