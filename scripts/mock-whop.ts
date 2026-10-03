// Mock Whop backend for offline E2E tests. Zero deps. NOT deployed.
// Usage: npx tsx scripts/mock-whop.ts  (listens on 127.0.0.1:8787)
import http from 'node:http';

const state = {
  verified: false,
  swaps: new Map<string, { polls: number; account_id: string; amount: string }>(),
  swapSeq: 0,
};

function send(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => { buf += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(buf || '{}')); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1:8787');
  const p = url.pathname;
  const body = req.method === 'POST' ? await readBody(req) : {};

  // --- test control ---
  if (p === '/__control' && req.method === 'POST') {
    if (typeof body.verified === 'boolean') state.verified = body.verified;
    return send(res, 200, { ok: true, verified: state.verified });
  }

  // --- OAuth ---
  if (p === '/oauth/token' && req.method === 'POST') {
    if (body.grant_type === 'refresh_token') {
      return send(res, 200, { access_token: 'mock_at_2', refresh_token: 'mock_rt_2', expires_in: 3600 });
    }
    if (body.grant_type === 'authorization_code' && body.code) {
      return send(res, 200, { access_token: 'mock_at_1', refresh_token: 'mock_rt_1', expires_in: 3600 });
    }
    return send(res, 400, { error: 'unsupported_grant' });
  }
  if (p === '/oauth/userinfo') {
    return send(res, 200, { sub: 'user_mock1', email: 'test@mock.dev', username: 'mockbug' });
  }
  if (p === '/oauth/revoke') return send(res, 200, {});

  // --- API v1 ---
  if (p === '/api/v1/access_tokens' && req.method === 'POST') {
    return send(res, 200, { token: `mock_access_${String(body.company_id || 'x')}` });
  }
  if (p === '/api/v1/accounts' && req.method === 'POST') {
    return send(res, 200, { id: 'biz_mock1', object: 'company' });
  }
  if (p === '/api/v1/accounts/biz_mock1') {
    return send(res, 200, {
      id: 'biz_mock1',
      verification_status: state.verified ? 'verified' : 'pending',
      verified: state.verified,
      balance: { crypto: [{ symbol: 'XAUT', balance: '0.5', value_usd: 2071.38 }] },
    });
  }
  if (p === '/api/v1/account_links' && req.method === 'POST') {
    return send(res, 200, { url: 'https://mock.kyc/verify/test' });
  }
  if (p === '/api/v1/swaps/quote' && req.method === 'POST') {
    const amt = parseFloat(String(body.amount || '0'));
    const out = (amt * 0.0002381).toFixed(6); // mirrors real rate
    return send(res, 200, {
      object: 'swap_quote', amount_in: String(amt), amount_out: out,
      rate: '0.0002381', fee_bps: 100, fee_amount: String(amt * 0.01),
      bridge_fee: 0.015, requires_token_approval: false,
    });
  }
  if (p === '/api/v1/swaps' && req.method === 'POST') {
    state.swapSeq += 1;
    const id = `swap_mock${state.swapSeq}`;
    state.swaps.set(id, { polls: 0, account_id: String(body.account_id || ''), amount: String(body.amount || '') });
    return send(res, 200, { id, status: 'queued', account_id: body.account_id });
  }
  const swapMatch = p.match(/^\/api\/v1\/swaps\/([\w-]+)$/);
  if (swapMatch && req.method === 'GET') {
    const s = state.swaps.get(swapMatch[1]);
    if (!s) return send(res, 404, { error: 'not found' });
    s.polls += 1;
    const status = s.polls >= 2 ? 'complete' : 'working';
    return send(res, 200, { id: swapMatch[1], status, account_id: s.account_id, tx_hashes: status === 'complete' ? ['0xmock'] : [] });
  }
  if (p === '/api/v1/transfers' && req.method === 'POST') {
    return send(res, 200, { id: 'ctt_mock1', status: 'succeeded' });
  }
  if (p === '/api/v1/fee_markups') {
    return send(res, 200, { data: [] });
  }

  return send(res, 404, { error: `mock: no route ${req.method} ${p}` });
});

server.listen(8787, '127.0.0.1', () => {
  console.log('mock-whop on http://127.0.0.1:8787');
});
