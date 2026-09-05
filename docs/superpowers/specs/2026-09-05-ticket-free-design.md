# ticket-free — Design

## Objetivo

Sistema que varre sites de venda de ingresso (Ingresse.com, Ingresso.com,
Sympla, Eventbrite, Even3/Bileto) em busca de eventos no **estado do Rio de
Janeiro** que sejam **gratuitos** ou custem **até R$20**. Resultado
aparece na página inicial de um site (`dmticket-free.vercel.app`) com
imagem, nome, data e link direto pra pegar o ingresso.

## Escopo do MVP

Pesquisa ao vivo (ver `docs/superpowers/specs/2026-09-05-research-notes.md`
não é necessária — resumo aqui) mostrou que cada site expõe dados via
API JSON interna própria (React/SPA), sem payload de request
documentado e sujeito a mudar sem aviso. Reverse-engineer as 5 fontes
(Ingresse, Ingresso.com, Sympla, Eventbrite, Even3/Bileto) de uma vez
tem alto risco de código quebrado por chute de schema.

**Decisão:** o MVP entrega a pipeline inteira (coleta → filtro → banco →
site → cron) funcionando de ponta a ponta para **uma fonte (Sympla)**.
As outras 4 fontes entram depois, uma a uma, cada uma com sua própria
verificação ao vivo + spec/plano curto de "adicionar fonte X" que reusa
toda a infraestrutura deste MVP. Adicionar uma fonte nova, uma vez que a
infra existe, é só implementar `sources/<nome>.ts` seguindo a mesma
interface — não exige mudar arquitetura.

## Stack

- Next.js (App Router, TypeScript), deploy Vercel, projeto `dmticket-free`
  (subdomínio gratuito `dmticket-free.vercel.app`, sem domínio próprio pago).
- Vercel Postgres como armazenamento persistente (serverless não mantém
  estado entre execuções).
- Coleta via **Playwright**, uniforme para todas as fontes (inclusive as
  que têm API própria): em vez de tentar replicar o payload de request
  que o site usa internamente (frágil, não documentado, pode mudar),
  Playwright abre a página real, interage com os filtros da própria UI
  do site (ex.: clicar em "Grátis" no filtro de preço) e intercepta a
  resposta de rede real (`page.waitForResponse`) que o site já gera
  sozinho. Isso evita ter que adivinhar formato de request e funciona
  igual pra site com API JSON ou só HTML renderizado.
- Playwright **não roda no Vercel** (limite de tempo/memória do free
  tier). Roda inteiramente via **GitHub Actions** em cron, gravando
  direto no Postgres. Vercel só serve o site (lê do Postgres).

## Arquitetura

```
[GitHub Actions cron 6h] -> scripts/scan.ts
                      -> sources/sympla.ts (Playwright: abre página,
                         clica filtro "Grátis"/"Pago", intercepta
                         resposta de rede da própria API do site)
                      -> normaliza -> upsert Postgres

[Homepage /] -> Server Component (Next.js na Vercel) -> query Postgres
                      -> filtra (RJ + grátis/≤R$20 + ativo)
                      -> renderiza cards (imagem, nome, data, link)
```

## Schema normalizado (por evento)

```ts
{
  id: string;          // `${source}:${externalId}`
  source: 'ingresse' | 'ingresso' | 'sympla' | 'eventbrite' | 'even3' | 'bileto';
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
- **Preço (Sympla)**: a listagem da API não traz valor numérico, só
  filtro server-side "Grátis"/"Pago". Fluxo:
  - Aba "Grátis" → todos os resultados entram com `isFree=true`,
    `minPrice=0`.
  - Aba "Pago" → cada evento candidato tem sua página de detalhe
    visitada, preço lido do texto renderizado (`R$ X,XX`), evento só
    entra se `minPrice <= 20`.
  - Limitação conhecida do MVP: só a primeira página de resultados de
    cada aba é processada (sem paginação/infinite-scroll ainda).
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

- Unit: normalizer da Sympla (fixture JSON real capturado → schema
  normalizado correto), incluindo casos de campo ausente.
- Unit: parser de texto de preço (`R$ 15,00`, `R$ 15,00 a R$ 45,00`,
  `A partir de R$ 20,00`, texto sem preço → `null`).
- Unit: função de filtro RJ + preço (casos: grátis, 15, 20, 20.01, 25,
  outro estado, sem uf mas cidade do RJ).
- Unit: orquestração do scraper Sympla e do `runScan` usando dublês
  (fake `Page` do Playwright, fake store) — sem depender de rede real.
- Unit: camada de banco (`eventsStore`) usando `pg-mem` (Postgres em
  memória) — sem depender de banco real na máquina de dev.
- Component test (React Testing Library + jsdom): grid de eventos
  renderiza imagem/nome/data/link a partir de eventos de fixture.

## Fora de escopo (YAGNI, considerar depois)

- Domínio próprio pago.
- Notificações (email/push) de novo evento.
- Busca/filtro manual na UI (cidade específica, categoria de evento).
- Outros sites de ingresso além dos 4 listados.
- Rate limiting / anti-bloqueio agressivo — parte do scraper deve ser
  respeitosa (intervalo entre requests, User-Agent identificável) mas
  sistema de retry/backoff sofisticado fica pra depois se necessário.
