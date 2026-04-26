import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../embed.js', () => ({
  embedQuery: vi.fn(),
}));

vi.mock('../store.js', () => ({
  getRuntimeIndex: vi.fn(),
  search: vi.fn(),
}));

import { embedQuery } from '../embed.js';
import { getRuntimeIndex, search } from '../store.js';
import { retrieve } from '../query.js';

describe('retrieve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('embeds the prompt, opens the index, and searches with the game filter', async () => {
    const fakeEmbedding = [0.1, 0.2, 0.3];
    const fakeIndex = { id: 'fake-index' } as unknown;
    const fakeResults = [
      {
        text: 'Wake of Ashes opener',
        metadata: {
          game: 'wow' as const,
          source_file: 'wow/paladin-retribution.md',
          heading_path: 'Opener',
        },
        score: 0.92,
      },
    ];
    vi.mocked(embedQuery).mockResolvedValue(fakeEmbedding);
    vi.mocked(getRuntimeIndex).mockResolvedValue(fakeIndex as never);
    vi.mocked(search).mockResolvedValue(fakeResults);

    const out = await retrieve('how does ret pally open', { game: 'wow' });

    expect(embedQuery).toHaveBeenCalledWith('how does ret pally open');
    expect(getRuntimeIndex).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith(fakeIndex, fakeEmbedding, 5, {
      game: 'wow',
    });
    expect(out).toEqual(fakeResults);
  });

  it('honors the k override', async () => {
    vi.mocked(embedQuery).mockResolvedValue([]);
    vi.mocked(getRuntimeIndex).mockResolvedValue({} as never);
    vi.mocked(search).mockResolvedValue([]);

    await retrieve('q', { game: 'diablo', k: 10 });

    expect(search).toHaveBeenCalledWith(expect.anything(), [], 10, {
      game: 'diablo',
    });
  });

  it('returns empty array when search finds no chunks', async () => {
    vi.mocked(embedQuery).mockResolvedValue([0.1]);
    vi.mocked(getRuntimeIndex).mockResolvedValue({} as never);
    vi.mocked(search).mockResolvedValue([]);

    const out = await retrieve('obscure question', { game: 'ff14' });

    expect(out).toEqual([]);
  });

  it('propagates errors from embedQuery', async () => {
    vi.mocked(embedQuery).mockRejectedValue(new Error('voyage 500'));
    vi.mocked(getRuntimeIndex).mockResolvedValue({} as never);

    await expect(retrieve('q', { game: 'wow' })).rejects.toThrow(/voyage 500/);
  });
});
