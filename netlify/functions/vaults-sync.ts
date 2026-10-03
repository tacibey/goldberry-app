// GET /.netlify/functions/vaults-sync (session cookie required)
// Ledger is the single source of truth: reads the user's real XAUT holdings
// from their connected account. The frontend pro-rates holdings across the
// user's goal vaults (targets stay local; current grams come from here).
import { GRAMS_PER_OZ, json, whopFetch } from './_shared.ts';
import { loadSession } from './oauth-session.ts';

export default async (req: Request) => {
  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) return json(503, { error: 'WHOP_API_KEY not configured' });
  const found = await loadSession(req);
  if (!found) return json(401, { error: 'login required' });
  const accountId = found.session.account_id;
  if (!accountId) return json(409, { error: 'account not provisioned — call ensure-account first' });

  const res = await whopFetch(`/accounts/${accountId}`, apiKey);
  if (!res.ok) return json(502, { error: 'balance read failed' });

  // Defensive parse: balance may nest under balance / wallet / treasury.
  const root = (res.data || {}) as Record<string, unknown>;
  const candidates = [root.balance, root.wallet, root.treasury, root] as Array<Record<string, unknown> | undefined>;
  let xaut = 0;
  let xautUsd = 0;
  for (const c of candidates) {
    if (!c) continue;
    const crypto = (c.crypto ?? c.tokens ?? []) as Array<{
      symbol?: string; balance?: string | number; value_usd?: number; valueUsd?: number;
    }>;
    if (Array.isArray(crypto)) {
      for (const t of crypto) {
        if (String(t.symbol || '').toUpperCase() === 'XAUT') {
          xaut = parseFloat(String(t.balance ?? 0)) || 0;
          xautUsd = Number(t.value_usd ?? t.valueUsd ?? 0) || 0;
          break;
        }
      }
    }
    if (xaut > 0) break;
  }

  const grams = xaut * GRAMS_PER_OZ; // XAUT ≈ 1 troy oz
  return json(200, {
    accountId,
    xaut,
    grams,
    oz: xaut,
    xautUsd,
    syncedAt: new Date().toISOString(),
  });
};
