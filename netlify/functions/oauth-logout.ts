// POST /.netlify/functions/oauth-logout — revoke refresh token, drop session.
import { getCookie, json, sessionClearCookie, WHOP_OAUTH, type Session } from './_shared.ts';
import { sessionDel, sessionGet } from './oauth-session.ts';

export default async (req: Request) => {
  const sid = getCookie(req, 'gb_session');
  if (sid) {
    const s = await sessionGet(sid);
    if (s?.refresh_token) {
      await fetch(`${WHOP_OAUTH}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: s.refresh_token }),
      }).catch(() => {});
    }
    await sessionDel(sid);
  }
  return json(200, { ok: true }, { 'set-cookie': sessionClearCookie() });
};
