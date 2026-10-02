import { useState } from 'react';
import { Header, PortfolioHero, ReferralCenter, SwapBox, VaultList, WalletPanel, CreateVaultModal, useGoldberry } from './components/goldberry';
import './styles.css';

export default function App() {
  const g = useGoldberry();
  const [showNew, setShowNew] = useState(false);
  const [showWallet, setShowWallet] = useState(false);

  const scrollToSwap = () => {
    document.getElementById('swap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <>
      <Header totalGrams={g.totalGrams} usdPerGram={g.quote?.pricePerGramUSD ?? 0} priceSource={g.quote?.source ?? '…'} />
      <PortfolioHero totalGrams={g.totalGrams} quote={g.quote} onStack={scrollToSwap} onAddFunds={() => setShowWallet((s) => !s)} />

      {showWallet && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 className="sec" style={{ marginTop: 0 }}>Whop money rails</h2>
          <WalletPanel accountReady={false} />
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
          <SwapBox quote={g.quote} usd={g.usd} setUsd={g.setUsd} onConfirm={g.stack} busy={g.busy} />
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
        Goldberry is a demo PWA on Whop rails. Not financial advice. Gold price via CoinGecko XAUT live → server fallback.<br />
        Non-custodial: Goldberry never touches funds. Fee 2.0% disclosed upfront · referrals 0.8% / 0.2% after 48h hold.
      </div>

      {showNew && <CreateVaultModal onClose={() => setShowNew(false)} onCreate={(n, t) => { g.create(n, t); setShowNew(false); }} />}
      {g.toast && <div className="toast">{g.toast}</div>}
    </>
  );
}
