import { describe, expect, it } from 'vitest';
import {
  pickCanonicalLoadout,
  resolveTalents,
  summarizeHeroTrees,
  summarizeTrinkets,
  summarizeTierSets,
  summarizeStatPriority,
  buildSnapshot,
} from '../aggregate.js';
import type { PlayerLoadout } from '../loadouts.js';
import { buildTalentIndex, type TalentIndexFile } from '../talent-index.js';

const TALENT_INDEX_FILE: TalentIndexFile = {
  synced_at: '2026-04-26T00:00:00Z',
  patch: '12.0.5',
  by_id: {
    '100': {
      name: 'Class A',
      class: 'paladin',
      specs: ['retribution'],
      tree: 'class_talent',
      hero_tree: null,
      node_id: 1,
    },
    '200': {
      name: 'Spec X',
      class: 'paladin',
      specs: ['retribution'],
      tree: 'spec_talent',
      hero_tree: null,
      node_id: 2,
    },
    '300': {
      name: 'Templar 1',
      class: 'paladin',
      specs: ['retribution'],
      tree: 'hero_talent',
      hero_tree: 'templar',
      node_id: 3,
    },
    '301': {
      name: 'Templar 2',
      class: 'paladin',
      specs: ['retribution'],
      tree: 'hero_talent',
      hero_tree: 'templar',
      node_id: 4,
    },
    '400': {
      name: 'Herald 1',
      class: 'paladin',
      specs: ['retribution'],
      tree: 'hero_talent',
      hero_tree: 'herald-of-the-sun',
      node_id: 5,
    },
  },
};

const TALENT_INDEX = buildTalentIndex(TALENT_INDEX_FILE);

function fakePlayer(opts: {
  talents?: Array<{ id: number; rank: number; nodeID?: number }>;
  gear?: Array<{ id: number; setID?: number }>;
  stats?: Partial<PlayerLoadout['stats']>;
}): PlayerLoadout {
  const baseGear = Array.from({ length: 18 }, (_, i) => ({ id: i + 1 }));
  const gear = baseGear.map((g, i) => ({
    ...g,
    ...(opts.gear?.[i] ?? {}),
  }));
  if (opts.gear) {
    for (let i = 0; i < opts.gear.length; i++) {
      gear[i] = { ...gear[i]!, ...opts.gear[i]! };
    }
  }
  return {
    talents: opts.talents ?? [],
    gear,
    stats: {
      strength: 0,
      agility: 0,
      stamina: 0,
      intellect: 0,
      crit: 0,
      haste: 0,
      mastery: 0,
      versatility: 0,
      ...opts.stats,
    },
  };
}

describe('pickCanonicalLoadout', () => {
  it('returns consensus loadout when 2+ players match', () => {
    const players = [
      fakePlayer({
        talents: [
          { id: 1, rank: 1 },
          { id: 2, rank: 1 },
        ],
      }),
      fakePlayer({
        talents: [
          { id: 2, rank: 1 },
          { id: 1, rank: 1 },
        ],
      }),
      fakePlayer({ talents: [{ id: 9, rank: 1 }] }),
    ];
    const out = pickCanonicalLoadout(players);
    expect(out.consensus).toBe(true);
    expect(out.loadout.map((t) => t.id).sort()).toEqual([1, 2]);
  });

  it('falls back to top player when no majority exists', () => {
    const players = [
      fakePlayer({ talents: [{ id: 1, rank: 1 }] }),
      fakePlayer({ talents: [{ id: 2, rank: 1 }] }),
      fakePlayer({ talents: [{ id: 3, rank: 1 }] }),
    ];
    const out = pickCanonicalLoadout(players);
    expect(out.consensus).toBe(false);
    expect(out.loadout[0]?.id).toBe(1);
  });

  it('returns empty loadout for empty input', () => {
    expect(pickCanonicalLoadout([])).toEqual({ loadout: [], consensus: false });
  });
});

describe('resolveTalents', () => {
  it('looks up names by talent nodeID (Blizzard node_id)', () => {
    const out = resolveTalents(
      [{ id: 999999, rank: 1, nodeID: 1 }],
      TALENT_INDEX,
    );
    expect(out[0]).toMatchObject({ name: 'Class A', tree: 'class_talent' });
  });

  it('marks unknown talents with tree="unknown"', () => {
    const out = resolveTalents(
      [{ id: 99999, rank: 1, nodeID: 99999 }],
      TALENT_INDEX,
    );
    expect(out[0]?.tree).toBe('unknown');
    expect(out[0]?.name).toContain('99999');
  });

  it('marks tree="unknown" when nodeID is missing', () => {
    const out = resolveTalents([{ id: 100, rank: 1 }], TALENT_INDEX);
    expect(out[0]?.tree).toBe('unknown');
  });
});

