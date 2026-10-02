// Referral: ?ref=TIER1 or ?ref=TIER1_TIER2 — stored once (first-touch wins).
const REF_KEY = 'goldberry.ref.v1';
const ME_KEY = 'goldberry.me.v1';

export type RefInfo = { tier1: string | null; tier2: string | null };

export function getMyId(): string {
  let id = localStorage.getItem(ME_KEY);
  if (!id) {
    id = 'user_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(ME_KEY, id);
  }
  return id;
}

export function captureRefFromURL(): RefInfo {
  try {
    const q = new URLSearchParams(window.location.search);
    const raw = q.get('ref');
    if (raw) {
      // Format we generate: `${tier1}__${tier2}` or just tier1.
      // (user_xxx ids contain single underscores, so __ is the separator.)
      let tier1: string | null = null;
      let tier2: string | null = null;
      if (raw.includes('__')) {
        const [a, b] = raw.split('__');
        tier1 = a || null;
        tier2 = b || null;
      } else {
        tier1 = raw;
      }
      const existing = localStorage.getItem(REF_KEY);
      if (!existing) localStorage.setItem(REF_KEY, JSON.stringify({ tier1, tier2 }));
    }
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(REF_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { tier1: null, tier2: null };
}

export function myRefLink(): string {
  const me = getMyId();
  const base = window.location.origin + window.location.pathname;
  return `${base}?ref=${encodeURIComponent(me)}`;
}
