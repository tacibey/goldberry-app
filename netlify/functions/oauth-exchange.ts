// POST /.netlify/functions/oauth-exchange {code, code_verifier, redirect_uri}
// Server-side code exchange (keeps client_secret off the client), creates a
// server-side session in Blobs, returns user + Set-Cookie.
import { json, sessionSetCookie, WHOP_OAUTH, type Session } from './_shared.ts';
import { sessionSet } from './oauth-session.ts';

function rid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const clientId = process.env.WHOP_OAUTH_CLIENT_ID || '';
  const clientSecret = process.env.WHOP_OAUTH_CLIENT_SECRET || '';
  if (!clientId) {
    return json(503, {
      error: 'oauth_not_configured',
      hint: 'Create an OAuth app in Whop Developer Dashboard (redirect: https://goldberry-app.netlify.app/oauth/callback), then set WHOP_OAUTH_CLIENT_ID + WHOP_OAUTH_CLIENT_SECRET in Netlify env.',
    });
  }
  const body = await req.json().catch(() => ({}));
  const { code, code_verifier, redirect_uri } = body as Record<string, string>;
  if (!code || !code_verifier || !redirect_uri) return json(400, { error: 'code, code_verifier, redirect_uri required' });

  // 1) code → tokens
  const tokenRes = await fetch(`${WHOP_OAUTH}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri,
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      code_verifier,
    }),
  });
  const tokens = (await tokenRes.json().catch(() => null)) as {
    access_token?: string; refresh_token?: string; expires_in?: number; error?: string;
  } | null;
  if (!tokenRes.ok || !tokens?.access_token) {
    return json(502, { error: 'token exchange failed', detail: JSON.stringify(tokens).slice(0, 200) });
  }

  // 2) userinfo
  const meRes = await fetch(`${WHOP_OAUTH}/userinfo`, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const me = (await meRes.json().catch(() => null)) as {
    sub?: string; id?: string; email?: string; username?: string; name?: string;
  } | null;
  const userId: string = me?.sub || me?.id || '';
  if (!meRes.ok || !userId) return json(502, { error: 'userinfo failed' });

  // 3) server-side session
  const sessionId = rid('sess');
  const session: Session = {
    user_id: userId,
    email: me?.email ?? null,
    username: me?.username ?? me?.name ?? null,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || '',
    obtained_at: Date.now(),
    expires_in: tokens.expires_in || 3600,
    account_id: null,
  };
  try {
    await sessionSet(sessionId, session);
  } catch (e) {
    return json(503, { error: 'session store unavailable', detail: String(e).slice(0, 150) });
  }

  return json(
    200,
    { ok: true, user: { id: userId, email: session.email, username: session.username } },
    { 'set-cookie': sessionSetCookie(sessionId) },
  );
};