describe('summarizeHeroTrees', () => {
  it('classifies players by their dominant hero tree (matched by nodeID)', () => {
    const players = [
      fakePlayer({
        talents: [
          { id: 9001, rank: 1, nodeID: 3 },
          { id: 9002, rank: 1, nodeID: 4 },
        ],
      }),
      fakePlayer({ talents: [{ id: 9003, rank: 1, nodeID: 3 }] }),
      fakePlayer({ talents: [{ id: 9004, rank: 1, nodeID: 5 }] }),
    ];
    const out = summarizeHeroTrees(players, TALENT_INDEX);
    expect(out.dominant).toBe('templar');
    expect(out.splits.templar).toBe(2);
    expect(out.splits['herald-of-the-sun']).toBe(1);
    expect(out.totalSamples).toBe(3);
  });

  it('returns null dominant when no hero picks at all', () => {
    const players = [
      fakePlayer({ talents: [{ id: 100, rank: 1, nodeID: 1 }] }),
    ];
    const out = summarizeHeroTrees(players, TALENT_INDEX);
    expect(out.dominant).toBeNull();
  });
});

describe('summarizeTrinkets', () => {
  it('counts trinket frequency across slots 12 and 13', () => {
    const make = (t1: number, t2: number) =>
      fakePlayer({
        gear: Array.from({ length: 18 }, (_, i) => {
          if (i === 12) return { id: t1 };
          if (i === 13) return { id: t2 };
          return { id: i + 1 };
        }),
      });
    const players = [make(111, 222), make(111, 333), make(444, 555)];
    const out = summarizeTrinkets(players, 5);
    const ids = out.map((t) => t.itemId);
    expect(ids[0]).toBe(111);
    expect(out[0]?.count).toBe(2);
  });
});

describe('summarizeTierSets', () => {
  it('counts 2pc and 4pc players per setID', () => {
    const gear5 = Array.from({ length: 18 }, (_, i) =>
      i < 5 ? { id: i + 1, setID: 999 } : { id: i + 1 },
    );
    const gear2 = Array.from({ length: 18 }, (_, i) =>
      i < 2 ? { id: i + 1, setID: 999 } : { id: i + 1 },
    );
    const players = [fakePlayer({ gear: gear5 }), fakePlayer({ gear: gear2 })];
    const out = summarizeTierSets(players);
    expect(out[0]?.setId).toBe(999);
    expect(out[0]?.twoPiecePlayers).toBe(2);
    expect(out[0]?.fourPiecePlayers).toBe(1);
  });
});

describe('summarizeStatPriority', () => {
  it('orders stats by total across samples', () => {
    const players = [
      fakePlayer({
        stats: { crit: 1000, haste: 2000, mastery: 500, versatility: 100 },
      }),
      fakePlayer({
        stats: { crit: 1000, haste: 2000, mastery: 500, versatility: 100 },
      }),
    ];
    const out = summarizeStatPriority(players);
    expect(out.ordering.map((o) => o.stat)).toEqual([
      'haste',
      'crit',
      'mastery',
      'versatility',
    ]);
  });
});

describe('buildSnapshot', () => {
  it('returns a populated snapshot for non-empty input', () => {
    const players = [
      fakePlayer({
        talents: [
          { id: 9001, rank: 1, nodeID: 1 },
          { id: 9002, rank: 1, nodeID: 3 },
        ],
        stats: { crit: 1000, haste: 500, mastery: 200, versatility: 50 },
      }),
      fakePlayer({
        talents: [
          { id: 9001, rank: 1, nodeID: 1 },
          { id: 9002, rank: 1, nodeID: 3 },
        ],
        stats: { crit: 1000, haste: 500, mastery: 200, versatility: 50 },
      }),
    ];
    const snap = buildSnapshot(players, TALENT_INDEX);
    expect(snap.sampleSize).toBe(2);
    expect(snap.loadoutConsensus).toBe(true);
    expect(snap.heroTree.dominant).toBe('templar');
    expect(snap.statPriority.ordering[0]?.stat).toBe('crit');
  });

  it('handles empty player list gracefully', () => {
    const snap = buildSnapshot([], TALENT_INDEX);
    expect(snap.sampleSize).toBe(0);
    expect(snap.canonicalLoadout).toEqual([]);
    expect(snap.heroTree.dominant).toBeNull();
  });
});
