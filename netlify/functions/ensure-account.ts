// POST /.netlify/functions/ensure-account (session cookie required)
// Idempotently provisions the user's connected gold account under the platform
// business. Returns {accountId, needsKyc, onboardingUrl?}.
import { json, whopFetch } from './_shared.ts';
import { loadSession, sessionSet } from './oauth-session.ts';

const PLATFORM_BIZ = process.env.BIZ_ID || '';

export default async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const apiKey = process.env.WHOP_API_KEY;
  if (!apiKey) return json(503, { error: 'WHOP_API_KEY not configured' });

  const found = await loadSession(req);
  if (!found) return json(401, { error: 'login required' });
  const { id: sid, session } = found;

  // Already provisioned? Re-check status (KYC may have completed since).
  if (session.account_id) {
    return json(200, await statusFor(session.account_id, apiKey));
  }

  // 1) Create connected account under the platform business.
  //    (The platform key determines ownership; metadata links our user.)
  const created = await whopFetch('/accounts', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      email: session.email || `goldberry+${session.user_id}@example.com`,
      title: `Goldberry · ${session.username || session.user_id.slice(0, 8)}`,
      metadata: { goldberry_user_id: session.user_id, app: 'goldberry' },
      ...(PLATFORM_BIZ ? { parent_company_id: PLATFORM_BIZ } : {}),
    }),
  });
  const account = created.data as { id?: string; error?: unknown } | null;
  if (!created.ok || !account?.id) {
    return json(502, { error: 'account creation failed', detail: JSON.stringify(created.data).slice(0, 300) });
  }

  // 2) Persist + report status.
  session.account_id = account.id;
  await sessionSet(sid, session).catch(() => {});
  return json(200, await statusFor(account.id, apiKey));
};

async function statusFor(accountId: string, apiKey: string) {
  // Read account; verification state decides whether onboarding is needed.
  const res = await whopFetch(`/accounts/${accountId}`, apiKey);
  const acc = (res.data || {}) as {
    verification_status?: string; verified?: boolean; requirements?: unknown;
  };
  const verified = acc.verified === true || acc.verification_status === 'verified';
  if (verified) return { accountId, needsKyc: false as const };

  // Not verified → mint a hosted onboarding link.
  const origin = process.env.URL || 'https://goldberry-app.netlify.app';
  const link = await whopFetch('/account_links', apiKey, {
    method: 'POST',
    body: JSON.stringify({
      company_id: accountId,
      refresh_url: `${origin}/onboarding`,
      return_url: `${origin}/?onboarded=1`,
      use_case: 'account_onboarding',
    }),
  });
  const linkData = (link.data || {}) as { url?: string };
  return {
    accountId,
    needsKyc: true as const,
    onboardingUrl: linkData.url || null,
    verification: acc.verification_status || 'unknown',
  };
}
