// Offline E2E: exercises every Netlify function against the mock Whop backend.
// Usage: npx tsx scripts/mock-whop.ts &  →  WHOP_API_BASE=... npx tsx scripts/e2e-mock.ts
// Fails loud (non-zero exit) on the first broken contract.
import exchange from '../netlify/functions/oauth-exchange.ts';
import sessionFn from '../netlify/functions/oauth-session.ts';
import logoutFn from '../netlify/functions/oauth-logout.ts';
import ensureAccount from '../netlify/functions/ensure-account.ts';
import tokenFn from '../netlify/functions/token.ts';
import quoteFn from '../netlify/functions/swaps-quote.ts';
import executeFn from '../netlify/functions/swaps-execute.ts';
import statusFn from '../netlify/functions/swaps-status.ts';
import syncFn from '../netlify/functions/vaults-sync.ts';
import payoutsFn from '../netlify/functions/scheduled-payouts.ts';

const BASE = 'http://127.0.0.1:8787';
let cookie = '';

function req(path: string, init?: { method?: string; body?: unknown }): Request {
  return new Request(`${BASE}${path}`, {
    method: init?.method || 'GET',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    } as Record<string, string>,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
}

async function call(fn: (r: Request) => Promise<Response>, path: string, init?: { method?: string; body?: unknown }) {
  const res = await fn(req(path, init));
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const m = setCookie.match(/gb_session=([^;]*)/);
    cookie = m && m[1] ? `gb_session=${m[1]}` : '';
  }
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body: body as Record<string, unknown> };
}

function assert(cond: boolean, msg: string, extra?: unknown) {
  if (!cond) {
    console.error(`FAIL: ${msg}`, extra ?? '');
    process.exit(1);
  }
  console.log(`ok: ${msg}`);
}

async function main() {
  // 0) mock is up?
  const ping = await fetch(`${BASE}/api/v1/fee_markups`).then((r) => r.ok).catch(() => false);
  assert(ping, 'mock backend reachable');

  // 1) exchange code → session cookie
  let r = await call(exchange, '/oauth-exchange', {
    method: 'POST',
    body: { code: 'c', code_verifier: 'v', redirect_uri: 'http://x/cb' },
  });
  assert(r.status === 200 && r.body.ok === true, 'oauth exchange', r.body);
  assert(cookie.includes('gb_session='), 'session cookie set');

  // 2) session → logged in, no account yet
  r = await call(sessionFn, '/oauth-session');
  assert(r.body.loggedIn === true && r.body.accountId === null, 'session logged in, account null', r.body);

  // 3) ensure-account → KYC needed + onboarding URL
  r = await call(ensureAccount, '/ensure-account', { method: 'POST' });
  assert(r.status === 200 && r.body.needsKyc === true, 'account created, KYC needed', r.body);
  assert(typeof r.body.onboardingUrl === 'string', 'onboarding URL minted');

  // 4) flip mock to verified → ensure again → verified, same account
  await fetch(`${BASE}/__control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ verified: true }) });
  r = await call(ensureAccount, '/ensure-account', { method: 'POST' });
  assert(r.body.needsKyc === false && r.body.accountId === 'biz_mock1', 'verified account', r.body);

  // 5) token: own account ok, чужой account rejected
  r = await call(tokenFn, '/token?accountId=biz_mock1');
  assert(r.status === 200 && typeof r.body.token === 'string' && r.body.mine === true, 'per-user token', r.body);
  r = await call(tokenFn, '/token?accountId=biz_evil');
  assert(r.status === 403, 'cross-account token rejected');

  // 6) quote → real numbers
  r = await call(quoteFn, '/swaps-quote', { method: 'POST', body: { amountUSD: 10 } });
  assert(r.body.mode === 'whop-quote' && (r.body.grams as number) > 0, 'whop quote', r.body);

  // 7) execute → poll to complete
  r = await call(executeFn, '/swaps-execute', {
    method: 'POST',
    body: { amountUSDT: 10, ref: { tier1: 'user_ref1', tier2: null } },
  });
  assert(r.status === 200 && typeof r.body.swapId === 'string', 'swap created', r.body);
  const swapId = r.body.swapId as string;
  let final: Record<string, unknown> = {};
  for (let i = 0; i < 5; i++) {
    const s = await call(statusFn, `/swaps-status?id=${swapId}`);
    final = s.body;
    if (final.terminal) break;
  }
  assert(final.status === 'complete' && (final.grams as number) > 0, 'swap completed with grams', final);

  // 8) vaults-sync → ledger grams
  r = await call(syncFn, '/vaults-sync');
  assert((r.body.grams as number) > 0 && r.body.accountId === 'biz_mock1', 'vault sync from ledger', r.body);

  // 9) referral pending recorded
  r = await call(payoutsFn, '/scheduled-payouts?stats=1');
  assert((r.body.count as number) >= 1, 'referral intent recorded', r.body);

  // 10) logout → logged out
  r = await call(logoutFn, '/oauth-logout', { method: 'POST' });
  assert(r.body.ok === true, 'logout ok');
  r = await call(sessionFn, '/oauth-session');
  assert(r.body.loggedIn === false, 'session destroyed');

  console.log('\nALL E2E CHECKS PASSED ✔');
}

main().catch((e) => {
  console.error('E2E CRASH:', e);
  process.exit(1);
});
