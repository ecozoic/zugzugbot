import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth.js', () => ({
  getAccessToken: vi.fn(async () => 'test-token'),
}));

import { graphql } from '../client.js';

interface FetchMock {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

const originalFetch = globalThis.fetch;

describe('warcraftlogs/client.graphql', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('posts JSON body and returns data field on success', async () => {
    const fetchMock: FetchMock = vi.fn(async () =>
      jsonResponse({ data: { ok: true } }),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const result = await graphql<{ ok: boolean }>('query { ok }', { x: 1 });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]!;
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(init.body as string)).toEqual({
      query: 'query { ok }',
      variables: { x: 1 },
    });
  });

  it('retries once on 429 then succeeds', async () => {
    let attempt = 0;
    const fetchMock: FetchMock = vi.fn(async () => {
      attempt++;
      if (attempt === 1) return new Response('rate limited', { status: 429 });
      return jsonResponse({ data: { ok: true } });
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    const promise = graphql<{ ok: boolean }>('q');
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on non-2xx with descriptive error including body', async () => {
    const fetchMock: FetchMock = vi.fn(
      async () => new Response('bad request', { status: 400 }),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(graphql('q')).rejects.toThrow(/400/);
    await expect(graphql('q')).rejects.toThrow(/bad request/);
  });

  it('propagates GraphQL errors[]', async () => {
    const fetchMock: FetchMock = vi.fn(async () =>
      jsonResponse({
        errors: [{ message: 'Field "foo" not found' }],
      }),
    );
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(graphql('q')).rejects.toThrow(/Field "foo" not found/);
  });

  it('throws when body has neither data nor errors', async () => {
    const fetchMock: FetchMock = vi.fn(async () => jsonResponse({}));
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    await expect(graphql('q')).rejects.toThrow(/no data/i);
  });
});
