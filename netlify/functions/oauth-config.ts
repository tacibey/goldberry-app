// GET /.netlify/functions/oauth-config → public OAuth bootstrap.
// Returns the client_id + redirect URI so the SPA can start login.
// If no OAuth app is configured yet, {configured:false} and the UI stays in demo mode.
import { json } from './_shared.ts';

export default async (req: Request) => {
  const url = new URL(req.url);
  const clientId = process.env.WHOP_OAUTH_CLIENT_ID || '';
  const redirectUri =
    process.env.WHOP_OAUTH_REDIRECT_URI || `${url.origin}/oauth/callback`;
  return json(200, {
    configured: Boolean(clientId),
    clientId,
    redirectUri,
    scope: 'openid profile email',
  });
};
