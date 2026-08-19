# Anasdata — Data Bundle Reseller

A React storefront + admin dashboard for reselling data bundles in Ghana, with **two ways to buy**: the website (Paystack) and **USSD** (dial a code, pay by mobile money via Arkesel). Both drop orders into one place you control.

**How it works for your business:**

1. A customer buys either on the **website** (pays with Paystack) or over **USSD** (dials your code, approves a mobile-money prompt).
2. A **Supabase Edge Function verifies the payment server-side** (so nobody can fake "paid"), saves the order, and sends you a **Telegram alert**.
3. You log into the private **Admin dashboard**, see all paid orders, **download the order sheet** (phone number + package), hand it to whoever loads the bundle, and mark each order as done.

```
Website → Paystack ─┐
                    ├─→ Edge Function (verify) → Supabase DB → Admin dashboard → Order sheet (CSV)
USSD → Arkesel MoMo ┘                          └─→ Telegram alert
```

---

## What's in here

| Path | What it is |
|------|-----------|
| `src/` | React app (storefront + admin) |
| `src/lib/data.js` | **Your bundle prices & packages** — edit here |
| `supabase/setup.sql` | Database setup — run once in Supabase (wipes + creates) |
| `supabase/functions/_shared/catalogue.ts` | Server-side price list (used by both Edge Functions) |
| `supabase/functions/verify-payment/` | Website payment verification (Paystack) + Telegram alert |
| `supabase/functions/ussd/` | Arkesel USSD menu handler |
| `supabase/functions/arkesel-callback/` | Confirms USSD mobile-money payments |
| `_legacy/` | Your original vanilla-JS version (kept for reference) |

---

## Setup (about 30–40 min, one time)

### 1. Install & run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. The storefront works immediately. Payments, USSD, and the admin area need the steps below.

### 2. Create a Supabase project (free)

1. Go to https://supabase.com → **New project**. Save the database password.
2. Open **Project Settings → API** and copy:
   - **Project URL** → `VITE_PUBLIC_SUPABASE_URL`
   - **anon / publishable** key → `VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Open **SQL Editor → New query**, paste all of `supabase/setup.sql`, and click **Run**.
   ⚠️ This **drops every existing table** in your `public` schema, then creates fresh ones.
4. Create your admin login: **Authentication → Users → Add user** (your email + a password).
5. **Authentication → Providers → Email** → turn **OFF** "Allow new users to sign up" (so only you can log in).

### 3. Add your keys to `.env`

Copy `.env.example` to `.env` and fill in:

```
VITE_PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxx                 # Paystack → Settings → API Keys (PUBLIC key)
VITE_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
VITE_USSD_CODE=                                            # optional: your dial code, e.g. *928*123#
```

Restart `npm run dev` after editing `.env`.

> ⚠️ **Never** put your Paystack **secret** key, the Supabase **service_role** key, or your **Arkesel API key** in `.env` — anything here ships to the browser. Those live in Edge Function secrets (next steps).

### 4. Deploy the Edge Functions

Install the Supabase CLI (https://supabase.com/docs/guides/cli), then:

```bash
supabase login
supabase link --project-ref YOUR-PROJECT-REF

supabase functions deploy verify-payment
supabase functions deploy ussd            --no-verify-jwt
supabase functions deploy arkesel-callback --no-verify-jwt
```

> `ussd` and `arkesel-callback` **must** use `--no-verify-jwt` — Arkesel calls them without a Supabase login token, so they have to be publicly reachable.

Set the function secrets (these stay on the server, never in the browser):

```bash
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxxxxxxx
supabase secrets set TELEGRAM_BOT_TOKEN=123456:ABC-your-bot-token
supabase secrets set TELEGRAM_CHAT_ID=123456789
supabase secrets set ARKESEL_PAYMENT_API_KEY=your-arkesel-payments-api-key   # for USSD payments
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically — you don't set those.

### 5. Get instant order alerts on Telegram (2 min)

