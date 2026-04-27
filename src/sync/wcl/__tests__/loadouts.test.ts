import { describe, expect, it, vi, beforeEach } from 'vitest';

const graphqlMock = vi.fn();
vi.mock('../../../apis/warcraftlogs/index.js', () => ({
  graphql: (q: string, v: Record<string, unknown>) => graphqlMock(q, v),
}));

import {
  fetchPlayerLoadout,
  extractLoadout,
  hashLoadout,
  trinketIds,
  TRINKET_SLOTS,
} from '../loadouts.js';
import type {
  CombatantInfoData,
  CombatantInfoGearItem,
} from '../../../apis/warcraftlogs/index.js';

function gearAt(_slot: number, id: number): CombatantInfoGearItem {
  return { id, itemLevel: 600 };
}

function gearArray(idsBySlot: Record<number, number>): CombatantInfoGearItem[] {
  const out: CombatantInfoGearItem[] = [];
  for (let i = 0; i < 18; i++) {
    out.push(gearAt(i, idsBySlot[i] ?? i + 1));
  }
  return out;
}

describe('fetchPlayerLoadout', () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it('matches the player by name and returns their CombatantInfo', async () => {
    graphqlMock.mockResolvedValue({
      reportData: {
        report: {
          masterData: {
            actors: [
              { id: 1, name: 'Alice' },
              { id: 2, name: 'Bob' },
            ],
          },
          events: {
            data: [
              { sourceID: 1, specID: 70 },
              { sourceID: 2, specID: 250 },
            ],
          },
        },
      },
    });
    const out = await fetchPlayerLoadout({
      code: 'abc',
      fightID: 1,
      playerName: 'Bob',
    });
    expect(out?.specID).toBe(250);
  });

  it('returns null when the player name is not in masterData', async () => {
    graphqlMock.mockResolvedValue({
      reportData: {
        report: {
          masterData: { actors: [{ id: 1, name: 'Alice' }] },
          events: { data: [{ sourceID: 1, specID: 70 }] },
        },
      },
    });
    const out = await fetchPlayerLoadout({
      code: 'abc',
      fightID: 1,
      playerName: 'Bob',
    });
    expect(out).toBeNull();
  });

  it('returns null when no CombatantInfo matches the actor id', async () => {
    graphqlMock.mockResolvedValue({
      reportData: {
        report: {
          masterData: { actors: [{ id: 1, name: 'Alice' }] },
          events: { data: [{ sourceID: 99, specID: 70 }] },
        },
      },
    });
    const out = await fetchPlayerLoadout({
      code: 'abc',
      fightID: 1,
      playerName: 'Alice',
    });
    expect(out).toBeNull();
  });

  it('returns null when report is missing (private log)', async () => {
    graphqlMock.mockResolvedValue({ reportData: { report: null } });
    const out = await fetchPlayerLoadout({
      code: 'x',
      fightID: 1,
      playerName: 'Alice',
    });
    expect(out).toBeNull();
  });
});

describe('extractLoadout', () => {
  it('strips empty/zero talent ids', () => {
    const data: CombatantInfoData = {
      talentTree: [
        { id: 100, rank: 1 },
        { id: 0, rank: 1 },
        { id: 200, rank: 2 },
      ],
    };
    const out = extractLoadout(data);
    expect(out.talents).toHaveLength(2);
    expect(out.talents.map((t) => t.id).sort()).toEqual([100, 200]);
  });

  it('captures gear items', () => {
    const data: CombatantInfoData = { gear: gearArray({}) };
    const out = extractLoadout(data);
    expect(out.gear).toHaveLength(18);
  });

  it('collapses crit/haste/versatility multi-channel into max', () => {
    const data: CombatantInfoData = {
      critMelee: 3000,
      critRanged: 3000,
      critSpell: 5000,
      hasteMelee: 1000,
      hasteSpell: 2500,
      mastery: 1500,
      versatilityDamageDone: 800,
      versatilityHealingDone: 800,
      versatilityDamageReduction: 400,
    };
    const out = extractLoadout(data);
    expect(out.stats.crit).toBe(5000);
    expect(out.stats.haste).toBe(2500);
    expect(out.stats.mastery).toBe(1500);
    expect(out.stats.versatility).toBe(800);
  });

  it('passes specID through when present, omits when absent', () => {
    expect(extractLoadout({ specID: 70 }).specID).toBe(70);
    expect(extractLoadout({}).specID).toBeUndefined();
  });

  it('handles fully-empty input safely', () => {
    const out = extractLoadout({});
    expect(out.talents).toEqual([]);
    expect(out.gear).toEqual([]);
    expect(out.stats.crit).toBe(0);
  });
});

describe('hashLoadout', () => {
  it('is order-independent', () => {
    const a = hashLoadout([
      { id: 1, rank: 1 },
      { id: 2, rank: 2 },
    ]);
    const b = hashLoadout([
      { id: 2, rank: 2 },
      { id: 1, rank: 1 },
    ]);
    expect(a).toBe(b);
  });

  it('differentiates ranks', () => {
    const a = hashLoadout([{ id: 1, rank: 1 }]);
    const b = hashLoadout([{ id: 1, rank: 2 }]);
    expect(a).not.toBe(b);
  });
});

describe('trinketIds', () => {
  it('extracts ids from slots 12 and 13', () => {
    const gear = gearArray({ 12: 999, 13: 888 });
    expect(trinketIds(gear)).toEqual([999, 888]);
  });

  it('skips empty slots', () => {
    const gear: CombatantInfoGearItem[] = [];
    for (let i = 0; i < 14; i++) gear.push({ id: 0 });
    gear[12] = { id: 1234 };
    expect(trinketIds(gear)).toEqual([1234]);
  });

  it('TRINKET_SLOTS constant covers slot 12 and 13', () => {
    expect([...TRINKET_SLOTS]).toEqual([12, 13]);
  });
});
