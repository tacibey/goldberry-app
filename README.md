# Goldberry 🫐 — snack-size gold savings

Goal-based micro-gold vaults on **Whop money rails**. Deadly simple: pick a vault, type $10, watch grams stack.

- **Frontend:** Vite React + TS PWA (`src/`), EN only, GenZ tone
- **Money:** Whop Elements (Balance / Deposit / Withdraw) + real Swaps quotes (USDT→XAUT on Plasma, ~1% Whop fee)
- **Backend:** Netlify Functions (`netlify/functions/`)
- **Storage:** localStorage first, Netlify Blobs for referral ledger, Whop company metadata mirror (when live)
- **Monetization:** 2% `crypto_withdrawal_markup` (LIVE on `biz_VHruXn7hDphfiz`) → 0.8% tier-1 + 0.2% tier-2 referrals (48h hold) via Transfers API

## Live

- **App:** https://goldberry-app.netlify.app
- **API:** `/.netlify/functions/{token,gold-price,swaps-quote,webhooks-whop,scheduled-payouts}`
- **Repo:** https://github.com/tacibey/goldberry-app (private)
- **Whop:** 2% `crypto_withdrawal_markup` LIVE on `biz_VHruXn7hDphfiz`; real USDT→XAUT quotes on Plasma (~$4.1k/oz)

## Remaining manual steps (dashboard OAuth required)

1. **GitHub auto-deploy:** Netlify dashboard → goldberry-app → Site settings →
   Build & deploy → Link repository → `tacibey/goldberry-app` (branch `main`).
   (API linking needs a GitHub App install — 2 clicks in the UI.)
2. **Webhook:** Whop Developer Dashboard → Webhooks → Add endpoint:
   `https://goldberry-app.netlify.app/.netlify/functions/webhooks-whop`,
   events: `payment.succeeded`. Copy the signing secret, then:
   `netlify env:set WHOP_WEBHOOK_SECRET <secret>` + redeploy.
   (API key currently lacks `developer:manage_webhook` — tick it on the key too.)
3. **Referral cron:** cron-job.org → `POST https://goldberry-app.netlify.app/.netlify/functions/scheduled-payouts` every 24h.
4. **Custom domain:** when ready — Netlify Domain settings → add `goldberry.finance`.

## Quickstart (local)

```bash
cd goldberry-app
cp .env.example .env   # fill WHOP_API_KEY + WHOP_WEBHOOK_SECRET
npm install
npm run dev            # http://localhost:5173
```

## Whop wiring (needs the new admin API key)

```bash
export WHOP_API_KEY=<new key> BIZ_ID=biz_VHruXn7hDphfiz
npm run fees:setup     # probes real FeeMarkupTypes, sets 2% rail
```

Then in Netlify dashboard → Site settings → Environment: set
`WHOP_API_KEY`, `WHOP_WEBHOOK_SECRET`, `BIZ_ID`, and deploy `dist/`.
Register webhook URL `https://<site>/.netlify/functions/webhooks-whop`
in the Whop Developer Dashboard (events: `payment.succeeded`).

Referral payouts: ping `POST /.netlify/functions/scheduled-payouts`
every 24h (cron-job.org) — 48h hold enforced in code, 25 transfers/run cap.

## CTO notes (brief corrections applied)

- No `ConvertElement` exists — custom SwapBox + Swaps API instead.
- No `crypto_swap_markup` exists — withdrawal markups probed live via script.
- Webhooks use Standard Webhooks verify (not hex HMAC).
- XAUT: live CoinGecko → server fallback chain; real swap fires only when Whop supports it.
