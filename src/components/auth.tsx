import { useCallback, useEffect, useState } from 'react';
import { fetchSession, handleCallbackIfPresent, logout, startLogin, type SessionState } from '../lib/auth';

export function useSession(): { session: SessionState; refresh: () => void; login: () => void; logout: () => void; authError: string | null } {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [authError, setAuthError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchSession().then(setSession);
  }, []);

  useEffect(() => {
    (async () => {
      if (window.location.pathname === '/oauth/callback') {
        const res = await handleCallbackIfPresent();
        if (res.error) setAuthError(res.error);
      }
      refresh();
    })();
  }, [refresh]);

  return {
    session,
    refresh,
    login: () => { void startLogin(); },
    logout: () => { void logout(); },
    authError,
  };
}

export function AuthButton({ session, onLogin, onLogout }: { session: SessionState; onLogin: () => void; onLogout: () => void }) {
  if (session.status === 'loading') return <span className="pill">…</span>;
  if (session.status === 'in') {
    return (
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span className="pill live">● {session.user.username || session.user.email || 'goldbug'}</span>
        <button className="btn ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={onLogout}>Out</button>
      </span>
    );
  }
  return <button className="btn gold" style={{ padding: '8px 16px', fontSize: 13 }} onClick={onLogin}>Sign in with Whop</button>;
}

export function OnboardingGate({ accountId, onDone }: { accountId: string | null; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [kyc, setKyc] = useState<{ needed: boolean; url: string | null; status: string | null; linkError: string | null }>({ needed: false, url: null, status: null, linkError: null });
  const [error, setError] = useState<string | null>(null);

  const ensure = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/.netlify/functions/ensure-account', { method: 'POST' });
      const j = (await r.json()) as { needsKyc?: boolean; onboardingUrl?: string; verification?: string; linkError?: string; error?: string };
      if (!r.ok) {
        setError(j.error || 'Account setup failed.');
        return;
      }
      if (j.needsKyc) {
        setKyc({ needed: true, url: j.onboardingUrl ?? null, status: j.verification ?? null, linkError: j.linkError ?? null });
      } else {
        onDone();
      }
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  if (accountId && !kyc.needed) return null;

  return (
    <div className="card" style={{ marginBottom: 16, borderColor: '#f5c518' }}>
      <h2 className="sec" style={{ marginTop: 0 }}>🔑 Activate real-money mode</h2>
      {!kyc.needed ? (
        <>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            You're signed in. One tap opens your personal gold account on Whop rails — then Stack moves <b>real USDT → real XAUT</b>.
          </div>
          <div className="cta-row">
            <button className="btn gold" disabled={busy} onClick={ensure}>{busy ? 'Opening…' : 'Open my gold account'}</button>
          </div>
          {error && <div className="fine" style={{ color: '#f87171' }}>{error}</div>}
        </>
      ) : (
        <>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            Account opened. Whop needs a quick identity check <b>for this gold account</b> before money moves
            (separate from your personal Whop verification) — takes ~5 minutes, one time.
            {kyc.status && <><br /><span style={{ color: '#a8a29e' }}>Status: {kyc.status}</span></>}
          </div>
          <div className="cta-row">
            {kyc.url ? (
              <a className="btn gold" style={{ textDecoration: 'none' }} href={kyc.url} target="_blank" rel="noreferrer">Verify identity</a>
            ) : (
              <div className="fine" style={{ color: '#f87171' }}>Verification link failed to load{kyc.linkError ? `: ${kyc.linkError}` : '. Try again.'}</div>
            )}
            <button className="btn ghost" onClick={ensure}>I've verified — check again</button>
          </div>
        </>
      )}
    </div>
  );
}
