import { useEffect, useState } from 'react';
import { fetchGoldPrice, gramsToOz, quoteBuy, type GoldQuote } from '../lib/gold';
import { addGrams, createVault, getActiveId, loadVaults, setActiveId, type Vault } from '../lib/vaults';
import { captureRefFromURL, getMyId, myRefLink, type RefInfo } from '../lib/referral';

// ---------- Header / portfolio ----------
export function Header({ totalGrams, usdPerGram, priceSource }: { totalGrams: number; usdPerGram: number; priceSource: string }) {
  const totalUSD = totalGrams * usdPerGram;
  return (
    <div className="topbar">
      <div className="brand">
        <img src="/favicon.svg" alt="Goldberry" />
        <div>Goldberry<small>snack-size gold savings</small></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <span className="pill live">● LIVE {priceSource}</span>
        <span className="pill">${totalUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })} stacked</span>
      </div>
    </div>
  );
}

export function PortfolioHero({ totalGrams, quote, onStack, onAddFunds }: { totalGrams: number; quote: GoldQuote | null; onStack: () => void; onAddFunds: () => void }) {
  const usd = quote ? totalGrams * quote.pricePerGramUSD : 0;
  return (
    <div className="hero">
      <div className="card portfolio">
        <h1>All your <b>gold</b>, one berry. 🫐</h1>
        <div className="biggrams">{totalGrams.toFixed(3)} <span>grams</span></div>
        <div className="sub">
          <b>{gramsToOz(totalGrams).toFixed(4)} oz</b> · <b>${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b> ·{' '}
          {quote ? <>${quote.pricePerOzUSD.toLocaleString()} / oz via {quote.source}</> : 'fetching live price…'}
        </div>
        <div className="ticker">
          <span className="tick">XAUT <b>≈ 1 oz gold</b></span>
          <span className="tick">fee <b>2.0%</b> flat, shown upfront</span>
          <span className="tick">non-custodial <b>Whop rails</b></span>
        </div>
        <div className="cta-row">
          <button className="btn gold" onClick={onStack}>⚡ Stack gold</button>
          <button className="btn ghost" onClick={onAddFunds}>Add funds</button>
        </div>
        <div className="fine">Goldberry never holds your money. Deposits, swaps & payouts run on Whop's licensed ledger. We just make it fun.</div>
      </div>
      <div className="card">
        <h2 className="sec" style={{ marginTop: 0 }}>How it slaps 👇</h2>
        <div style={{ display: 'grid', gap: 10, fontSize: 14, lineHeight: 1.6 }}>
          <div>🎯 <b>Pick a vault</b> — iPhone, Bali, rent-proof life.</div>
          <div>💵 <b>Type $10, get grams</b> — live XAUT price, fee upfront.</div>
          <div>🫐 <b>Watch the bar fill</b> — grams, oz & USD in one glance.</div>
          <div>🔗 <b>Share your link</b> — friends stack, you earn 0.8% + 0.2%.</div>
        </div>
      </div>
    </div>
  );
}

// ---------- Vaults ----------
export function VaultList({ vaults, activeId, onSelect }: { vaults: Vault[]; activeId: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="vaults">
      {vaults.map((v) => {
        const pct = Math.min(100, (v.current_grams / v.target_grams) * 100);
        return (
          <div key={v.vault_id} className={'vault' + (v.vault_id === activeId ? ' active' : '')} onClick={() => onSelect(v.vault_id)}>
            <div className="vault-top">
              <span className="vault-name">{v.vault_id === activeId ? '🫐 ' : '○ '}{v.name}</span>
              <span className="vault-pct">{pct.toFixed(1)}%</span>
            </div>
            <div className="bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="vault-meta"><span><b>{v.current_grams.toFixed(3)}g</b> of {v.target_grams.toFixed(1)}g · XAUT</span><span>{gramsToOz(v.current_grams).toFixed(4)} oz</span></div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Swap box ----------
export function SwapBox({ quote, usd, setUsd, onConfirm, busy }: { quote: GoldQuote | null; usd: string; setUsd: (s: string) => void; onConfirm: () => void; busy: boolean }) {
  const n = parseFloat(usd) || 0;
  return (
    <div className="card swap">
      <h2 className="sec" style={{ marginTop: 0 }}>Stack gold ⚡</h2>
      <label>YOU PAY (USD)</label>
      <input inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="25" />
      {quote && n > 0 ? (
        <div className="quote">
          ≈ <b>{quote.grams.toFixed(4)} g</b> ({quote.oz.toFixed(6)} oz) XAUT<br />
          price <b>${quote.pricePerOzUSD.toLocaleString()}</b>/oz · fee <b>${quote.feeUSD.toFixed(2)}</b> (2%) · net <b>${quote.netUSD.toFixed(2)}</b><br />
          <span style={{ color: '#a8a29e' }}>source: {quote.source} · real swap via Whop when connected</span>
        </div>
      ) : (
        <div className="quote">Type an amount — e.g. <b>$10</b> ≈ a berry of gold. Minimum vibes, maximum compounding.</div>
      )}
      <div className="cta-row">
        <button className="btn gold" disabled={!(n > 0) || busy} onClick={onConfirm}>{busy ? 'Stacking…' : '🫐 Stack into vault'}</button>
      </div>
      <div className="fine">MVP: grams land in your active vault instantly (local). When Whop swaps are live for your account, the same button fires a real USD→XAUT swap first.</div>
    </div>
  );
}

// ---------- Wallet (Whop Elements slots) ----------
export function WalletPanel({ accountReady }: { accountReady: boolean }) {
  useEffect(() => {
    // Elements mount lazily when backend is live; slots degrade gracefully.
    (async () => {
      try {
        const res = await fetch('/.netlify/functions/token?accountId=me');
        if (!res.ok) return;
        await res.json();
      } catch { /* backend not configured yet — show placeholders */ }
    })();
  }, []);
  return (
    <div>
      <div className="wallet-grid">
        <div className="slot" id="gb-balance"><h4>Balance — Whop</h4><div className="mock-note">{accountReady ? 'Mounting BalanceElement…' : <>Connect Whop to see live ledger. Set <code>WHOP_API_KEY</code> in Netlify env, then this slot mounts <code>BalanceElement</code>.</>}</div></div>
        <div className="slot" id="gb-deposit"><h4>Deposit — Whop</h4><div className="mock-note">DepositElement lives here (cards, bank, crypto rails). Until then, use Stack box above to simulate.</div></div>
        <div className="slot" id="gb-withdraw"><h4>Withdraw — Whop</h4><div className="mock-note">WithdrawElement with live fees + arrival estimates. Non-custodial: money never touches Goldberry.</div></div>
      </div>
    </div>
  );
}

// ---------- Referral ----------
export function ReferralCenter() {
  const [ref, setRef] = useState<RefInfo>({ tier1: null, tier2: null });
  const [link, setLink] = useState('');
  const [stats, setStats] = useState({ pending: 0, paid: 0, count: 0 });
  useEffect(() => {
    setRef(captureRefFromURL());
    setLink(myRefLink());
    getMyId();
    fetch('/.netlify/functions/scheduled-payouts?stats=1').then((r) => r.json()).then((j) => {
      if (typeof j?.pending === 'number') setStats({ pending: j.pending, paid: j.paid ?? 0, count: j.count ?? 0 });
    }).catch(() => {});
  }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); alert('Link copied. Go be the gold friend. 🫐'); } catch { prompt('Copy your link:', link); }
  };
  return (
    <div className="card">
      <h2 className="sec" style={{ marginTop: 0 }}>Referral center 🔗</h2>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>You earn <b style={{ color: '#f5c518' }}>0.8%</b> on direct stacks + <b style={{ color: '#f5c518' }}>0.2%</b> on second-level. Paid via Whop Transfers after a 48h safety hold.</div>
      <div className="ref-link"><input readOnly value={link} /><button className="btn ghost" onClick={copy}>Copy</button></div>
      <div className="kpis">
        <div className="kpi"><b>${stats.pending.toFixed(2)}</b><span>pending</span></div>
        <div className="kpi"><b>${stats.paid.toFixed(2)}</b><span>paid</span></div>
        <div className="kpi"><b>{stats.count}</b><span>stacks</span></div>
      </div>
      {(ref.tier1 || ref.tier2) && <div className="fine">You joined via {ref.tier1 ?? '—'}{ref.tier2 ? ` (tier2: ${ref.tier2})` : ''}. Their cut is automatic. 🫶</div>}
    </div>
  );
}

// ---------- Create vault modal ----------
export function CreateVaultModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, target: number) => void }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('15');
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 4px' }}>New vault 🫐</h3>
        <div style={{ color: '#a8a29e', fontSize: 13 }}>Name the dream. Size it in grams. (1 oz = 31.1g)</div>
        <div className="field" style={{ marginTop: 12 }}><label>Vault name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tokyo Vault" /></div>
        <div className="field"><label>Target (grams)</label><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="15" /></div>
        <div className="row">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn gold" onClick={() => onCreate(name || 'New Vault', parseFloat(target) || 15)}>Create vault</button>
        </div>
      </div>
    </div>
  );
}

export function useGoldberry() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [activeId, setActive] = useState<string | null>(null);
  const [quote, setQuote] = useState<GoldQuote | null>(null);
  const [usd, setUsd] = useState('25');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const v = loadVaults();
    setVaults(v);
    const a = getActiveId();
    setActive(a && v.some((x) => x.vault_id === a) ? a : v[0]?.vault_id ?? null);
    fetchGoldPrice().then(({ pricePerOzUSD, source }) => {
      setQuote(quoteBuy(parseFloat(usd) || 0, pricePerOzUSD, source));
    });
    const timer = setInterval(async () => {
      const p = await fetchGoldPrice();
      setUsd((current) => {
        setQuote(quoteBuy(parseFloat(current) || 0, p.pricePerOzUSD, p.source));
        return current;
      });
    }, 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const n = parseFloat(usd) || 0;
    if (quote) setQuote(quoteBuy(n, quote.pricePerOzUSD, quote.source));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usd]);

  const totalGrams = vaults.reduce((s, v) => s + v.current_grams, 0);

  const stack = async () => {
    const n = parseFloat(usd) || 0;
    if (!(n > 0) || !quote || !activeId) return;
    setBusy(true);
    try {
      // Try real backend swap first (no-op until WHOP_API_KEY is set)
      try {
        const r = await fetch('/.netlify/functions/swaps-quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ amountUSD: n, ref: captureRefFromURL(), accountId: getMyId() }),
        });
        if (r.ok) {
          const j = await r.json();
          if (typeof j?.grams === 'number' && j.grams > 0) {
            setVaults(addGrams(activeId, j.grams));
            setToast(`Stacked ${j.grams.toFixed(4)}g via Whop 🫐`);
            setTimeout(() => setToast(null), 2600);
            return;
          }
        }
      } catch { /* fall through to local credit */ }
      const next = addGrams(activeId, quote.grams);
      setVaults(next);
      setToast(`Stacked ${quote.grams.toFixed(4)}g 🫐`);
      setTimeout(() => setToast(null), 2600);
    } finally {
      setBusy(false);
    }
  };

  const select = (id: string) => { setActive(id); setActiveId(id); };
  const create = (name: string, target: number) => {
    const v = createVault(name, target);
    const next = [...vaults, v];
    setVaults(next);
    select(v.vault_id);
  };

  return { vaults, activeId, totalGrams, quote, usd, setUsd, busy, toast, stack, select, create };
}
