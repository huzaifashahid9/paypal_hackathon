# Deploying OpenShelf for free

Target: a public URL that stays up through judging (Dec 1–15, 2026), at $0.

## 1. Database: Neon free tier

1. Sign up at [neon.tech](https://neon.tech) and create a project (region close to your Vercel region).
2. Copy the **pooled** connection string. It looks like `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.

The app creates its own tables on first connection and seeds the three demo shops, so there is no migration step.

## 2. PayPal sandbox app

1. Go to the [PayPal Developer dashboard](https://developer.paypal.com/dashboard/applications/sandbox) and create a REST app (Sandbox).
2. Copy the **Client ID** and **Secret**.
3. Under Sandbox → Accounts, note the **personal** test account's email and password. That is who you log in as to approve a payment in the demo.

Do the webhook after the first deploy, when you have a URL:

4. In the app, add a webhook at `https://<your-domain>/api/paypal/webhook` subscribed to `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED` and `PAYMENT.CAPTURE.REFUNDED`.
5. Copy the **Webhook ID** into `PAYPAL_WEBHOOK_ID` and redeploy.

## 3. Vercel Hobby

1. Import the repository at [vercel.com/new](https://vercel.com/new). The framework is detected as Next.js; no build settings to change.
2. Add the environment variables below for **Production** and **Preview**, then deploy.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The Neon pooled connection string |
| `PAYPAL_CLIENT_ID` | From the sandbox app |
| `PAYPAL_SECRET` | From the sandbox app |
| `PAYPAL_WEBHOOK_ID` | After step 2.5 |
| `OPENAI_API_KEY` | Your OpenAI key |
| `OPENAI_MODEL` | `gpt-5.4-mini` (or another model you have access to) |
| `APP_URL` | `https://<your-domain>` — no trailing slash |
| `RECEIPT_SECRET` | A long random string. `openssl rand -hex 32` |

`APP_URL` must be right before you demo: PayPal return links and the MCP address shown to merchants are built from it.

Using Gemini's free tier instead of OpenAI: set `OPENAI_BASE_URL` to Gemini's OpenAI-compatible endpoint, `OPENAI_API_KEY` to the Gemini key and `OPENAI_MODEL` to a Gemini model. Nothing else changes.

## 4. Smoke test the deployment

In this order, on the live URL:

1. `/` loads and lists the three demo shops.
2. `/demo` → **Run the demo**. Three outcomes appear and the PayPal notice does **not** show.
3. On the allowed order, **Pay as the buyer in PayPal sandbox** → log in with the personal sandbox account → pay. You land back on OpenShelf with a receipt link.
4. Open `/r/{id}`: the PayPal capture id is filled in and the signature verifies.
5. `/dashboard` → approve the held order. It moves to awaiting payment.
6. `/onboard` → fill with the example → publish → the new shop's page loads.
7. `POST` to `/s/rosies-bakery/mcp` from an MCP client and call `search_products`.

If step 3 fails with "This shop has not connected PayPal yet", the PayPal variables did not reach the deployment: check the environment, then redeploy.

## 5. Keep it up through judging

- Neon free projects suspend when idle and wake on the next request, which costs a few seconds on the first hit. Open the site once before a judge does.
- Do not delete the Neon branch or the Vercel project until judging ends (Dec 15, 2026).
- Vercel preview deployments share the same database unless you give Preview a different `DATABASE_URL`.
