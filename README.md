# Goldberry 🫐 — snack-size gold savings

Goal-based micro-gold vaults on **Whop money rails**. Deadly simple: sign in, open your gold account, type $10, watch real grams stack.

- **Frontend:** Vite React + TS PWA (`src/`), EN only, GenZ tone. Demo mode fully usable logged-out; LIVE mode after sign-in.
- **Auth:** Whop OAuth 2.1 + PKCE, server-side sessions (Blobs, httpOnly cookie).
- **Money:** per-user connected accounts (`ensure-account`), Whop Elements (Balance/Deposit/Withdraw mounted on the user's own account), real USDT→XAUT swaps (`swaps-execute` + status polling), ledger-synced vaults (`vaults-sync`).
- **Backend:** Netlify Functions (`netlify/functions/`), zero npm deps in hot paths (plain `fetch`, instant bundles).
- **Monetization:** 2% `crypto_withdrawal_markup` (LIVE on `biz_VHruXn7hDphfiz`) → 0.8% tier-1 + 0.2% tier-2 referrals (48h hold) via Transfers API.
- **Tests:** offline E2E against a mock Whop (`scripts/mock-whop.ts` + `scripts/e2e-mock.ts`, 16 checks green).

## Live

- **App:** https://goldberry-app.netlify.app
- **API:** `/.netlify/functions/{oauth-config,oauth-exchange,oauth-session,oauth-logout,ensure-account,token,gold-price,swaps-quote,swaps-execute,swaps-status,vaults-sync,webhooks-whop,scheduled-payouts}`
- **Repo:** https://github.com/tacibey/goldberry-app (private)
- **Whop:** 2% `crypto_withdrawal_markup` LIVE on `biz_VHruXn7hDphfiz`; real USDT→XAUT quotes on Plasma (~$4.1k/oz)

## Live

- **App:** https://goldberry-app.netlify.app
- **API:** `/.netlify/functions/{token,gold-price,swaps-quote,webhooks-whop,scheduled-payouts}`
- **Repo:** https://github.com/tacibey/goldberry-app (private)
- **Whop:** 2% `crypto_withdrawal_markup` LIVE on `biz_VHruXn7hDphfiz`; real USDT→XAUT quotes on Plasma (~$4.1k/oz)

## Remaining manual steps (dashboard OAuth required)

1. **OAuth app (blocks sign-in):** Whop Developer Dashboard → Apps → Create `Goldberry` →
   redirect URI `https://goldberry-app.netlify.app/oauth/callback`, scopes `openid profile email` →
   copy `client_id` + `client_secret` → `netlify env:set WHOP_OAUTH_CLIENT_ID …` /
   `WHOP_OAUTH_CLIENT_SECRET …` → redeploy. Until then the app runs in demo mode.
2. **GitHub auto-deploy:** Netlify dashboard → goldberry-app → Site settings →
   Build & deploy → Link repository → `tacibey/goldberry-app` (branch `main`).
   (API linking needs a GitHub App install — 2 clicks in the UI.)
3. **Webhook (optional, polling covers it):** Whop Developer Dashboard → Webhooks → Add endpoint:
   `https://goldberry-app.netlify.app/.netlify/functions/webhooks-whop`,
   events: `payment.succeeded` (+ tick `developer:manage_webhook` on the API key).
4. **Referral cron:** cron-job.org → `POST https://goldberry-app.netlify.app/.netlify/functions/scheduled-payouts` every 24h.
5. **Custom domain:** when ready — Netlify Domain settings → add `goldberry.finance`.
6. **First real-money pass (you, ~15 min):** sign in → open gold account → KYC link →
   deposit ~$10-20 USDT → Stack → watch real grams land → withdraw test.

## Offline E2E (no keys, no network to Whop)

```bash
./node_modules/.bin/tsx scripts/mock-whop.ts &   # stub on :8787
WHOP_API_BASE=http://127.0.0.1:8787/api/v1 \
WHOP_OAUTH_BASE=http://127.0.0.1:8787/oauth \
WHOP_API_KEY=mockkey WHOP_OAUTH_CLIENT_ID=mockid \
WHOP_OAUTH_CLIENT_SECRET=mocksecret BIZ_ID=biz_platform \
./node_modules/.bin/tsx scripts/e2e-mock.ts       # 16 checks
```

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
