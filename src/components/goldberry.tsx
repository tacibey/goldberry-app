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
          <span className="tick">USDT → XAUT <b>real Whop rail</b></span>
          <span className="tick">2% once, <b>on cash-out</b></span>
          <span className="tick">non-custodial <b>Whop ledger</b></span>
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
export function SwapBox({ quote, usd, setUsd, onConfirm, busy, live }: { quote: GoldQuote | null; usd: string; setUsd: (s: string) => void; onConfirm: () => void; busy: boolean; live?: boolean }) {
  const n = parseFloat(usd) || 0;
  return (
    <div className="card swap">
      <h2 className="sec" style={{ marginTop: 0 }}>Stack gold ⚡</h2>
      <label>YOU PAY (USD)</label>
      <input inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} placeholder="25" />
      {quote && n > 0 ? (
        <div className="quote">
          ≈ <b>{quote.grams.toFixed(4)} g</b> ({quote.oz.toFixed(6)} oz) XAUT<br />
          price <b>${quote.pricePerOzUSD.toLocaleString()}</b>/oz · est. fee <b>${quote.feeUSD.toFixed(2)}</b> · net <b>${quote.netUSD.toFixed(2)}</b><br />
          <span style={{ color: '#a8a29e' }}>source: {quote.source} · real swap via Whop when connected</span>
        </div>
      ) : (
        <div className="quote">Type an amount — e.g. <b>$10</b> ≈ a berry of gold. Minimum vibes, maximum compounding.</div>
      )}
      <div className="cta-row">
        <button className="btn gold" disabled={!(n > 0) || busy} onClick={onConfirm}>{busy ? 'Stacking…' : live ? '⚡ Stack real gold' : '🫐 Stack into vault'}</button>
      </div>
      {live ? (
        <div className="fine">LIVE MODE — real USDT → real XAUT on your Whop account (min $5). Settles in seconds; grams credit when the swap completes.</div>
      ) : (
        <div className="fine">DEMO MODE — no login, no money moves. Sign in to stack real gold. Live rail: deposit USD → USDT, swap USDT→XAUT on Plasma via Whop (~1% swap fee). Goldberry's 2% applies once, on cash-out — referrals 0.8%/0.2% paid after a 48h hold.</div>
      )}
    </div>
  );
}

// ---------- Wallet (Whop Elements: real mounts when live, placeholders in demo) ----------
export function WalletPanel({ accountReady, accountId }: { accountReady: boolean; accountId?: string | null }) {
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!accountReady || !accountId) return;
    let cancelled = false;
    setStatus('Connecting to Whop…');
    (async () => {
      try {
        const res = await fetch(`/.netlify/functions/token?accountId=${encodeURIComponent(accountId)}`);
        if (!res.ok) throw new Error(`token endpoint: HTTP ${res.status}`);
        const { token } = (await res.json()) as { token?: string };
        if (!token) throw new Error('no token issued');
        if (cancelled) return;

        // loadWhop() resolves to a constructor — it MUST be awaited, then called.
        const { loadWhop } = await import('@whop/elements');
        const Whop = await loadWhop();
        const whop = (Whop as unknown as (opts: { locale: string }) => {
          wallet: {
            create: (opts: { accountId: string; accessToken: string; appearance?: unknown; onIdentityVerificationRequested?: () => void }) => {
              create: (kind: string) => { mount: (sel: string) => void; create: (kind: string) => { mount: (sel: string) => void } };
            };
          };
        })({ locale: 'en' });
        if (cancelled) return;
        const wallet = whop.wallet.create({
          accountId,
          accessToken: token,
          // Goldberry is dark — without this, element text renders black-on-dark.
          appearance: { theme: { appearance: 'dark' } },
          // The deposit element's "Verify identity" button has no default action
          // on an external site — route it to our hosted KYC onboarding link.
          onIdentityVerificationRequested: () => {
            void fetch('/.netlify/functions/ensure-account', { method: 'POST' })
              .then((r) => r.json())
              .then((j: { onboardingUrl?: string }) => {
                if (j.onboardingUrl) window.open(j.onboardingUrl, '_blank', 'noopener');
              })
              .catch(() => {});
          },
        });

        const balances = wallet.create('balances');
        balances.create('balance').mount('#gb-balance');
        wallet.create('deposit').mount('#gb-deposit');
        wallet.create('withdraw').mount('#gb-withdraw');
        if (!cancelled) setStatus(null);
      } catch (e) {
        if (!cancelled) setStatus(`Could not load Whop rails: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    return () => { cancelled = true; };
  }, [accountReady, accountId]);

  return (
    <div>
      {status && <div className="mock-note" style={{ marginBottom: 10 }}>{status}</div>}
      <div className="wallet-grid">
        <div className="slot" id="gb-balance"><h4>Balance — Whop</h4>{!accountReady && <div className="mock-note">Sign in + open your gold account to see your live ledger here.</div>}</div>
        <div className="slot" id="gb-deposit"><h4>Deposit — Whop</h4>{!accountReady && <div className="mock-note">Your deposit rails (card, bank, crypto) mount here once your account is active.</div>}</div>
        <div className="slot" id="gb-withdraw"><h4>Withdraw — Whop</h4>{!accountReady && <div className="mock-note">Withdraw with live fees + arrival estimates. Non-custodial: money never touches Goldberry.</div>}</div>
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
  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };
  const creditGrams = (grams: number) => {
    if (!activeId || !(grams > 0)) return;
    setVaults(addGrams(activeId, grams));
  };

  return { vaults, activeId, totalGrams, quote, usd, setUsd, busy, toast, stack, select, create, creditGrams, notify, setBusy };
}
