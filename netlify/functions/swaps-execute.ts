// POST /.netlify/functions/swaps-execute {amountUSDT} (session cookie required)
// Executes a REAL USDT → XAUT swap on the user's own connected account:
// quote → create → return swap id. The frontend polls swaps-status until terminal.
import { GRAMS_PER_OZ, blobSet, json, whopFetch } from './_shared.ts';
import { loadSession } from './oauth-session.ts';

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) return json(503, { error: 'WHOP_API_KEY not configured' });

  const found = await loadSession(req);
  if (!found) return json(401, { error: 'login required' });
  const accountId = found.session.account_id;
  if (!accountId) return json(409, { error: 'account not provisioned — call ensure-account first' });

  const body = await req.json().catch(() => ({}));
  const amountUSDT = Number(body.amountUSDT);
  if (!(amountUSDT >= 5)) {
    return json(400, { error: 'minimum stack is 5 USDT (chain + swap fees eat micro amounts)' });
  }

  // 1) Fresh quote (honest numbers, protects against stale prices).
  const quote = await whopFetch('/swaps/quote', apiKey, {
    method: 'POST',
    body: JSON.stringify({ from_token: 'USDT', to_token: 'XAUT', amount: String(amountUSDT) }),
  });
  const q = quote.data as {
    amount_out?: string; rate?: string; fee_bps?: number; fee_amount?: string;
    bridge_fee?: number; requires_token_approval?: boolean;
  } | null;
  if (!quote.ok || !q?.amount_out) {
    return json(502, { error: 'quote failed (insufficient USDT balance?)', detail: JSON.stringify(quote.data).slice(0, 250) });
  }
  if (q.requires_token_approval) {
    return json(409, {
      error: 'token_approval_required',
      hint: 'Approve USDT spending for the swap router once in your wallet, then retry.',
      quote: q,
    });
  }

  // 2) Execute on the user's account.
  const swap = await whopFetch('/swaps', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      account_id: accountId,
      from_token: 'USDT',
      to_token: 'XAUT',
      amount: String(amountUSDT),
    }),
  });
  const s = swap.data as { id?: string; status?: string } | null;
  if (!swap.ok || !s?.id) {
    return json(502, { error: 'swap failed', detail: JSON.stringify(swap.data).slice(0, 250) });
  }

  // 3) Track for the UI + referral intent (volume-based, 48h hold downstream).
  await blobSet(`swaps/${s.id}.json`, {
    swap_id: s.id, account_id: accountId, amountUSDT,
    expectedXaut: parseFloat(q.amount_out),
    expectedGrams: parseFloat(q.amount_out) * GRAMS_PER_OZ,
    status: s.status ?? 'queued',
    created_at: new Date().toISOString(),
  });
  const ref = body.ref as { tier1?: string | null; tier2?: string | null } | undefined;
  if (ref?.tier1 || ref?.tier2) {
    await blobSet(`pending/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`, {
      amountUSD: amountUSDT, swap_id: s.id,
      tier1: ref?.tier1 ?? null, tier2: ref?.tier2 ?? null,
      tier1USD: amountUSDT * 0.008, tier2USD: amountUSDT * 0.002,
      status: 'PENDING', release_at: Date.now() + 48 * 3600 * 1000,
      created_at: new Date().toISOString(),
    });
  }

  return json(200, {
    ok: true, swapId: s.id, status: s.status ?? 'queued',
    expectedGrams: parseFloat(q.amount_out) * GRAMS_PER_OZ,
    feeBps: q.fee_bps, bridgeFee: q.bridge_fee,
  });
};
