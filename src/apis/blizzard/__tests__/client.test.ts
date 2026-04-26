import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn(async () => 'fake-token'),
}));

import { fetchStatic } from '../client.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchStatic', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('adds namespace and locale query params and Bearer auth', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await fetchStatic('/data/wow/playable-class/index');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://us.api.blizzard.com/data/wow/playable-class/index?namespace=static-us&locale=en_US',
    );
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer fake-token');
  });

  it('uses & separator when path already contains a query', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    await fetchStatic('/data/wow/spell/123?foo=bar');

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://us.api.blizzard.com/data/wow/spell/123?foo=bar&namespace=static-us&locale=en_US',
    );
  });

  it('returns parsed JSON typed as the caller generic', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1, name: 'paladin' }));

    const data = await fetchStatic<{ id: number; name: string }>(
      '/data/wow/playable-class/2',
    );

    expect(data).toEqual({ id: 1, name: 'paladin' });
  });

  it('retries once on 429 after a 1s delay, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('rate', { status: 429 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const promise = fetchStatic('/data/wow/spell/255937');
    await vi.advanceTimersByTimeAsync(1000);
    const data = await promise;
    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on a second 429', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('rate', { status: 429 }))
      .mockResolvedValueOnce(new Response('rate-again', { status: 429 }));

    const promise = fetchStatic('/data/wow/spell/255937');
    const assertion = expect(promise).rejects.toThrow(/429 on/);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it('throws with status + body on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));

    await expect(fetchStatic('/data/wow/spell/999999999')).rejects.toThrow(
      /Blizzard API 404 on \/data\/wow\/spell\/999999999: not found/,
    );
  });
});
