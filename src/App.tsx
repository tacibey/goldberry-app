import { useState } from 'react';
import { Header, PortfolioHero, ReferralCenter, SwapBox, VaultList, WalletPanel, CreateVaultModal, useGoldberry } from './components/goldberry';
import { AuthButton, OnboardingGate, useSession } from './components/auth';
import { captureRefFromURL } from './lib/referral';
import './styles.css';

async function pollSwap(swapId: string): Promise<{ status: string; grams: number | null }> {
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const r = await fetch(`/.netlify/functions/swaps-status?id=${encodeURIComponent(swapId)}`);
      const j = await r.json();
      if (j?.terminal) return { status: j.status, grams: j.grams ?? null };
    } catch { /* keep polling */ }
  }
  return { status: 'timeout', grams: null };
}

export default function App() {
  const g = useGoldberry();
  const { session, refresh, login, logout, authError } = useSession();
  const [showNew, setShowNew] = useState(false);
  const [showWallet, setShowWallet] = useState(false);

  const loggedIn = session.status === 'in';
  const accountId = loggedIn ? session.accountId : null;
  const live = Boolean(loggedIn && accountId);

  const scrollToSwap = () => {
    document.getElementById('swap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const realStack = async () => {
    const n = parseFloat(g.usd) || 0;
    if (!(n >= 5) || !g.activeId) {
      g.notify(n > 0 ? 'Minimum real stack is $5.' : 'Enter an amount first.');
      return;
    }
    g.setBusy(true);
    try {
      const r = await fetch('/.netlify/functions/swaps-execute', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amountUSDT: n, ref: captureRefFromURL() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        g.notify(`Swap refused: ${(j as { error?: string }).error || 'unknown'}`);
        return;
      }
      g.notify(`Swap sent (${(j as { expectedGrams?: number }).expectedGrams?.toFixed(4)}g expected) — settling…`);
      const done = await pollSwap((j as { swapId: string }).swapId);
      if (done.status === 'complete' && done.grams) {
        g.creditGrams(done.grams);
        g.notify(`Stacked ${done.grams.toFixed(4)}g real gold 🫐`);
      } else {
        g.notify(`Swap ${done.status}. Check again in a minute.`);
      }
    } catch {
      g.notify('Network error.');
    } finally {
      g.setBusy(false);
    }
  };

  return (
    <>
      <div className="topbar" style={{ paddingBottom: 6 }}>
        <div style={{ flex: 1 }} />
        <AuthButton session={session} onLogin={login} onLogout={logout} />
      </div>
      {authError && <div className="card" style={{ borderColor: '#f87171', marginBottom: 12, fontSize: 14 }}>{authError}</div>}
      <Header totalGrams={g.totalGrams} usdPerGram={g.quote?.pricePerGramUSD ?? 0} priceSource={g.quote?.source ?? '…'} />
      {!live && loggedIn && (
        <OnboardingGate accountId={accountId} onDone={refresh} />
      )}
      <div style={{ margin: '0 4px 4px' }}>
        <span className="pill" style={live ? { background: '#4ade80', color: '#052e16', borderColor: '#4ade80', fontWeight: 700 } : undefined}>
          {session.status === 'loading' ? '…' : live ? '● LIVE MONEY MODE' : loggedIn ? '● SIGNED IN — ACTIVATE ACCOUNT ↑' : '○ DEMO MODE — SIGN IN FOR REAL GOLD'}
        </span>
      </div>
      <PortfolioHero totalGrams={g.totalGrams} quote={g.quote} onStack={scrollToSwap} onAddFunds={() => setShowWallet((s) => !s)} />

      {showWallet && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 className="sec" style={{ marginTop: 0 }}>Whop money rails</h2>
          <WalletPanel accountReady={live} accountId={accountId} />
        </div>
      )}

      <div className="grid2">
        <div>
          <h2 className="sec">Your vaults 🎯 <button className="btn ghost" style={{ padding: '6px 12px', fontSize: 12, marginLeft: 8 }} onClick={() => setShowNew(true)}>+ New vault</button></h2>
          <VaultList vaults={g.vaults} activeId={g.activeId} onSelect={g.select} />
          <h2 className="sec">Referrals pay rent 🔗</h2>
          <ReferralCenter />
        </div>
        <div id="swap">
          <h2 className="sec">Stack</h2>
          <SwapBox quote={g.quote} usd={g.usd} setUsd={g.setUsd} onConfirm={live ? realStack : g.stack} busy={g.busy} live={live} />
          <div style={{ height: 12 }} />
          <div className="card">
            <h2 className="sec" style={{ marginTop: 0 }}>Cash out</h2>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: '#a8a29e' }}>
              Vaults are gold-indexed. Cash out anytime via Whop withdraw rails — live fees + arrival estimates, straight to your bank or wallet.
            </div>
            <div className="cta-row"><button className="btn ghost" onClick={() => setShowWallet(true)}>Open withdraw</button></div>
          </div>
        </div>
      </div>

      <div className="footer">
        Goldberry on Whop rails. Not financial advice. Gold price via CoinGecko XAUT live → server fallback.<br />
        Non-custodial: Goldberry never touches funds. Fee 2.0% on cash-out · referrals 0.8% / 0.2% after 48h hold.
      </div>

      {showNew && <CreateVaultModal onClose={() => setShowNew(false)} onCreate={(n, t) => { g.create(n, t); setShowNew(false); }} />}
      {g.toast && <div className="toast">{g.toast}</div>}
    </>
  );
}
