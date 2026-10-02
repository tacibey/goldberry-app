// GET /.netlify/functions/gold-price — cached live XAUT fallback chain.
import { json } from './_shared.ts';

let cache: { at: number; payload: unknown } | null = null;

export default async () => {
  if (cache && Date.now() - cache.at < 60_000) return json(200, cache.payload);
  const tries: Array<() => Promise<number | null>> = [
    async () => {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd');
      const j = await r.json().catch(() => null);
      const p = j?.['tether-gold']?.usd;
      return typeof p === 'number' ? p : null;
    },
    async () => {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd');
      const j = await r.json().catch(() => null);
      const p = j?.['pax-gold']?.usd;
      return typeof p === 'number' ? p : null;
    },
  ];
  for (let i = 0; i < tries.length; i++) {
    try {
      const p = await tries[i]();
      if (p && p > 500) {
        const payload = { pricePerOzUSD: p, pricePerGramUSD: p / 31.1034768, source: i === 0 ? 'xaut-live' : 'paxg-fallback' };
        cache = { at: Date.now(), payload };
        return json(200, payload);
      }
    } catch { /* next */ }
  }
  const fallback = parseFloat(process.env.GOLD_FALLBACK_OZ_USD || '2650') || 2650;
  const payload = { pricePerOzUSD: fallback, pricePerGramUSD: fallback / 31.1034768, source: 'static' };
  cache = { at: Date.now(), payload };
  return json(200, payload);
};
