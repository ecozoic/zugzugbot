import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TalentRef } from '../walk-catalog.js';

const writeFileMock = vi.fn();
const mkdirMock = vi.fn();

vi.mock('node:fs/promises', () => ({
  writeFile: (...args: unknown[]) => writeFileMock(...args),
  mkdir: (...args: unknown[]) => mkdirMock(...args),
}));

import { writeTalentIndex } from '../build-talent-index.js';

const META = { syncedAt: '2026-04-26T22:00:00Z', patch: '12.0.5' };

function ref(
  over: Partial<TalentRef> & Pick<TalentRef, 'talentId'>,
): TalentRef {
  return {
    talentName: 'Test Talent',
    className: 'paladin',
    specs: ['retribution'],
    tree: 'class_talent',
    nodeId: 0,
    spellId: 0,
    ...over,
  };
}

describe('writeTalentIndex', () => {
  beforeEach(() => {
    writeFileMock.mockReset();
    mkdirMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes a JSON file at data/blizz/talent-index.json with by_id keyed lookup', async () => {
    const talents = new Map<number, TalentRef>([
      [
        107588,
        ref({
          talentId: 107588,
          talentName: 'Lay on Hands',
          specs: ['retribution', 'protection', 'holy'],
          nodeId: 81597,
          spellId: 633,
        }),
      ],
    ]);
    await writeTalentIndex(talents, META);

    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const [filePath, content] = writeFileMock.mock.calls[0]!;
    expect(filePath).toBe('data/blizz/talent-index.json');
    const parsed = JSON.parse(content as string);
    expect(parsed.synced_at).toBe(META.syncedAt);
    expect(parsed.patch).toBe(META.patch);
    expect(parsed.by_id['107588']).toMatchObject({
      name: 'Lay on Hands',
      class: 'paladin',
      specs: ['retribution', 'protection', 'holy'],
      tree: 'class_talent',
      hero_tree: null,
      node_id: 81597,
      spell_id: 633,
    });
  });

  it('sorts entries numerically by talent ID for diff stability', async () => {
    const talents = new Map<number, TalentRef>([
      [122822, ref({ talentId: 122822, talentName: 'Wrathful Descent' })],
      [107588, ref({ talentId: 107588, talentName: 'Lay on Hands' })],
      [99999, ref({ talentId: 99999, talentName: 'Earlier Talent' })],
    ]);
    await writeTalentIndex(talents, META);
    const [, content] = writeFileMock.mock.calls[0]!;
    const parsed = JSON.parse(content as string);
    expect(Object.keys(parsed.by_id)).toEqual(['99999', '107588', '122822']);
  });

  it('renders hero_tree value when present, null when absent', async () => {
    const talents = new Map<number, TalentRef>([
      [
        1,
        ref({
          talentId: 1,
          tree: 'hero_talent',
          heroTree: 'templar',
        }),
      ],
      [
        2,
        ref({
          talentId: 2,
          tree: 'class_talent',
        }),
      ],
    ]);
    await writeTalentIndex(talents, META);
    const [, content] = writeFileMock.mock.calls[0]!;
    const parsed = JSON.parse(content as string);
    expect(parsed.by_id['1'].hero_tree).toBe('templar');
    expect(parsed.by_id['2'].hero_tree).toBeNull();
  });

  it('omits spell_id when not provided', async () => {
    const talents = new Map<number, TalentRef>([
      [
        42,
        { ...ref({ talentId: 42 }), spellId: undefined as unknown as number },
      ],
    ]);
    // Construct without spellId via direct object
    talents.set(42, {
      talentId: 42,
      talentName: 'No Spell',
      className: 'paladin',
      specs: ['retribution'],
      tree: 'class_talent',
      nodeId: 0,
    });
    await writeTalentIndex(talents, META);
    const [, content] = writeFileMock.mock.calls[0]!;
    const parsed = JSON.parse(content as string);
    expect(parsed.by_id['42']).not.toHaveProperty('spell_id');
  });

  it('writes empty by_id object when given an empty map', async () => {
    await writeTalentIndex(new Map(), META);
    const [, content] = writeFileMock.mock.calls[0]!;
    const parsed = JSON.parse(content as string);
    expect(parsed.by_id).toEqual({});
  });

  it('creates parent directory before writing', async () => {
    await writeTalentIndex(new Map(), META);
    expect(mkdirMock).toHaveBeenCalledWith('data/blizz', { recursive: true });
  });
});
