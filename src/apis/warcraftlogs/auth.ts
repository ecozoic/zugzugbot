import { env } from '../../config/env.js';

interface AccessToken {
  token: string;
  expiresAt: number;
}

let cached: AccessToken | null = null;

const OAUTH_URL = 'https://www.warcraftlogs.com/oauth/token';
const SAFETY_WINDOW_MS = 60_000;

export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - SAFETY_WINDOW_MS) {
    return cached.token;
  }
  const clientId = env.WCL_CLIENT_ID;
  const clientSecret = env.WCL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'WCL_CLIENT_ID and WCL_CLIENT_SECRET must be set to call the Warcraft Logs API',
    );
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Warcraft Logs OAuth failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cached.token;
}

export function _resetTokenCacheForTests(): void {
  cached = null;
}
