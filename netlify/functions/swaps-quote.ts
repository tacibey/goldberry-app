// POST /.netlify/functions/swaps-quote { amountUSD, accountId?, ref? }
// Tries a REAL Whop swap when configured; otherwise returns a transparent
// gold-price quote so the UI keeps working in mock mode.
import { getStore } from '@netlify/blobs';
import { GRAMS_PER_OZ, json } from './_shared.ts';

async function livePrice(): Promise<{ pricePerOzUSD: number; source: string }> {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd');
    const j = await r.json();
    if (typeof j?.['tether-gold']?.usd === 'number') return { pricePerOzUSD: j['tether-gold'].usd, source: 'xaut-live' };
  } catch { /* ignore */ }
  return { pricePerOzUSD: parseFloat(process.env.GOLD_FALLBACK_OZ_USD || '2650') || 2650, source: 'static' };
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const body = await req.json().catch(() => ({}));
  const amountUSD = Number(body.amountUSD);
  if (!(amountUSD > 0)) return json(400, { error: 'amountUSD > 0 required' });

  const feeUSD = amountUSD * 0.02;
  const netUSD = amountUSD - feeUSD;
  const { pricePerOzUSD, source } = await livePrice();
  const oz = netUSD / pricePerOzUSD;
  const grams = oz * GRAMS_PER_OZ;

  const apiKey = process.env.WHOP_API_KEY;
  const accountId: string | undefined = body.accountId && body.accountId !== 'me' ? body.accountId : process.env.BIZ_ID;

  // Record referral intent (PENDING, 48h hold) even in mock mode.
  try {
    const ref = body.ref as { tier1?: string | null; tier2?: string | null } | undefined;
    if ((ref?.tier1 || ref?.tier2) && amountUSD > 0) {
      const store = getStore('goldberry');
      const key = `pending/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
      await store.setJSON(key, {
        amountUSD,
        tier1: ref?.tier1 ?? null,
        tier2: ref?.tier2 ?? null,
        tier1USD: amountUSD * 0.008,
        tier2USD: amountUSD * 0.002,
        status: 'PENDING',
        release_at: Date.now() + 48 * 3600 * 1000,
        created_at: new Date().toISOString(),
      });
    }
  } catch { /* blobs unavailable locally — non-fatal */ }

  // Real swap attempt (only when Whop is configured).
  if (apiKey && accountId) {
    try {
      const { WhopClient } = await import('@whop/sdk');
      const whop = new WhopClient({ token: apiKey } as never);
      const client = whop as unknown as {
        swaps: {
          createQuote?: (a: unknown) => Promise<unknown>;
          create?: (a: unknown) => Promise<{ id?: string }>;
        };
      };
      // Quote-first if the SDK supports it; never throws the request on failure.
      if (client.swaps?.createQuote) {
        await client.swaps.createQuote({ account_id: accountId, from_token: 'USD', to_token: 'XAUT', amount: netUSD }).catch(() => null);
      }
      if (client.swaps?.create) {
        const swap = await client.swaps.create({ account_id: accountId, from_token: 'USD', to_token: 'XAUT', amount: netUSD }).catch(() => null) as { id?: string } | null;
        if (swap?.id) {
          return json(200, { mode: 'whop-swap', swapId: swap.id, grams, oz, feeUSD, netUSD, pricePerOzUSD, source });
        }
      }
    } catch (e) {
      // fall through to quote mode — UI still credits grams, backend logs intent
    }
  }

  return json(200, { mode: apiKey ? 'quote' : 'mock', grams, oz, feeUSD, netUSD, pricePerOzUSD, source });
};
