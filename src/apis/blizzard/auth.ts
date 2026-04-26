import { env } from '../../config/env.js';

interface AccessToken {
  token: string;
  expiresAt: number;
}

let cached: AccessToken | null = null;

const OAUTH_URL = 'https://oauth.battle.net/token';
const SAFETY_WINDOW_MS = 60_000;

export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - SAFETY_WINDOW_MS) {
    return cached.token;
  }
  const clientId = env.BLIZZARD_CLIENT_ID;
  const clientSecret = env.BLIZZARD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET must be set to sync abilities',
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
    throw new Error(`Blizzard OAuth failed: ${res.status} ${body}`);
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
