import { getAccessToken } from './auth.js';

const BASE = 'https://us.api.blizzard.com';
const NAMESPACE_STATIC = 'static-us';
const LOCALE = 'en_US';
const RETRY_DELAY_MS = 1000;

export async function fetchStatic<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE}${path}${sep}namespace=${NAMESPACE_STATIC}&locale=${LOCALE}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429 && attempt === 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Blizzard API ${res.status} on ${path}: ${body}`);
    }
    return (await res.json()) as T;
  }
  throw new Error(`Blizzard API rate-limited after retry on ${path}`);
}
