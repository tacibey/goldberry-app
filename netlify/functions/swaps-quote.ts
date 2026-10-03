// POST /.netlify/functions/swaps-quote { amountUSD, accountId?, ref? }
//
// Honest quoting engine:
//  - When WHOP_API_KEY is set: real Whop swap quote USDT → XAUT (Plasma).
//    We treat 1 USD ≈ 1 USDT for preview (deposit converts 1:1 minus rails).
//    Whop's own fee (~1%, fee_bps=100) + bridge fee come straight from the quote.
//  - Otherwise: CoinGecko XAUT math fallback (mock mode for local dev).
// Goldberry's 2% monetization lives on WITHDRAWAL (fee markup, already live),
// not on the swap — so we do NOT deduct it here. Referral PENDING intent is
// still recorded on volume (paid later from platform balance via Transfers).
import { GRAMS_PER_OZ, blobSet, json, WHOP_API } from './_shared.ts';

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const body = await req.json().catch(() => ({}));
  const amountUSD = Number(body.amountUSD);
  if (!(amountUSD > 0)) return json(400, { error: 'amountUSD > 0 required' });

  // Record referral intent (PENDING, 48h hold) regardless of mode.
  const ref = body.ref as { tier1?: string | null; tier2?: string | null } | undefined;
  if ((ref?.tier1 || ref?.tier2) && amountUSD > 0) {
    await blobSet(`pending/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`, {
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

  const apiKey = process.env.WHOP_API_KEY;
  if (apiKey) {
    try {
      // Real Whop quote: USDT → XAUT on Plasma. 1 USD ≈ 1 USDT for preview.
      const r = await fetch(`${WHOP_API}/swaps/quote`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from_token: 'USDT', to_token: 'XAUT', amount: String(amountUSD) }),
      });
      const q = await r.json().catch(() => null) as {
        amount_out: string; rate: string; fee_bps: number; fee_amount: string; bridge_fee: number;
      } | null;
      if (r.ok && q && typeof q.amount_out === 'string') {
        const xaut = parseFloat(q.amount_out); // XAUT ≈ 1 troy oz
        const grams = xaut * GRAMS_PER_OZ;
        return json(200, {
          mode: 'whop-quote',
          grams, oz: xaut,
          feeUSD: parseFloat(q.fee_amount) || 0,
          feeBps: q.fee_bps,
          bridgeFee: q.bridge_fee,
          rate: q.rate,
          source: 'xaut-live',
          note: 'Real Whop quote: USDT→XAUT on Plasma. Deposit USD→USDT first via DepositElement.',
        });
      }
    } catch {
      // fall through to math fallback — UI keeps working
    }
  }

  // Fallback math (no key / quote failed): CoinGecko → static.
  let pricePerOzUSD = parseFloat(process.env.GOLD_FALLBACK_OZ_USD || '2650') || 2650;
  let source = 'static';
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd');
    const j = await r.json();
    if (typeof j?.['tether-gold']?.usd === 'number') {
      pricePerOzUSD = j['tether-gold'].usd;
      source = 'xaut-live';
    }
  } catch { /* keep fallback */ }
  const oz = amountUSD / pricePerOzUSD;
  const grams = oz * GRAMS_PER_OZ;
  return json(200, { mode: apiKey ? 'quote' : 'mock', grams, oz, feeUSD: 0, pricePerOzUSD, source });
};
