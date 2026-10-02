// Gold math: 1 troy oz = 31.1034768 g. XAUT ≈ 1 oz fine gold.
export const GRAMS_PER_OZ = 31.1034768;
export const FEE_PCT = 0.02; // 2% disclosed Goldberry fee
export const TIER1_PCT = 0.008;
export const TIER2_PCT = 0.002;

export function calculateReferralSplit(totalAmountUSD: number) {
  return {
    totalMarkup: totalAmountUSD * FEE_PCT,
    tier1Payout: totalAmountUSD * TIER1_PCT,
    tier2Payout: totalAmountUSD * TIER2_PCT,
    netPlatformProfit: totalAmountUSD * (FEE_PCT - TIER1_PCT - TIER2_PCT),
  };
}

export const gramsToOz = (g: number) => g / GRAMS_PER_OZ;
export const ozToGrams = (oz: number) => oz * GRAMS_PER_OZ;

export type GoldQuote = {
  pricePerOzUSD: number;
  pricePerGramUSD: number;
  source: 'xaut-live' | 'paxg-fallback' | 'static';
  usd: number;
  feeUSD: number;
  netUSD: number;
  grams: number;
  oz: number;
};

export async function fetchGoldPrice(): Promise<{ pricePerOzUSD: number; source: GoldQuote['source'] }> {
  // 1) Try XAUT live via CoinGecko (no key needed)
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd');
    if (r.ok) {
      const j = await r.json();
      const p = j?.['tether-gold']?.usd;
      if (typeof p === 'number' && p > 500) return { pricePerOzUSD: p, source: 'xaut-live' };
    }
  } catch { /* fall through */ }
  // 2) PAXG fallback
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd');
    if (r.ok) {
      const j = await r.json();
      const p = j?.['pax-gold']?.usd;
      if (typeof p === 'number' && p > 500) return { pricePerOzUSD: p, source: 'paxg-fallback' };
    }
  } catch { /* fall through */ }
  // 3) Netlify function (server-side, cached) — best effort
  try {
    const r = await fetch('/.netlify/functions/gold-price');
    if (r.ok) {
      const j = await r.json();
      if (typeof j?.pricePerOzUSD === 'number') return { pricePerOzUSD: j.pricePerOzUSD, source: j.source ?? 'static' };
    }
  } catch { /* ignore */ }
  return { pricePerOzUSD: 2650, source: 'static' };
}

export function quoteBuy(usd: number, pricePerOzUSD: number, source: GoldQuote['source']): GoldQuote {
  const feeUSD = usd * FEE_PCT;
  const netUSD = Math.max(0, usd - feeUSD);
  const oz = netUSD / pricePerOzUSD;
  const grams = oz * GRAMS_PER_OZ;
  return { pricePerOzUSD, pricePerGramUSD: pricePerOzUSD / GRAMS_PER_OZ, source, usd, feeUSD, netUSD, grams, oz };
}
