export type Vault = {
  vault_id: string;
  name: string;
  target_grams: number;
  current_grams: number;
  currency_symbol: 'XAUT';
  created_at: string;
};

const KEY = 'goldberry.vaults.v1';
const ACTIVE_KEY = 'goldberry.activeVault.v1';

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

const SEEDS: Vault[] = [
  { vault_id: 'v_SEED1', name: 'iPhone 18 Vault', target_grams: 30, current_grams: 12.45, currency_symbol: 'XAUT', created_at: new Date().toISOString() },
  { vault_id: 'v_SEED2', name: 'Bali Trip Vault', target_grams: 50, current_grams: 5.1, currency_symbol: 'XAUT', created_at: new Date().toISOString() },
];

export function loadVaults(): Vault[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(SEEDS));
      return SEEDS;
    }
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : SEEDS;
  } catch {
    return SEEDS;
  }
}

export function saveVaults(v: Vault[]) {
  localStorage.setItem(KEY, JSON.stringify(v));
}

export function createVault(name: string, target_grams: number): Vault {
  const v: Vault = {
    vault_id: uid('v'),
    name: name.trim().slice(0, 40) || 'New Vault',
    target_grams: Math.max(0.1, target_grams),
    current_grams: 0,
    currency_symbol: 'XAUT',
    created_at: new Date().toISOString(),
  };
  const all = [...loadVaults(), v];
  saveVaults(all);
  return v;
}

export function addGrams(vault_id: string, grams: number): Vault[] {
  const all = loadVaults().map((v) => (v.vault_id === vault_id ? { ...v, current_grams: v.current_grams + grams } : v));
  saveVaults(all);
  return all;
}

export function getActiveId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}
export function setActiveId(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}
