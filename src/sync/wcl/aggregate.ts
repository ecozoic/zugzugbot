import type { CombatantInfoTalent } from '../../apis/warcraftlogs/index.js';
import { hashLoadout, trinketIds, type PlayerLoadout } from './loadouts.js';
import {
  lookupTalentByNode,
  type TalentIndex,
  type TalentIndexEntry,
} from './talent-index.js';

export interface HeroTreeSummary {
  /** Slug of the dominant hero tree, or null if undeterminable. */
  dominant: string | null;
  /** All hero trees seen, keyed by slug → count. */
  splits: Record<string, number>;
  totalSamples: number;
}

export interface TrinketSummary {
  itemId: number;
  count: number;
}

export interface TierSetSummary {
  setId: number;
  twoPiecePlayers: number;
  fourPiecePlayers: number;
}

export interface StatPriority {
  /** Stats in descending order by sum-across-samples. */
  ordering: Array<{ stat: string; total: number }>;
}

export interface BuildSnapshot {
  sampleSize: number;
  /** True when the canonical loadout was a strict majority match (>=2). */
  loadoutConsensus: boolean;
  canonicalLoadout: CombatantInfoTalent[];
  resolvedTalents: ResolvedTalent[];
  heroTree: HeroTreeSummary;
  trinkets: TrinketSummary[];
  tierSets: TierSetSummary[];
  statPriority: StatPriority;
}

export interface ResolvedTalent {
  talentId: number;
  rank: number;
  name: string;
  tree: TalentIndexEntry['tree'] | 'unknown';
  heroTree: string | null;
}

/**
 * Vote across N players for the most-common talent loadout. Returns
 * the canonical loadout (most-voted, or top-DPS player's if no
 * majority) plus a flag indicating whether 2+ players matched it.
 */
export function pickCanonicalLoadout(players: PlayerLoadout[]): {
  loadout: CombatantInfoTalent[];
  consensus: boolean;
} {
  if (players.length === 0) return { loadout: [], consensus: false };
  const buckets = new Map<
    string,
    { players: PlayerLoadout[]; count: number }
  >();
  for (const p of players) {
    const h = hashLoadout(p.talents);
    const existing = buckets.get(h);
    if (existing) {
      existing.players.push(p);
      existing.count++;
    } else {
      buckets.set(h, { players: [p], count: 1 });
    }
  }
  let bestCount = 0;
  let best: PlayerLoadout | null = null;
  for (const bucket of buckets.values()) {
    if (bucket.count > bestCount) {
      bestCount = bucket.count;
      best = bucket.players[0] ?? null;
    }
  }
  if (best && bestCount >= 2) {
    return { loadout: best.talents, consensus: true };
  }
  // No consensus — fall back to top-DPS (= first player by convention,
  // since rankings come back DPS-sorted).
  const fallback = players[0];
  if (!fallback) return { loadout: [], consensus: false };
  return { loadout: fallback.talents, consensus: false };
}

export function resolveTalents(
  loadout: CombatantInfoTalent[],
  index: TalentIndex,
): ResolvedTalent[] {
  return loadout.map((t) => {
    const meta =
      t.nodeID !== undefined ? lookupTalentByNode(index, t.nodeID) : undefined;
    if (!meta) {
      return {
        talentId: t.id,
        rank: t.rank,
        name: `talent ${t.id}`,
        tree: 'unknown' as const,
        heroTree: null,
      };
    }
    return {
      talentId: t.id,
      rank: t.rank,
      name: meta.name,
      tree: meta.tree,
      heroTree: meta.hero_tree,
    };
  });
}

/**
 * Per-player hero tree classification: count which hero tree each
 * player took the most picks from. Picks the modal tree per player.
 */
export function summarizeHeroTrees(
  players: PlayerLoadout[],
  index: TalentIndex,
): HeroTreeSummary {
  const splits: Record<string, number> = {};
  for (const p of players) {
    const counts = new Map<string, number>();
    for (const t of p.talents) {
      const meta =
        t.nodeID !== undefined
          ? lookupTalentByNode(index, t.nodeID)
          : undefined;
      if (!meta || meta.tree !== 'hero_talent' || !meta.hero_tree) continue;
      counts.set(meta.hero_tree, (counts.get(meta.hero_tree) ?? 0) + 1);
    }
    let chosen: string | null = null;
    let best = 0;
    for (const [k, v] of counts) {
      if (v > best) {
        best = v;
        chosen = k;
      }
    }
    if (chosen) {
      splits[chosen] = (splits[chosen] ?? 0) + 1;
    }
  }
  let dominant: string | null = null;
  let bestCount = 0;
  for (const [k, v] of Object.entries(splits)) {
    if (v > bestCount) {
      bestCount = v;
      dominant = k;
    }
  }
  return { dominant, splits, totalSamples: players.length };
}

export function summarizeTrinkets(
  players: PlayerLoadout[],
  topN: number,
): TrinketSummary[] {
  const counts = new Map<number, number>();
  for (const p of players) {
    const ids = trinketIds(p.gear);
    const seenInPlayer = new Set<number>();
    for (const id of ids) {
      if (seenInPlayer.has(id)) continue;
      seenInPlayer.add(id);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([itemId, count]) => ({ itemId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

export function summarizeTierSets(players: PlayerLoadout[]): TierSetSummary[] {
  const setCounts = new Map<number, number[]>();
  for (const p of players) {
    const counts = new Map<number, number>();
    for (const item of p.gear) {
      if (item.setID === undefined) continue;
      counts.set(item.setID, (counts.get(item.setID) ?? 0) + 1);
    }
    for (const [setId, c] of counts) {
      const arr = setCounts.get(setId) ?? [];
      arr.push(c);
      setCounts.set(setId, arr);
    }
  }
  return [...setCounts.entries()]
    .map(([setId, perPlayerCounts]) => ({
      setId,
      twoPiecePlayers: perPlayerCounts.filter((n) => n >= 2).length,
      fourPiecePlayers: perPlayerCounts.filter((n) => n >= 4).length,
    }))
    .sort((a, b) => b.twoPiecePlayers - a.twoPiecePlayers);
}

export function summarizeStatPriority(players: PlayerLoadout[]): StatPriority {
  const totals = {
    crit: 0,
    haste: 0,
    mastery: 0,
    versatility: 0,
  };
  for (const p of players) {
    totals.crit += p.stats.crit;
    totals.haste += p.stats.haste;
    totals.mastery += p.stats.mastery;
    totals.versatility += p.stats.versatility;
  }
  return {
    ordering: Object.entries(totals)
      .map(([stat, total]) => ({ stat, total }))
      .sort((a, b) => b.total - a.total),
  };
}

export function buildSnapshot(
  players: PlayerLoadout[],
  index: TalentIndex,
): BuildSnapshot {
  const { loadout, consensus } = pickCanonicalLoadout(players);
  return {
    sampleSize: players.length,
    canonicalLoadout: loadout,
    loadoutConsensus: consensus,
    resolvedTalents: resolveTalents(loadout, index),
    heroTree: summarizeHeroTrees(players, index),
    trinkets: summarizeTrinkets(players, 5),
    tierSets: summarizeTierSets(players),
    statPriority: summarizeStatPriority(players),
  };
}
