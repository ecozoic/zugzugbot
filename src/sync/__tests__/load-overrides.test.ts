import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readFileMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  readFile: (...args: unknown[]) => readFileMock(...args),
}));

import { loadOverrides } from '../load-overrides.js';

describe('loadOverrides', () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('parses a valid file, injecting class from the key and applying defaults', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        paladin: [
          {
            spell_id: 35395,
            specs: ['retribution'],
            source_type: 'spec_baseline',
          },
          { spell_id: 642 },
        ],
      }),
    );

    const out = await loadOverrides('kb/wow/_overrides.json');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      spell_id: 35395,
      class: 'paladin',
      specs: ['retribution'],
      source_type: 'spec_baseline',
    });
    expect(out[1]).toMatchObject({
      spell_id: 642,
      class: 'paladin',
      specs: [],
      source_type: 'class_baseline',
    });
  });

  it('flattens multiple class buckets into a single list with class injected', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        paladin: [{ spell_id: 35395 }],
        shaman: [{ spell_id: 8042 }],
      }),
    );
    const out = await loadOverrides('kb/wow/_overrides.json');
    expect(out).toHaveLength(2);
    const byClass = Object.fromEntries(out.map((e) => [e.class, e.spell_id]));
    expect(byClass).toEqual({ paladin: 35395, shaman: 8042 });
  });

  it('returns [] for empty file content', async () => {
    readFileMock.mockResolvedValue('');
    const out = await loadOverrides('kb/wow/_overrides.json');
    expect(out).toEqual([]);
  });

  it('returns [] for whitespace-only content', async () => {
    readFileMock.mockResolvedValue('   \n  \n');
    const out = await loadOverrides('kb/wow/_overrides.json');
    expect(out).toEqual([]);
  });

  it('returns [] for a file containing only {}', async () => {
    readFileMock.mockResolvedValue('{}');
    const out = await loadOverrides('kb/wow/_overrides.json');
    expect(out).toEqual([]);
  });

  it('throws a helpful error when the file is missing (ENOENT)', async () => {
    const err = new Error(
      'ENOENT: no such file or directory',
    ) as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    readFileMock.mockRejectedValue(err);

    await expect(loadOverrides('kb/wow/_overrides.json')).rejects.toThrow(
      /overrides file not found at kb\/wow\/_overrides\.json/,
    );
  });

  it('throws on invalid JSON', async () => {
    readFileMock.mockResolvedValue('{ not json');
    await expect(loadOverrides('kb/wow/_overrides.json')).rejects.toThrow(
      /not valid JSON/,
    );
  });

  it('rejects entries that are missing spell_id', async () => {
    readFileMock.mockResolvedValue(JSON.stringify({ paladin: [{}] }));
    await expect(loadOverrides('kb/wow/_overrides.json')).rejects.toThrow(
      /schema validation/,
    );
  });

  it('rejects entries with an unknown source_type', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        paladin: [{ spell_id: 35395, source_type: 'made-up-type' }],
      }),
    );
    await expect(loadOverrides('kb/wow/_overrides.json')).rejects.toThrow(
      /schema validation/,
    );
  });

  it('rejects when the top-level value is not an object of arrays', async () => {
    readFileMock.mockResolvedValue(JSON.stringify([{ spell_id: 35395 }]));
    await expect(loadOverrides('kb/wow/_overrides.json')).rejects.toThrow(
      /schema validation/,
    );
  });

  it('filters by class when classFilter is provided', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        paladin: [{ spell_id: 35395 }],
        shaman: [{ spell_id: 1 }],
      }),
    );
    const out = await loadOverrides('kb/wow/_overrides.json', {
      classFilter: 'paladin',
    });
    expect(out).toHaveLength(1);
    expect(out[0]?.class).toBe('paladin');
  });

  it('class-wide overrides (specs=[]) survive a --spec filter', async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        paladin: [
          { spell_id: 35395, specs: [] },
          { spell_id: 1, specs: ['protection'] },
        ],
      }),
    );
    const out = await loadOverrides('kb/wow/_overrides.json', {
      classFilter: 'paladin',
      specFilter: 'retribution',
    });
    expect(out.map((e) => e.spell_id)).toEqual([35395]);
  });
});
