// scripts/setup-fees.ts — run with: npm run fees:setup
// Probes which FeeMarkupTypes your account actually supports (docs enum is
// withdrawal-only; swap markups from the brief do NOT exist). Safe: read-first,
// then attempts the closest honest monetization rail and reports.
const API = 'https://api.whop.com/api/v1';

async function call(path: string, init?: RequestInit) {
  const r = await fetch(API + path, {
    ...init,
    headers: { authorization: `Bearer ${process.env.WHOP_API_KEY}`, 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, body: j };
}

async function main() {
  if (!process.env.WHOP_API_KEY || !process.env.BIZ_ID) {
    console.error('Set WHOP_API_KEY and BIZ_ID first.');
    process.exit(1);
  }
  const biz = process.env.BIZ_ID!;
  console.log('→ listing existing fee markups for', biz);
  console.log(await call(`/fee_markups?company_id=${biz}`));

  const candidates = [
    'crypto_withdrawal_markup',
    'bank_wire_withdrawal_markup',
    'digital_wallet_withdrawal_markup',
  ];
  for (const fee_type of candidates) {
    console.log(`→ trying ${fee_type} @ 2%…`);
    const res = await call('/fee_markups', {
      method: 'POST',
      body: JSON.stringify({ company_id: biz, fee_type, percentage_fee: 2.0, notes: 'Goldberry 2% — set by setup script' }),
    });
    console.log(`  ${res.status}`, JSON.stringify(res.body).slice(0, 400));
    if (res.status === 200) {
      console.log(`✓ monetization rail live: ${fee_type} 2%`);
      return;
    }
  }
  console.log('! no fee markup accepted — monetize via Transfers spread instead (see README).');
}

main();
