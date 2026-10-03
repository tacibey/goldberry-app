// Whop OAuth 2.1 + PKCE ("Sign in with Whop") client.
// Tokens live server-side (Blobs sessions, httpOnly cookie) — the SPA only
// ever sees {loggedIn, user, accountId}.
export type SessionUser = { id: string; email?: string | null; username?: string | null };
export type SessionState =
  | { status: 'loading' }
  | { status: 'out' }
  | { status: 'in'; user: SessionUser; accountId: string | null };

type OAuthConfig = { configured: boolean; clientId: string; redirectUri: string; scope: string };
let configCache: OAuthConfig | null = null;

export async function getOAuthConfig(): Promise<OAuthConfig> {
  if (configCache) return configCache;
  const r = await fetch('/.netlify/functions/oauth-config');
  configCache = (await r.json()) as OAuthConfig;
  return configCache;
}

function rand(n: number): string {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/[^a-zA-Z0-9]/g, '').slice(0, n);
}

async function sha256b64url(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return btoa(String.fromCharCode(...new Uint8Array(d)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startLogin(): Promise<void> {
  const cfg = await getOAuthConfig();
  if (!cfg.configured) {
    alert('Sign-in is not wired yet (OAuth app missing). Demo mode continues — your vaults still work locally.');
    return;
  }
  const verifier = rand(64);
  const state = rand(16);
  const nonce = rand(16);
  sessionStorage.setItem('gb_pkce', JSON.stringify({ verifier, state }));
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    state,
    nonce,
    code_challenge: await sha256b64url(verifier),
    code_challenge_method: 'S256',
  });
  window.location.href = `https://api.whop.com/oauth/authorize?${params}`;
}

/** On /oauth/callback: validate state, exchange code server-side. Returns true if handled. */
export async function handleCallbackIfPresent(): Promise<{ ok: boolean; error?: string }> {
  if (window.location.pathname !== '/oauth/callback') return { ok: false };
  const q = new URLSearchParams(window.location.search);
  const code = q.get('code');
  const returnedState = q.get('state');
  const err = q.get('error');
  window.history.replaceState({}, '', '/');
  if (err) return { ok: true, error: `Login failed: ${err}` };
  if (!code) return { ok: true, error: 'No code returned.' };
  let stored: { verifier: string; state: string } | null = null;
  try {
    stored = JSON.parse(sessionStorage.getItem('gb_pkce') || 'null');
  } catch { /* ignore */ }
  sessionStorage.removeItem('gb_pkce');
  if (!stored || stored.state !== returnedState) return { ok: true, error: 'Invalid state — possible CSRF. Try again.' };

  const cfg = await getOAuthConfig();
  const r = await fetch('/.netlify/functions/oauth-exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: stored.verifier, redirect_uri: cfg.redirectUri }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: true, error: (j as { error?: string }).error || 'Exchange failed.' };
  return { ok: true };
}

export async function fetchSession(): Promise<SessionState> {
  try {
    const r = await fetch('/.netlify/functions/oauth-session');
    const j = await r.json();
    if (j?.loggedIn) return { status: 'in', user: j.user, accountId: j.accountId ?? null };
    return { status: 'out' };
  } catch {
    return { status: 'out' };
  }
}

export async function logout(): Promise<void> {
  await fetch('/.netlify/functions/oauth-logout', { method: 'POST' }).catch(() => {});
  window.location.reload();
}
