// GET /.netlify/functions/token?accountId=biz_xxx
// Mints a short-lived Elements access token for a connected account.
import { json } from './_shared.ts';

export default async (req: Request) => {
  const url = new URL(req.url);
  const accountId = url.searchParams.get('accountId');
  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) return json(503, { error: 'WHOP_API_KEY not configured yet' });
  if (!accountId || accountId === 'me') {
    // 'me' is the frontend placeholder — resolve to platform account
    const biz = process.env.BIZ_ID;
    if (!biz) return json(400, { error: 'accountId required' });
    return mint(biz, apiKey);
  }
  return mint(accountId, apiKey);
};

async function mint(company_id: string, apiKey: string) {
  const { WhopClient } = await import('@whop/sdk');
  const whop = new WhopClient({ token: apiKey } as never);
  try {
    const tok = await (whop as unknown as { accessTokens: { create: (a: { company_id: string }) => Promise<{ token: string }> } }).accessTokens.create({ company_id });
    return json(200, { token: tok.token });
  } catch (e) {
    return json(502, { error: 'mint failed', detail: String(e).slice(0, 300) });
  }
}
