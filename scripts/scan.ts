// scripts/scan.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createPool, ensureSchema } from '../src/lib/db';
import {
  markInactiveNotSeen,
  recordScanError,
  upsertEvents,
} from '../src/lib/eventsStore';
import { runScan } from '../src/lib/runScan';
import { scrapeIngresse, type IngressePage } from '../src/sources/ingresse';
import { scrapeSympla, type SymplaPage } from '../src/sources/sympla';

// Carrega .env.local (quando presente) em process.env sem sobrescrever
// variáveis já definidas. Permite rodar o scan localmente sem exportar
// DATABASE_URL na mão — necessário pro agendador do Windows.
function loadDotEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../.env.local');
  try {
    const raw = readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^"|"$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Sem .env.local: assume DATABASE_URL já vem do ambiente (ex.: CI).
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const pool = createPool();
  await ensureSchema(pool);

  const browser = await chromium.launch({
    headless: true,
    // O WAF da Sympla (página de "security verification") detecta browsers
    // headless padrão e serve uma página sem o filtro "Preço" — o que faz o
    // clique dar timeout. Reduzir sinais de automação evita esse bloqueio.
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1366, height: 768 },
  });

  // Esconde `navigator.webdriver` — o marcador mais fácil pro WAF detectar
  // automação. Roda antes de qualquer script da página.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // Adapter: Playwright's real Page satisfies SymplaPage structurally for
  // every method except `goto`, whose real return type (Promise<Response |
  // null>) is wider than the SymplaPage interface's declared Promise<void>.
  // This forwards calls only — no scraping logic lives here.
  const symplaPage: SymplaPage = {
    goto: async (url, options) => {
      await page.goto(url, options as never);
    },
    getByText: (text) => page.getByText(text) as never,
    mouse: page.mouse,
    waitForSelector: (selector, opts) => page.waitForSelector(selector, opts as never),
    waitForTimeout: (ms) => page.waitForTimeout(ms),
    waitForResponse: (predicate, opts) => page.waitForResponse(predicate, opts as never),
    locator: (selector) => page.locator(selector),
  };

  // Adapter: same goto-return-type mismatch as SymplaPage above; `evaluate`
  // already matches Playwright's real signature.
  const ingressePage: IngressePage = {
    goto: async (url, options) => {
      await page.goto(url, options as never);
    },
    evaluate: (fn) => page.evaluate(fn),
    locator: (selector) => page.locator(selector),
    waitForTimeout: (ms) => page.waitForTimeout(ms),
  };

  const store = {
    upsertEvents: (events: Parameters<typeof upsertEvents>[1]) => upsertEvents(pool, events),
    markInactiveNotSeen: (source: string, ids: string[]) => markInactiveNotSeen(pool, source, ids),
    recordScanError: (source: string, message: string) => recordScanError(pool, source, message),
  };

  try {
    const symplaOk = await runScan('sympla', () => scrapeSympla(symplaPage), store);
    const ingresseOk = await runScan('ingresse', () => scrapeIngresse(ingressePage), store);

    if (!symplaOk || !ingresseOk) {
      // A source failed (scrape threw, or returned 0 events) and already
      // recorded a scan_errors row. Fail the process so CI/cron surfaces
      // it instead of going green on a silent no-op scan.
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
