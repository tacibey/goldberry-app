// GET /.netlify/functions/oauth-session → {loggedIn, user?, accountId?}
// Validates the session cookie; refreshes the access token when expiring.
import { getStore } from '@netlify/blobs';
import { getCookie, json, WHOP_OAUTH, type Session } from './_shared.ts';

// Test hook: when pointed at a localhost mock backend, Blobs isn't available,
// so sessions fall back to process memory (never in production).
const MEM_FALLBACK = /localhost|127\.0\.0\.1/.test(process.env.WHOP_API_BASE || '');
const mem = new Map<string, Session>();

export async function sessionGet(id: string): Promise<Session | null> {
  if (MEM_FALLBACK) return mem.get(id) ?? null;
  try {
    return (await getStore('goldberry-sessions').get(id, { type: 'json' })) as Session | null;
  } catch {
    return null;
  }
}
export async function sessionSet(id: string, s: Session): Promise<void> {
  if (MEM_FALLBACK) {
    mem.set(id, s);
    return;
  }
  await getStore('goldberry-sessions').setJSON(id, s);
}
export async function sessionDel(id: string): Promise<void> {
  if (MEM_FALLBACK) {
    mem.delete(id);
    return;
  }
  try {
    await getStore('goldberry-sessions').delete(id);
  } catch { /* ignore */ }
}


export async function loadSession(req: Request): Promise<{ id: string; session: Session } | null> {
  const sid = getCookie(req, 'gb_session');
  if (!sid) return null;
  const s = await sessionGet(sid);
  if (!s) return null;
  return { id: sid, session: s };
}

export default async (req: Request) => {
  const found = await loadSession(req);
  if (!found) return json(200, { loggedIn: false });

  const { id, session } = found;
  const clientId = process.env.WHOP_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.WHOP_OAUTH_CLIENT_SECRET || '';
  const expiresAt = session.obtained_at + session.expires_in * 1000;

  // Refresh within a 5-minute buffer.
  if (session.refresh_token && Date.now() > expiresAt - 5 * 60 * 1000) {
    try {
      const r = await fetch(`${WHOP_OAUTH}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: session.refresh_token,
          client_id: clientId,
          ...(clientSecret ? { client_secret: clientSecret } : {}),
        }),
      });
      const t = (await r.json().catch(() => null)) as {
        access_token?: string; refresh_token?: string; expires_in?: number;
      } | null;
      if (r.ok && t?.access_token) {
        session.access_token = t.access_token;
        if (t.refresh_token) session.refresh_token = t.refresh_token; // rotation
        session.obtained_at = Date.now();
        session.expires_in = t.expires_in || 3600;
        await sessionSet(id, session).catch(() => {});
      }
    } catch { /* serve with the old token; next call retries */ }
  }

  return json(200, {
    loggedIn: true,
    user: { id: session.user_id, email: session.email, username: session.username },
    accountId: session.account_id ?? null,
  });
};
