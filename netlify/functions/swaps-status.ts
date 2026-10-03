// GET /.netlify/functions/swaps-status?id=swap_xxx (session cookie required)
// Polls a swap until terminal (complete/failed). Frontend polls every 3s.
import { blobGet, blobSet, json, whopFetch } from './_shared.ts';
import { loadSession } from './oauth-session.ts';

export default async (req: Request) => {
  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) return json(503, { error: 'WHOP_API_KEY not configured' });
  const found = await loadSession(req);
  if (!found) return json(401, { error: 'login required' });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return json(400, { error: 'id required' });

  const res = await whopFetch(`/swaps/${encodeURIComponent(id)}`, apiKey);
  const s = (res.data || {}) as {
    status?: string; account_id?: string; error?: string | null; tx_hashes?: string[];
  };
  if (!res.ok) return json(502, { error: 'status check failed' });

  // Ownership guard: never leak another account's swap.
  if (s.account_id && s.account_id !== found.session.account_id) {
    return json(403, { error: 'not your swap' });
  }

  const terminal = s.status === 'complete' || s.status === 'failed';
  let grams: number | null = null;
  const tracked = await blobGet<{ expectedGrams?: number }>(`swaps/${id}.json`);
  if (tracked && s.status === 'complete') {
    grams = tracked.expectedGrams ?? null;
    await blobSet(`swaps/${id}.json`, { ...tracked, status: 'complete', grams });
  }

  return json(200, {
    status: s.status ?? 'unknown',
    terminal,
    grams,
    error: s.error ?? null,
    txHashes: s.tx_hashes ?? [],
  });
};
