// POST /.netlify/functions/webhooks-whop — Whop webhook receiver.
// Verifies Standard Webhooks signature, responds 2xx fast, dedupes by webhook-id.
import { getStore } from '@netlify/blobs';
import { headerMap, json, verifyWhopWebhook } from './_shared.ts';

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const rawBody = await req.text();
  const headers = headerMap(req.headers as unknown as Headers);
  const secret = process.env.WHOP_WEBHOOK_SECRET || '';

  if (secret && !verifyWhopWebhook(rawBody, headers, secret)) {
    return json(401, { error: 'bad signature' });
  }

  const eventId = headers['webhook-id'] ?? `evt_${Date.now()}`;
  try {
    const store = getStore('goldberry');
    const seen = await store.get(`seen/${eventId}`, { type: 'text' }).catch(() => null);
    if (seen) return json(200, { ok: true, deduped: true });
    await store.set(`seen/${eventId}`, '1').catch(() => {});
    const evt = JSON.parse(rawBody);
    await store.setJSON(`events/${eventId}.json`, { received_at: new Date().toISOString(), event: evt }).catch(() => {});
    // payment.succeeded → create referral PENDING entries if metadata carries ref
    const type = evt?.type as string | undefined;
    if (type === 'payment.succeeded') {
      const meta = evt?.data?.metadata ?? {};
      const amountUSD = Number(evt?.data?.amount ?? evt?.data?.total ?? 0);
      if ((meta?.tier1 || meta?.tier2) && amountUSD > 0) {
        await store.setJSON(`pending/${eventId}.json`, {
          amountUSD,
          tier1: meta.tier1 ?? null,
          tier2: meta.tier2 ?? null,
          tier1USD: amountUSD * 0.008,
          tier2USD: amountUSD * 0.002,
          status: 'PENDING',
          release_at: Date.now() + 48 * 3600 * 1000,
          created_at: new Date().toISOString(),
          source_event: eventId,
        }).catch(() => {});
      }
    }
  } catch { /* never fail webhooks on storage errors */ }

  return json(200, { ok: true });
};