1. In Telegram, message **@BotFather** → `/newbot` → copy the **bot token** → that's `TELEGRAM_BOT_TOKEN`.
2. Send any message to your new bot, then open
   `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser and copy the `chat.id` → that's `TELEGRAM_CHAT_ID`.
3. Re-run the two `supabase secrets set` commands above if you hadn't yet.

---

## USSD setup (Arkesel)

The USSD channel lets people buy by **dialing a code** — no smartphone or internet needed. Menu flow:
**pick network → pick bundle → whose number → confirm → approve mobile-money prompt.**

1. **Get a USSD code** from Arkesel (https://arkesel.com/developer-api/ussd-api/) and enable the **Payments** product (for the mobile-money charge).
2. Get your **Arkesel API key** and set it as `ARKESEL_PAYMENT_API_KEY` (step 4 above).
3. In the Arkesel dashboard, set your USSD code's **callback URL** to your deployed `ussd` function:
   ```
   https://YOUR-PROJECT.supabase.co/functions/v1/ussd
   ```
4. Set the **Payments callback URL** to your `arkesel-callback` function:
   ```
   https://YOUR-PROJECT.supabase.co/functions/v1/arkesel-callback
   ```
5. Put your dial code in `.env` as `VITE_USSD_CODE` so it shows on the website too.

**How payment works over USSD:** on "Confirm", the `ussd` function records the order as **pending** and asks Arkesel to send a mobile-money PIN prompt to the caller. When they approve, Arkesel calls `arkesel-callback`, which verifies the charge and flips the order to **paid** (and alerts you on Telegram). If you haven't set `ARKESEL_PAYMENT_API_KEY` yet, USSD orders are still captured as *pending* and you're alerted, so no sale is lost.

> **Note:** Arkesel's Payments **callback payload** isn't publicly documented. On your first real USSD payment, open the `arkesel-callback` function logs (Supabase → Edge Functions → Logs), check the printed payload, and adjust the field names near the top of `arkesel-callback/index.ts` if your account uses different keys. The USSD **menu** format is confirmed against Arkesel's official sample and needs no changes.

---

## Using the admin dashboard

- Go to **`/admin`** and log in with the user you created.
- New paid orders appear at the top **automatically** (live updates). The **Via** column shows 🌐 website or 📟 USSD.
- **Awaiting payment** filter shows USSD orders where the customer hasn't approved the MoMo prompt yet.
- **Start** → marks an order *Processing*; **Mark Loaded** → marks it *done*.
- **⬇️ Download Order Sheet** exports the current list as a CSV (opens in Excel) with **phone number + package** — the sheet you give to your loader.

Customers can check their own order at **`/track`** using the reference on their receipt.

---

## Going live (production)

1. **Paystack:** use your `pk_live_` / `sk_live_` keys (Paystack requires business verification first).
2. **Deploy the site** free on **Vercel** or **Netlify**:
   - Push this folder to GitHub → import into Vercel/Netlify.
   - Framework preset: **Vite**. Build command `npm run build`, output `dist`.
   - Add the `VITE_...` variables in the host's Environment Variables settings.
3. Single-page-app redirect so refreshes work:
   - **Netlify:** create `public/_redirects` containing `/*  /index.html  200`
   - **Vercel:** handled automatically for Vite SPAs.

---

## Editing your packages / prices

Two files hold the catalogue and **must stay in sync** (same `id` + `price`):

- `src/lib/data.js` — what the website shows.
- `supabase/functions/_shared/catalogue.ts` — what the server uses to verify payments and build the USSD menu.

After changing a price or adding a bundle, redeploy the functions:
```bash
supabase functions deploy verify-payment
supabase functions deploy ussd --no-verify-jwt
```
If the two files disagree, that bundle's website payment is rejected as an "amount mismatch".

---

## Security notes

- Payments are **verified server-side** (Paystack for web, Arkesel verify for USSD) — a customer can't fake a successful payment or pay a lower amount.
- The `orders` table (customer phone/email) is **not readable by the public**; only your logged-in admin account can read it. The `ussd_sessions` table is service-role only.
- Order tracking returns a single order **only** when the exact reference is supplied — no one can list other customers' orders.
- Your live Paystack key is currently in `.env`, so real cards/MoMo will be charged. Use `pk_test_` while testing.
