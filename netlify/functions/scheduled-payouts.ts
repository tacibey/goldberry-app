// GET /.netlify/functions/scheduled-payouts?stats=1 → { pending, paid, count }
// POST /.netlify/functions/scheduled-payouts → release due PENDING referrals
//   via Whop Transfers API. Trigger with cron-job.org every 24h (or manually).
// Safety: 48h hold (release_at), per-run cap 25 transfers, idempotent via status.
import { getStore } from '@netlify/blobs';
import { json } from './_shared.ts';

type Pending = {
  amountUSD: number; tier1: string | null; tier2: string | null;
  tier1USD: number; tier2USD: number; status: string;
  release_at: number; created_at: string; paid_at?: string; transferIds?: string[];
};

export default async (req: Request) => {
  const url = new URL(req.url);
  const store = getStore('goldberry');

  if (req.method === 'GET' && url.searchParams.get('stats') === '1') {
    try {
      const list = await store.list({ prefix: 'pending/' }).catch(() => ({ blobs: [] as Array<{ key: string }> }));
      let pending = 0, paid = 0, count = 0;
      for (const b of (list as { blobs: Array<{ key: string }> }).blobs.slice(0, 200)) {
        const p = (await store.get(b.key, { type: 'json' }).catch(() => null)) as Pending | null;
        if (!p) continue;
        count++;
        if (p.status === 'PENDING') pending += (p.tier1USD || 0) + (p.tier2USD || 0);
        if (p.status === 'PAID') paid += (p.tier1USD || 0) + (p.tier2USD || 0);
      }
      return json(200, { pending, paid, count });
    } catch {
      return json(200, { pending: 0, paid: 0, count: 0 });
    }
  }

  if (req.method !== 'POST') return json(405, { error: 'POST to release, GET ?stats=1 to read' });

  const apiKey = process.env.WHOP_API_KEY;
  const originId = process.env.BIZ_ID;
  if (!apiKey || !originId) return json(503, { error: 'WHOP_API_KEY / BIZ_ID not configured', released: [] });

  const list = (await store.list({ prefix: 'pending/' }).catch(() => ({ blobs: [] }))) as { blobs: Array<{ key: string }> };
  const now = Date.now();
  const released: Array<{ key: string; to: string; usd: number; transfer: string }> = [];

  async function createTransfer(to: string, usd: number, source: string): Promise<string> {
    const r = await fetch('https://api.whop.com/api/v1/transfers', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: usd, currency: 'usd', origin_id: originId,
        destination_id: to, metadata: { reason: 'goldberry_referral', source },
      }),
    });
    const j = await r.json().catch(() => null) as { id?: string; error?: unknown } | null;
    if (!r.ok || !j?.id) throw new Error(`transfer failed: ${JSON.stringify(j).slice(0, 200)}`);
    return j.id;
  }

  let budget = 25;
  for (const b of list.blobs) {
    if (budget <= 0) break;
    const p = (await store.get(b.key, { type: 'json' }).catch(() => null)) as Pending | null;
    if (!p || p.status !== 'PENDING' || p.release_at > now) continue;
    const legs: Array<{ to: string; usd: number }> = [];
    if (p.tier1 && p.tier1USD > 0.5) legs.push({ to: p.tier1, usd: Math.round(p.tier1USD * 100) / 100 });
    if (p.tier2 && p.tier2USD > 0.5) legs.push({ to: p.tier2, usd: Math.round(p.tier2USD * 100) / 100 });
    if (legs.length === 0) {
      await store.setJSON(b.key, { ...p, status: 'SKIPPED', paid_at: new Date().toISOString() }).catch(() => {});
      continue;
    }
    const ids: string[] = [];
    try {
      for (const leg of legs) {
        const id = await createTransfer(leg.to, leg.usd, b.key);
        ids.push(id);
        released.push({ key: b.key, to: leg.to, usd: leg.usd, transfer: id });
        budget--;
      }
      await store.setJSON(b.key, { ...p, status: 'PAID', paid_at: new Date().toISOString(), transferIds: ids }).catch(() => {});
    } catch (e) {
      await store.setJSON(b.key, { ...p, status: 'FAILED', transferIds: ids }).catch(() => {});
      return json(502, { error: 'transfer failed', detail: String(e).slice(0, 300), released });
    }
  }
  return json(200, { ok: true, released });
};
