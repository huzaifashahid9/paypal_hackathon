# OpenShelf

**Make any small shop buyable by AI agents, safely, paid through PayPal.**

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Everything runs in the PayPal **sandbox**. No real money moves.

- The **merchant** decides what agents can buy, in plain English ("Saturday pickup only. Anything over $75 needs my OK.").
- The **buyer** decides what their agent can spend, with a Buyer Pass (budget, expiry, allowed shops).
- AI translates and explains. **Code decides. PayPal moves the money.**

## The problem

Agentic commerce assumes the shop is already an API. Most shops are not. A bakery with a phone number and an Instagram page cannot be bought from by an AI agent, and the tools that would change that are built for merchants with engineers.

And the shops that *are* reachable have the opposite problem: nothing stands between an agent and the merchant's inventory. The merchant cannot say "not on a Tuesday" and the buyer cannot say "never more than $50".

OpenShelf is both halves: a shop becomes agent-buyable in about a minute, and every order passes a policy engine that both sides can see.

## Try it in 60 seconds

1. **`/demo`** — one button. A scripted buyer agent places three orders at the demo bakery and you watch each tool call: one allowed, one held for the baker, one blocked by the buyer's own budget.
2. **`/dashboard`** — the merchant's Trust Dashboard. The held order is waiting there. Approve it.
3. **`/onboard`** — publish your own shop. There is a "Fill with an example" button.
4. **`/pass`** — make a Buyer Pass, then add `<your-url>/s/rosies-bakery/mcp` to Claude or ChatGPT as a custom connector and shop for real.

## How it works

```
AI agent (Claude, ChatGPT, …)
   │  MCP over HTTP: 7 tools
   ▼
/s/{shop}/mcp ──► policy engine (pure code) ──► allowed │ held │ blocked
                        │                          │
                        │                          └─► Trust Dashboard: merchant approves
                        ▼
                  PayPal Orders v2 ──► buyer approves in PayPal ──► capture ──► Agent Receipt
```

**The seven tools** an agent gets per shop: `search_products`, `get_product`, `ask_shop`, `check_policy`, `create_order`, `order_status`, `request_refund`.

**The three outcomes**, and who owns each:

| Outcome | Who decided | What the agent is told |
| --- | --- | --- |
| **Allowed** | Nobody objected | Here is a PayPal link for the buyer to approve |
| **Held** | The merchant's House Rules | Waiting for the merchant. Do not retry with a smaller order |
| **Blocked** | The buyer's own Buyer Pass | Why it was refused, and to stop |

A merchant's rule can only ever **hold** an order, never block it, because no merchant wants software turning a sale away on their behalf. Only the buyer's own limits can block.

## Where AI is used, and where it is not

| Used for | Not used for |
| --- | --- |
| Reading a pasted menu or price list into a product draft, with a confidence per row | Prices. A CSV is parsed by code, and an AI-read price is shown to the merchant to confirm |
| Turning "anything over $75 needs my OK" into a structured House Rule | Enforcing a rule. The policy engine is pure code and fully tested |
| Answering an agent's questions from the shop's own "About" text | Inventing facts. With no AI key it falls back to quoting the text |

Every AI output is validated against a zod schema before it is used, and untrusted text (merchant input, product descriptions, buyer notes) is wrapped as data. A successful prompt injection still cannot change an allow, hold or block decision, because the model is never asked for one.

## Trust and safety

- **Buyer Pass codes are never stored in the clear.** Only a SHA-256 hash and the last four characters.
- **Agent Receipts are signed** (HMAC over order id, total, PayPal order id and capture id). `/r/{id}` shows whether the signature still verifies.
- **Order splitting is caught**: a pass's budget counts what it already spent at that shop in the last 24 hours, so three $40 orders cannot get around a $50 limit.
- **PayPal requests are idempotent** (`PayPal-Request-Id`), and a capture is never run twice.
- **Webhook signatures are verified** with PayPal's verify endpoint before an event is acted on.
- **The buyer always approves the payment themselves in PayPal.** OpenShelf never holds card details.

### Known limits (this is a hackathon build)

- `/dashboard`, `/onboard` and `/demo` have no sign-in. Anyone with the link can publish a shop or approve a held order. Real use needs merchant accounts.
- There is no rate limit on the MCP endpoint or on the demo.
- Sandbox only. The PayPal credentials are sandbox credentials by design.

## Run locally

Requires Node.js 20.9 or later.

```bash
npm install
cp .env.example .env.local   # the app starts with no keys at all
npm run dev
```

Open http://localhost:3000. With no `DATABASE_URL`, data lives in an embedded Postgres in `.pglite/`, and three demo shops are seeded on first load.

| Variable | Needed for |
| --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET` | Taking payment. Without them, orders are still evaluated but cannot be paid |
| `PAYPAL_WEBHOOK_ID` | Verifying webhook signatures |
| `OPENAI_API_KEY` | Reading free-text catalogs and translating House Rules. Both have code fallbacks |
| `DATABASE_URL` | Neon Postgres in production. Empty means local embedded Postgres |
| `APP_URL` | PayPal return links and the MCP address shown to merchants |
| `RECEIPT_SECRET` | Signing Agent Receipts. Any long random string |

```bash
npm test          # 53 tests: policy engine, MCP flow, onboarding, demo
npm run typecheck
npm run build
```

Deploying to Vercel and Neon on free tiers: [`docs/deploy.md`](docs/deploy.md).

## Connect an agent

In Claude or ChatGPT, add a custom connector (MCP server) pointing at `<your-url>/s/{shop}/mcp`, then tell it:

> When you shop for me on OpenShelf, use my Buyer Pass code PASS-XXXX-XXXX. Never spend beyond it.

## Map of the code

| Path | What it is |
| --- | --- |
| `lib/policy/` | The policy engine: allow, hold or block. Pure code, no AI, no I/O |
| `lib/mcp/` | The seven agent tools and the shop MCP server |
| `lib/orders.ts` | Order lifecycle: check, create, hold, approve, capture, refund |
| `lib/paypal.ts` | PayPal REST: Catalog Products, Orders v2, capture, refunds, webhook verification |
| `lib/ai.ts` | The single AI wrapper (OpenAI-compatible). Output validated before it is trusted |
| `lib/onboarding/` | CSV import, free-text product reading, House Rule translation, publishing |
| `lib/readiness.ts` | The Agent Readiness Score |
| `lib/mystery-shopper.ts` | The scripted buyer agent behind `/demo` |
| `lib/db/` | Schema and connection (Neon in production, embedded Postgres locally) |
| `app/` | Next.js App Router: `/onboard`, `/s/{shop}`, `/dashboard`, `/pass`, `/r/{id}`, `/demo` |

Built with Next.js 16, TypeScript, drizzle-orm, the Model Context Protocol SDK, AG Grid Community and the OpenAI SDK.

## License

MIT
