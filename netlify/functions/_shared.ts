// Shared helpers for Netlify Functions (Node 20+).
import crypto from 'node:crypto';

export const GRAMS_PER_OZ = 31.1034768;

export function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}

// Standard Webhooks verification (what Whop actually sends):
// signed = `${webhook-id}.${webhook-timestamp}.${rawBody}`,
// HMAC-SHA256 with the RAW ws_ secret bytes, base64 output, header `v1,<b64>`.
// Reject if timestamp older than 5 min (replay protection).
export function verifyWhopWebhook(rawBody: string, headers: Record<string, string | null | undefined>, secret: string): boolean {
  const id = headers['webhook-id'];
  const ts = headers['webhook-timestamp'];
  const sig = headers['webhook-signature'];
  if (!id || !ts || !sig || !secret) return false;
  const now = Math.floor(Date.now() / 1000);
  const t = parseInt(Array.isArray(ts) ? ts[0] : (ts as string), 10);
  if (!Number.isFinite(t) || Math.abs(now - t) > 5 * 60) return false;
  const signed = `${id}.${t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('base64');
  const got = (Array.isArray(sig) ? sig[0] : (sig as string)).replace(/^v1,/, '').trim();
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function headerMap(h: Headers | Record<string, string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  if (h instanceof Headers) {
    h.forEach((v, k) => { out[k.toLowerCase()] = v; });
  } else {
    for (const [k, v] of Object.entries(h)) if (v) out[k.toLowerCase()] = String(v);
  }
  return out;
}
