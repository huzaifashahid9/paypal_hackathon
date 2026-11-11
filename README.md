# OpenShelf

**Make any small shop buyable by AI agents, safely, paid through PayPal.**

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Everything runs in the PayPal **sandbox**.

- The **merchant** decides what agents can buy, in plain English ("Saturday pickup only. Anything over $75 needs my OK.").
- The **buyer** decides what their agent can spend, with a Buyer Pass (budget, expiry, allowed shops).
- AI translates and explains. **Code decides. PayPal moves the money.**

> Status: work in progress. This README grows as each part lands.

## Run locally

Requires Node.js 20.9 or later.

```bash
npm install
cp .env.example .env.local   # fill in what you have; the app starts without any keys
npm run dev
```

Open http://localhost:3000. With no `DATABASE_URL`, data lives in an embedded Postgres in `.pglite/`, and three demo shops are seeded on first load.

```bash
npm test          # policy engine and seed tests
npm run typecheck
```

## What is here so far

| Path | What it is |
| --- | --- |
| `lib/policy/` | The policy engine: allow, hold or block. Pure code, no AI, fully tested. |
| `lib/paypal.ts` | PayPal REST client: Catalog Products, Orders v2, capture, refunds, webhook verification. Idempotent. |
| `lib/ai.ts` | The single AI wrapper (OpenAI-compatible). Output is validated before it is trusted. |
| `lib/db/` | Schema and connection (Neon Postgres in production, embedded Postgres locally). |
| `lib/seed-data.ts` | Three fictional demo shops. |

## License

MIT
