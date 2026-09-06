# ticket-free

Varredura de eventos grátis ou até R$20 no estado do Rio de Janeiro.
MVP cobre só a Sympla — outras fontes (Ingresse, Ingresso.com,
Eventbrite, Even3/Bileto) entram depois, cada uma com sua própria
verificação antes de codar (ver `docs/superpowers/specs/`).

## Rodar localmente

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env.local   # preencha DATABASE_URL
npm run dev                  # site em http://localhost:3000
```

## Rodar a varredura manualmente

```bash
DATABASE_URL="postgres://..." npm run scan
```

## Testes

```bash
npm test
```

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
