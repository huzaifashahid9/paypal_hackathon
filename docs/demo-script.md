# Demo video script (under 3 minutes)

The submission requires a YouTube video under 3 minutes. This is a shot list with timings and the exact words. Total: 2:45, which leaves room to breathe.

**Before recording**

- Deploy is live, PayPal sandbox keys set, `/demo` shows no PayPal warning.
- Logged into the PayPal sandbox **personal** account in a second browser profile, so the payment is one click, not a login.
- Tabs open in this order: `/demo`, `/dashboard`, `/onboard`. Browser zoom 110%, no bookmarks bar, light mode.
- Run `/demo` once before recording so the first run is warm, then reload.

---

## 0:00–0:20 · The problem

**Screen:** the OpenShelf home page.

> AI agents can shop at Amazon. They cannot shop at my neighbourhood bakery, because the bakery is a phone number and an Instagram page. And the merchants who *are* reachable have the opposite problem: nothing stops an agent buying four hundred dollars of cake at midnight.
>
> OpenShelf fixes both halves. Any shop becomes buyable by an AI agent in about a minute, and every order has to get past rules both sides can see.

## 0:20–0:50 · Onboarding

**Screen:** `/onboard`. Click "Fill with an example", then "Read my shop".

> Here is a shop owner. She pastes her product list, and writes her rules the way she'd say them out loud: pickup only on Sundays, anything over sixty dollars needs my OK.
>
> AI reads the list and translates her sentences. But look: it shows her each rule in plain English with her own words beside it, and nothing applies until she ticks it. The Readiness Score tells her what an agent still can't work out. Publish, and she has an address an AI agent can connect to.

**Screen:** the published shop page. Hover the MCP address.

## 0:50–1:50 · The three outcomes

**Screen:** `/demo`. Click "Run the demo". Let the transcript play.

> Now the buyer's side. Our Mystery Shopper is an agent calling the same seven tools Claude would call.
>
> First order: twelve sourdough rolls, eighteen dollars. Inside the buyer's budget, inside every rule. **Allowed** — and PayPal takes over.
>
> Second: a hundred and twenty dollar celebration cake. The buyer can afford it, but the baker reviews anything over seventy-five. **Held.** Note what did *not* happen: the sale wasn't refused. A merchant rule can only ever pause an order, never kill it.
>
> Third: the same cake, but with the small pass. **Blocked** — and this one is the buyer's own limit. Fifty dollars per order means fifty dollars, and neither the agent nor the shop can argue with it.
>
> Those decisions are made by code, not by a language model. You cannot talk the policy engine into anything.

## 1:50–2:20 · Merchant approves, buyer pays

**Screen:** `/dashboard`. Approve the held order. Then back to `/demo` and pay the allowed order in PayPal sandbox.

> The baker sees it in her Trust Dashboard, with the reason it's waiting. She approves. Now the buyer pays, in PayPal, themselves — we never hold card details.

**Screen:** the Agent Receipt at `/r/{id}`.

> And the buyer gets an Agent Receipt: what was bought, which checks it passed, the PayPal capture id, and a signature so it can't be edited afterwards.

## 2:20–2:45 · Close

**Screen:** the Trust Dashboard with all three decisions visible.

> Everything runs on the PayPal sandbox: Catalog Products, Orders v2, capture, refunds and verified webhooks. AI reads, writes and explains. Code decides. PayPal moves the money.
>
> That's OpenShelf.

---

## If something fails on the day

- PayPal login is slow → have the sandbox account already logged in, and cut to the receipt.
- The held order was already approved by an earlier run → run `/demo` again; each run makes fresh orders.
- A judge asks what is real: every number on screen comes from the PayPal sandbox API and the app's own database. Nothing in the demo is faked or pre-recorded.
