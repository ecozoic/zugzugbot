import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { BuildSnapshot, ResolvedTalent } from './aggregate.js';
import {
  buildSnapshot,
  type HeroTreeSummary,
  type StatPriority,
} from './aggregate.js';
import { extractLoadout, fetchPlayerLoadout } from './loadouts.js';
import {
  fetchEncounterRankings,
  topReports,
  DIFFICULTY,
  type RaidDifficulty,
} from './rankings.js';
import type { SpecEntry } from './specs.js';
import {
  capitalize,
  pct,
  renderFrontmatter,
  titleCaseSlug,
  wowheadItemLink,
} from './write.js';
import type { TalentIndex } from './talent-index.js';
import type { PlayerLoadout } from './loadouts.js';

export const META_DIR = 'kb/wow/_meta';

export type ContentType = 'raid' | 'mplus';

/** A single (encounter, ranking) pair to sample for build extraction. */
export interface RankingSource {
  encounterId: number;
  encounterName: string;
}

export interface PerSpecArgs {
  spec: SpecEntry;
  contentType: ContentType;
  zoneId: number;
  zoneName: string;
  /**
   * Encounters within the zone to sample top players from. The first
   * one is used as the canonical "representative" rankings query
   * (Tier 1 keeps it simple — one query per spec per content type).
   */
  encounters: RankingSource[];
  patch: string;
  syncedAt: string;
  talentIndex: TalentIndex;
  /** When true, query rankings + events but do not write the file. */
  dryRun: boolean;
  /** Sample size for build extraction; defaults to 5 per plan §10.5. */
  sampleSize?: number;
  /** Difficulty filter for raid (Mythic = 5). m+ ignores this. */
  raidDifficulty?: RaidDifficulty;
}

export interface PerSpecResult {
  ok: boolean;
  filename: string;
  warning?: string;
  /** Number of CombatantInfo events successfully fetched (0 ≤ n ≤ sampleSize). */
  samplesFetched: number;
  /** Encounter id whose rankings drove the sample (first encounter). */
  representativeEncounterId?: number;
}

const DEFAULT_SAMPLE_SIZE = 5;
const RAID_MYTHIC = 5;
const MPLUS_DIFFICULTY = 10;

/**
 * Pull top-N rankings for the spec from the zone's representative
 * encounter, fetch each player's CombatantInfo, aggregate, and write
 * the per-spec snapshot file.
 *
 * Plan §8 originally specified one rankings query "across the full
 * zone" — but WCL's GraphQL `Zone` type doesn't expose
 * `characterRankings` (only `Encounter` does). So we take the first
 * encounter as a representative sample. Tier 2 (per-boss) will use
 * the full encounter set; this Tier 1 implementation produces one
 * file per (spec, content-type) keyed off boss #1.
 */
