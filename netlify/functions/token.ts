// GET /.netlify/functions/token?accountId=biz_xxx
// Mints a short-lived Elements access token for a connected account.
// Zero-dependency: plain fetch to the Whop REST API (keeps bundles instant).
import { json } from './_shared.ts';

export default async (req: Request) => {
  const url = new URL(req.url);
  let accountId = url.searchParams.get('accountId');
  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) return json(503, { error: 'WHOP_API_KEY not configured yet' });
  if (!accountId || accountId === 'me') {
    accountId = process.env.BIZ_ID || null;
    if (!accountId) return json(400, { error: 'accountId required' });
  }
  try {
    const r = await fetch('https://api.whop.com/api/v1/access_tokens', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ company_id: accountId }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.token) return json(502, { error: 'mint failed', detail: JSON.stringify(j).slice(0, 200) });
    return json(200, { token: j.token });
  } catch (e) {
    return json(502, { error: 'mint failed', detail: String(e).slice(0, 200) });
  }
};
