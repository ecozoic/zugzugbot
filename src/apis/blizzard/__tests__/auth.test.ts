import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const envMock: { env: Record<string, string | undefined> } = {
  env: { BLIZZARD_CLIENT_ID: 'test-id', BLIZZARD_CLIENT_SECRET: 'test-secret' },
};

vi.mock('../../../config/env.js', () => envMock);

async function loadAuth(): Promise<typeof import('../auth.js')> {
  vi.resetModules();
  return await import('../auth.js');
}

function okResponse(token: string, expiresIn: number): Response {
  return new Response(
    JSON.stringify({ access_token: token, expires_in: expiresIn }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('getAccessToken', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    envMock.env = {
      BLIZZARD_CLIENT_ID: 'test-id',
      BLIZZARD_CLIENT_SECRET: 'test-secret',
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('caches the token and reuses it before expiry', async () => {
    fetchMock.mockResolvedValue(okResponse('tok-1', 3600));
    const { getAccessToken, _resetTokenCacheForTests } = await loadAuth();
    _resetTokenCacheForTests();

    const a = await getAccessToken();
    const b = await getAccessToken();
    expect(a).toBe('tok-1');
    expect(b).toBe('tok-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-fetches the token after expiry', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse('tok-old', 1))
      .mockResolvedValueOnce(okResponse('tok-new', 3600));
    const { getAccessToken, _resetTokenCacheForTests } = await loadAuth();
    _resetTokenCacheForTests();

    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      const first = await getAccessToken();
      expect(first).toBe('tok-old');
      now += 5 * 60_000;
      const second = await getAccessToken();
      expect(second).toBe('tok-new');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = realNow;
    }
  });

  it('throws a clear error when env credentials are missing', async () => {
    envMock.env = {};
    const { getAccessToken, _resetTokenCacheForTests } = await loadAuth();
    _resetTokenCacheForTests();

    await expect(getAccessToken()).rejects.toThrow(
      /BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET must be set/,
    );
  });

  it('throws with status + body on a 4xx OAuth response', async () => {
    fetchMock.mockResolvedValue(
      new Response('invalid_client', { status: 401 }),
    );
    const { getAccessToken, _resetTokenCacheForTests } = await loadAuth();
    _resetTokenCacheForTests();

    await expect(getAccessToken()).rejects.toThrow(
      /Blizzard OAuth failed: 401 invalid_client/,
    );
  });

  it('sends Basic auth and client_credentials grant', async () => {
    fetchMock.mockResolvedValue(okResponse('tok-x', 3600));
    const { getAccessToken, _resetTokenCacheForTests } = await loadAuth();
    _resetTokenCacheForTests();

    await getAccessToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://oauth.battle.net/token');
    const initObj = init as RequestInit;
    expect(initObj.method).toBe('POST');
    expect(initObj.body).toBe('grant_type=client_credentials');
    const headers = initObj.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });
});