export async function syncPerSpec(args: PerSpecArgs): Promise<PerSpecResult> {
  const sampleSize = args.sampleSize ?? DEFAULT_SAMPLE_SIZE;
  const filename = `${args.spec.classSlug}-${args.spec.specSlug}-${args.contentType}.md`;
  const fullPath = path.join(META_DIR, filename);

  const representative = args.encounters[0];
  if (!representative) {
    const empty = buildSnapshot([], args.talentIndex);
    const md = renderPerSpecMd({
      spec: args.spec,
      contentType: args.contentType,
      zoneId: args.zoneId,
      zoneName: args.zoneName,
      patch: args.patch,
      syncedAt: args.syncedAt,
      snapshot: empty,
    });
    if (!args.dryRun) {
      await mkdir(META_DIR, { recursive: true });
      await writeFile(fullPath, md, 'utf-8');
    }
    return {
      ok: true,
      filename,
      samplesFetched: 0,
      warning: `[${args.spec.classSlug}-${args.spec.specSlug}-${args.contentType}] no encounters provided for zone ${args.zoneId}`,
    };
  }

  const difficulty =
    args.contentType === 'raid'
      ? (DIFFICULTY[args.raidDifficulty ?? 'Mythic'] ?? RAID_MYTHIC)
      : MPLUS_DIFFICULTY;

  const blob = await fetchEncounterRankings({
    encounterId: representative.encounterId,
    className: args.spec.className,
    specName: args.spec.specName,
    difficulty,
    metric: args.spec.metric,
    page: 1,
  });
  const top = topReports(blob, sampleSize);

  const players: PlayerLoadout[] = [];
  for (const r of top) {
    try {
      const event = await fetchPlayerLoadout({
        code: r.report.code,
        fightID: r.report.fightID,
        playerName: r.name,
      });
      if (event) players.push(extractLoadout(event));
    } catch {
      // Some logs are private or have been deleted; skip and continue.
    }
  }

  const snapshot = buildSnapshot(players, args.talentIndex);
  const md = renderPerSpecMd({
    spec: args.spec,
    contentType: args.contentType,
    zoneId: args.zoneId,
    zoneName: args.zoneName,
    patch: args.patch,
    syncedAt: args.syncedAt,
    snapshot,
  });

  if (!args.dryRun) {
    await mkdir(META_DIR, { recursive: true });
    await writeFile(fullPath, md, 'utf-8');
  }

  const result: PerSpecResult = {
    ok: true,
    filename,
    samplesFetched: players.length,
    representativeEncounterId: representative.encounterId,
  };
  if (players.length === 0) {
    result.warning = `[${args.spec.classSlug}-${args.spec.specSlug}-${args.contentType}] no CombatantInfo samples available`;
  }
  return result;
}

interface RenderArgs {
  spec: SpecEntry;
  contentType: ContentType;
  zoneId: number;
  zoneName: string;
  patch: string;
  syncedAt: string;
  snapshot: BuildSnapshot;
}

export function renderPerSpecMd(args: RenderArgs): string {
  const { spec, contentType, zoneId, zoneName, patch, syncedAt, snapshot } =
    args;
  const className = titleCaseSlug(spec.classSlug);
  const specTitle = capitalize(spec.specName);
  const headerLabel =
    contentType === 'raid' ? 'Mythic Raid Meta' : 'Mythic+ Meta';

  const frontmatter = renderFrontmatter([
    ['game', 'wow'],
    ['kind', 'meta'],
    ['class', spec.classSlug],
    ['spec', spec.specSlug],
    ['content_type', contentType],
    ['percentile', 'p99'],
    ['sample_size', snapshot.sampleSize],
    ['synced_from', 'warcraft-logs-v2'],
    ['synced_at', syncedAt],
    ['patch', patch],
    ['zone_id', zoneId],
    ['zone_name', zoneName],
  ]);

  const body = [
    `# ${specTitle} ${className} — ${headerLabel} (${patch})`,
    '',
    renderHeroTreeSection(snapshot.heroTree),
    '',
    renderTalentSection(
      snapshot.resolvedTalents,
      snapshot.loadoutConsensus,
      snapshot.sampleSize,
    ),
    '',
    renderGearSection(snapshot),
    '',
    renderStatSection(snapshot.statPriority),
    '',
  ].join('\n');

  return `${frontmatter}\n\n${body}`;
}

function renderHeroTreeSection(hero: HeroTreeSummary): string {
  if (hero.totalSamples === 0) {
    return '## Hero Tree\n\nNo hero tree data available (no samples).';
  }
  const total = hero.totalSamples;
  const splitParts = Object.entries(hero.splits)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([slug, count]) =>
        `${titleCaseSlug(slug)} ${count}/${total} (${pct(count, total)})`,
    );
  const dominant = hero.dominant
    ? `**${titleCaseSlug(hero.dominant)}** dominant.`
    : 'No dominant hero tree.';
  return `## Hero Tree\n\n${dominant}\n\nSplit: ${splitParts.length > 0 ? splitParts.join(', ') : '(no hero tree picks detected)'}.`;
}

