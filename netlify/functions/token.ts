// GET /.netlify/functions/token?accountId=biz_xxx
// Mints a short-lived Elements access token.
// - Logged-in users (session cookie): mints for THEIR OWN connected account.
//   Never mints for an account that isn't theirs (ownership guard).
// - Logged-out / demo: falls back to the platform business (read-only showcase).
// Zero-dependency: plain fetch to the Whop REST API (keeps bundles instant).
import { json, WHOP_API } from './_shared.ts';
import { loadSession } from './oauth-session.ts';

export default async (req: Request) => {
  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) return json(503, { error: 'WHOP_API_KEY not configured yet' });

  const url = new URL(req.url);
  const requested = url.searchParams.get('accountId');
  const found = await loadSession(req).catch(() => null);

  let accountId: string | null = null;
  if (found?.session.account_id) {
    // Logged in: only their own account. Anything else requested is rejected.
    if (requested && requested !== 'me' && requested !== found.session.account_id) {
      return json(403, { error: 'not your account' });
    }
    accountId = found.session.account_id;
  } else {
    if (!requested || requested === 'me') {
      accountId = process.env.BIZ_ID || null;
      if (!accountId) return json(400, { error: 'accountId required' });
    } else {
      accountId = requested;
    }
  }

  // Elements need scoped reads (balance chart, holdings, payout + identity
  // surfaces). Degrade gracefully: full set → balance-only → legacy unscoped.
  const scopeTiers: string[][] = [
    ['company:balance:read', 'stats:read', 'payout:account:read', 'identity:write'],
    ['company:balance:read', 'stats:read'],
    [],
  ];
  let lastDetail = '';
  for (const scoped_actions of scopeTiers) {
    try {
      const r = await fetch(`${WHOP_API}/access_tokens`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ company_id: accountId, ...(scoped_actions.length ? { scoped_actions } : {}) }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && (j as { token?: string })?.token) {
        return json(200, { token: (j as { token: string }).token, accountId, mine: Boolean(found?.session.account_id) });
      }
      lastDetail = JSON.stringify(j).slice(0, 200);
      // Only retry on scope errors; other failures are final.
      if (!/scoped|authorized.*action/i.test(lastDetail)) break;
    } catch (e) {
      lastDetail = String(e).slice(0, 200);
      break;
    }
  }
  return json(502, { error: 'mint failed', detail: lastDetail });
};
