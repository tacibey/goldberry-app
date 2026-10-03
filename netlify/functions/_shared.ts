// Shared helpers for Netlify Functions (Node 20+).
import crypto from 'node:crypto';

export const GRAMS_PER_OZ = 31.1034768;

// Overridable for local mock testing: WHOP_API_BASE=http://localhost:8787/api/v1
export const WHOP_API = (process.env.WHOP_API_BASE || 'https://api.whop.com/api/v1').replace(/\/$/, '');
export const WHOP_OAUTH = (process.env.WHOP_OAUTH_BASE || 'https://api.whop.com/oauth').replace(/\/$/, '');

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

// ---- session cookies (server-side sessions in Blobs; cookie holds only the id) ----
export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.get('cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function sessionSetCookie(sessionId: string): string {
  return `gb_session=${encodeURIComponent(sessionId)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}`;
}

export function sessionClearCookie(): string {
  return `gb_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export type Session = {
  user_id: string;
  email?: string | null;
  username?: string | null;
  access_token: string;
  refresh_token: string;
  obtained_at: number;
  expires_in: number;
  account_id?: string | null; // user's connected biz_ account (once provisioned)
};

// Ledger store (referral pendings, swap tracking, webhook dedupe).
// Production: Netlify Blobs. Local mock runs: process memory.
const MEM_STORE = /localhost|127\.0\.0\.1/.test(process.env.WHOP_API_BASE || '');
const memStore = new Map<string, unknown>();

async function blobStore() {
  if (MEM_STORE) return null;
  const { getStore } = await import('@netlify/blobs');
  return getStore('goldberry');
}

export async function blobGet<T>(key: string): Promise<T | null> {
  if (MEM_STORE) return (memStore.get(key) as T) ?? null;
  try {
    const s = await blobStore();
    return (await s!.get(key, { type: 'json' })) as T | null;
  } catch {
    return null;
  }
}

export async function blobSet(key: string, value: unknown): Promise<void> {
  if (MEM_STORE) {
    memStore.set(key, value);
    return;
  }
  try {
    const s = await blobStore();
    await s!.setJSON(key, value);
  } catch { /* non-fatal */ }
}

export async function blobList(prefix: string): Promise<string[]> {
  if (MEM_STORE) return [...memStore.keys()].filter((k) => k.startsWith(prefix));
  try {
    const s = await blobStore();
    const list = (await s!.list({ prefix })) as { blobs: Array<{ key: string }> };
    return list.blobs.map((b) => b.key);
  } catch {
    return [];
  }
}

export async function whopFetch(path: string, apiKey: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: unknown }> {
  const r = await fetch(`${WHOP_API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...((init?.headers as Record<string, string>) ?? {}) },
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}