function renderTalentSection(
  resolved: ResolvedTalent[],
  consensus: boolean,
  sampleSize: number,
): string {
  if (resolved.length === 0) {
    return '## Talent Build\n\nNo talent data available (no samples).';
  }
  const consensusLine = consensus
    ? `Canonical loadout matched by 2+ of ${sampleSize} top parsers.`
    : `No majority loadout among the ${sampleSize} samples — using top parser's build.`;

  const byTree = {
    class_talent: [] as ResolvedTalent[],
    spec_talent: [] as ResolvedTalent[],
    hero_talent: [] as ResolvedTalent[],
    other: [] as ResolvedTalent[],
  };
  for (const t of resolved) {
    if (t.tree === 'class_talent') byTree.class_talent.push(t);
    else if (t.tree === 'spec_talent') byTree.spec_talent.push(t);
    else if (t.tree === 'hero_talent') byTree.hero_talent.push(t);
    else byTree.other.push(t);
  }

  const lines: string[] = ['## Talent Build', '', consensusLine, ''];
  if (byTree.class_talent.length > 0) {
    lines.push(
      '**Class tree:** ' +
        byTree.class_talent.map(formatTalentLine).join(', ') +
        '.',
    );
  }
  if (byTree.spec_talent.length > 0) {
    lines.push(
      '**Spec tree:** ' +
        byTree.spec_talent.map(formatTalentLine).join(', ') +
        '.',
    );
  }
  if (byTree.hero_talent.length > 0) {
    const heroSlug = byTree.hero_talent[0]?.heroTree;
    const label = heroSlug
      ? `Hero tree (${titleCaseSlug(heroSlug)})`
      : 'Hero tree';
    lines.push(
      `**${label}:** ` +
        byTree.hero_talent.map(formatTalentLine).join(', ') +
        '.',
    );
  }
  if (byTree.other.length > 0) {
    lines.push(
      '**Unresolved talents:** ' +
        byTree.other
          .map((t) => `${t.name} (id ${t.talentId}, rank ${t.rank})`)
          .join(', ') +
        '.',
    );
  }
  return lines.join('\n');
}

function formatTalentLine(t: ResolvedTalent): string {
  return t.rank > 1 ? `${t.name} ${t.rank}/${t.rank}` : t.name;
}

function renderGearSection(snapshot: BuildSnapshot): string {
  const lines: string[] = ['## Gear / Trinkets', ''];
  if (snapshot.trinkets.length === 0) {
    lines.push('No trinket data available.');
  } else {
    lines.push(
      `**Most-equipped trinkets (top ${snapshot.sampleSize} sample):**`,
    );
    let i = 1;
    for (const t of snapshot.trinkets) {
      lines.push(
        `${i}. ${wowheadItemLink(t.itemId)} (${t.count}/${snapshot.sampleSize})`,
      );
      i++;
    }
  }
  if (snapshot.tierSets.length > 0) {
    lines.push('');
    lines.push('**Tier sets observed:**');
    for (const set of snapshot.tierSets) {
      const four =
        set.fourPiecePlayers > 0
          ? `, 4pc ${set.fourPiecePlayers}/${snapshot.sampleSize}`
          : '';
      lines.push(
        `- Set ID ${set.setId}: 2pc ${set.twoPiecePlayers}/${snapshot.sampleSize}${four}`,
      );
    }
  }
  return lines.join('\n');
}

function renderStatSection(stat: StatPriority): string {
  const lines: string[] = ['## Stat Priority Hint', ''];
  if (stat.ordering.length === 0 || stat.ordering.every((o) => o.total === 0)) {
    lines.push('No stat data available.');
    return lines.join('\n');
  }
  const order = stat.ordering.map((o) => capitalize(o.stat)).join(' > ');
  lines.push(`Inferred from gear (median across samples): ${order}.`);
  lines.push('');
  lines.push(
    'NOT authoritative — derived from secondary stat distribution on equipped gear, not from a sim. Use as signal only.',
  );
  return lines.join('\n');
}
