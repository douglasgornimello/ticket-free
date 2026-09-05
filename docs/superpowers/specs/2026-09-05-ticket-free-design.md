# ticket-free — Design

## Objetivo

Sistema que varre sites de venda de ingresso (Ingresso.com, Sympla,
Eventbrite, Even3/Bileto) em busca de eventos no **estado do Rio de
Janeiro** que sejam **gratuitos** ou custem **até R$20**. Resultado
aparece na página inicial de um site (`dmticket-free.vercel.app`) com
imagem, nome, data e link direto pra pegar o ingresso.

## Stack

- Next.js (App Router, TypeScript), deploy Vercel, projeto `dmticket-free`
  (subdomínio gratuito `dmticket-free.vercel.app`, sem domínio próprio pago).
- Vercel Postgres como armazenamento persistente (serverless não mantém
  estado entre execuções).
- Coleta híbrida:
  - Sites com API interna acessível (Ingresso, Sympla, Eventbrite): fetch
    direto na API JSON usada pelo próprio frontend deles.
  - Sites sem API acessível (ex. Even3/Bileto, ou qualquer outro que só
    exponha HTML renderizado por JS): Playwright.
- Playwright **não roda no Vercel** (limite de tempo/memória do free
  tier). Roda via **GitHub Actions** em cron separado, gravando direto
  no mesmo Postgres. Vercel só serve o site e roda o scan das fontes
  com API (mais leve, cabe em serverless function comum).

## Arquitetura

```
[Vercel Cron 6h] -> /api/cron/scan (Next.js route handler)
                      -> sources/ingresso.ts   (fetch API)
                      -> sources/sympla.ts     (fetch API)
                      -> sources/eventbrite.ts (fetch API)
                      -> normaliza -> upsert Postgres

[GitHub Actions cron 6h] -> scripts/scan-playwright.ts
                      -> sources/even3-bileto.ts (Playwright)
                      -> normaliza -> upsert Postgres (mesma conexão)

[Homepage /] -> Server Component -> query Postgres
                      -> filtra (RJ + grátis/≤R$20 + ativo)
                      -> renderiza cards (imagem, nome, data, link)
```

## Schema normalizado (por evento)

```ts
{
  id: string;          // `${source}:${externalId}`
  source: 'ingresso' | 'sympla' | 'eventbrite' | 'even3' | 'bileto';
  externalId: string;
  title: string;
  imageUrl: string;
  date: Date;           // data/hora do evento
  city: string;
  uf: string;            // estado (deve ser 'RJ' pra entrar)
  minPrice: number | null; // menor preço entre lotes; 0 se grátis
  isFree: boolean;
  url: string;           // link pra comprar/pegar ingresso
  active: boolean;       // false quando some da fonte
  lastSeenAt: Date;
}
```

## Regras de filtro

- **Estado**: usa campo `uf`/`state` retornado pela própria API/página
  do evento. Se ausente, fallback: casa `city` contra lista fixa dos 92
  municípios do RJ.
- **Preço**: evento entra se `isFree === true` OU `minPrice <= 20`.
  Eventos sem nenhuma info de preço são ignorados (não dá pra confirmar
  a regra).
- Evento que não aparece mais na fonte numa varredura é marcado
  `active = false` (não aparece na home, mas fica no banco pra histórico).

## Tratamento de erro

- Cada scraper de fonte roda isolado em try/catch — falha de uma fonte
  não impede as outras de rodar nem derruba o cron inteiro.
- Falhas registradas em tabela `scan_errors` (source, timestamp,
  mensagem) — sinal pra saber quando a API de um site mudou de formato.
- Homepage nunca quebra por erro de scraper: sempre lê o que já está
  persistido no Postgres.

## Testes

- Unit: parser/normalizer de cada fonte (JSON de exemplo →
  schema normalizado correto), incluindo casos de campo ausente.
- Unit: função de filtro RJ + preço (casos: grátis, 15, 20, 20.01, 25,
  outro estado, sem uf mas cidade do RJ).
- E2E leve: homepage renderiza card com imagem/nome/data/link para
  evento de fixture no banco de teste.

## Fora de escopo (YAGNI, considerar depois)

- Domínio próprio pago.
- Notificações (email/push) de novo evento.
- Busca/filtro manual na UI (cidade específica, categoria de evento).
- Outros sites de ingresso além dos 4 listados.
- Rate limiting / anti-bloqueio agressivo — parte do scraper deve ser
  respeitosa (intervalo entre requests, User-Agent identificável) mas
  sistema de retry/backoff sofisticado fica pra depois se necessário.
