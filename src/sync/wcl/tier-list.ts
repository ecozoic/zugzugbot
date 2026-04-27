import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { graphql } from '../../apis/warcraftlogs/index.js';
import {
  DIFFICULTY,
  fetchEncounterRankings,
  summarizeRankings,
  type RaidDifficulty,
} from './rankings.js';
import { SPECS, type SpecEntry, type WclRole } from './specs.js';
import { renderFrontmatter, titleCaseSlug } from './write.js';

export const META_DIR = 'kb/wow/_meta';

const RAID_DIFFICULTIES: RaidDifficulty[] = ['Mythic', 'Heroic', 'Normal'];

const ZONE_DETAILS_QUERY = `
  query ZoneDetails($id: Int!) {
    worldData {
      zone(id: $id) {
        id
        name
        encounters { id name }
      }
    }
  }
`;

interface ZoneDetailsResponse {
  worldData: {
    zone: {
      id: number;
      name: string;
      encounters: Array<{ id: number; name: string }>;
    } | null;
  };
}

export interface EncounterRef {
  id: number;
  name: string;
}

export async function fetchZoneEncounters(
  zoneId: number,
): Promise<EncounterRef[]> {
  const data = await graphql<ZoneDetailsResponse>(ZONE_DETAILS_QUERY, {
    id: zoneId,
  });
  return data.worldData.zone?.encounters ?? [];
}

interface SpecRanking {
  spec: SpecEntry;
  median: number;
  count: number;
  lowSample: boolean;
}

export interface RaidTierListArgs {
  zoneId: number;
  zoneName: string;
  encounters: EncounterRef[];
  patch: string;
  syncedAt: string;
  specs: readonly SpecEntry[];
  dryRun: boolean;
}

export interface MplusTierListArgs {
  zoneId: number;
  zoneName: string;
  dungeons: EncounterRef[];
  patch: string;
  syncedAt: string;
  specs: readonly SpecEntry[];
  dryRun: boolean;
}

export interface TierListResult {
  ok: boolean;
  filename: string;
  queriesIssued: number;
}

export async function syncRaidTierList(
  args: RaidTierListArgs,
): Promise<TierListResult> {
  const filename = 'raid-tier-list.md';
  const fullPath = path.join(META_DIR, filename);

  const perEncounter: Array<{
    encounter: EncounterRef;
    difficulty: RaidDifficulty;
    rankings: SpecRanking[];
  }> = [];
  let queries = 0;

  for (const encounter of args.encounters) {
    for (const difficulty of RAID_DIFFICULTIES) {
      const rankings: SpecRanking[] = [];
      for (const spec of args.specs) {
        const blob = await fetchEncounterRankings({
          encounterId: encounter.id,
          className: spec.className,
          specName: spec.specName,
          difficulty: DIFFICULTY[difficulty] ?? 5,
          metric: spec.metric,
          page: 1,
        });
        queries++;
        const summary = summarizeRankings(blob);
        if (summary) {
          rankings.push({
            spec,
            median: summary.median,
            count: summary.count,
            lowSample: summary.lowSample,
          });
        }
      }
      perEncounter.push({ encounter, difficulty, rankings });
    }
  }

  const md = renderRaidTierListMd({
    zoneId: args.zoneId,
    zoneName: args.zoneName,
    patch: args.patch,
    syncedAt: args.syncedAt,
    perEncounter,
  });

  if (!args.dryRun) {
    await mkdir(META_DIR, { recursive: true });
    await writeFile(fullPath, md, 'utf-8');
  }

  return { ok: true, filename, queriesIssued: queries };
}

export async function syncMplusTierList(
  args: MplusTierListArgs,
): Promise<TierListResult> {
  const filename = 'mplus-tier-list.md';
  const fullPath = path.join(META_DIR, filename);

  const perDungeon: Array<{
    encounter: EncounterRef;
    rankings: SpecRanking[];
  }> = [];
  let queries = 0;

  for (const encounter of args.dungeons) {
    const rankings: SpecRanking[] = [];
    for (const spec of args.specs) {
      const blob = await fetchEncounterRankings({
        encounterId: encounter.id,
        className: spec.className,
        specName: spec.specName,
        difficulty: 10,
        metric: spec.metric,
        page: 1,
      });
      queries++;
      const summary = summarizeRankings(blob);
      if (summary) {
        rankings.push({
          spec,
          median: summary.median,
          count: summary.count,
          lowSample: summary.lowSample,
        });
      }
    }
    perDungeon.push({ encounter, rankings });
  }

  const md = renderMplusTierListMd({
    zoneId: args.zoneId,
    zoneName: args.zoneName,
    patch: args.patch,
    syncedAt: args.syncedAt,
    perDungeon,
  });

  if (!args.dryRun) {
    await mkdir(META_DIR, { recursive: true });
    await writeFile(fullPath, md, 'utf-8');
  }

  return { ok: true, filename, queriesIssued: queries };
}

interface RenderRaidArgs {
  zoneId: number;
  zoneName: string;
  patch: string;
  syncedAt: string;
  perEncounter: Array<{
    encounter: EncounterRef;
    difficulty: RaidDifficulty;
    rankings: SpecRanking[];
  }>;
}

export function renderRaidTierListMd(args: RenderRaidArgs): string {
  const frontmatter = renderFrontmatter([
    ['game', 'wow'],
    ['kind', 'meta'],
    ['content_type', 'raid'],
    ['synced_from', 'warcraft-logs-v2'],
    ['synced_at', args.syncedAt],
    ['patch', args.patch],
    ['zone_id', args.zoneId],
    ['zone_name', args.zoneName],
  ]);

  const overall = aggregateOverall(args.perEncounter.map((e) => e.rankings));
  const lines: string[] = [
    `# Mythic Raid Tier List (${args.patch})`,
    '',
    '## Overall (current tier, all bosses, Mythic)',
    '',
    ...renderRoleSections(overall, 10),
    '',
    '## Per-Boss',
  ];

  for (const block of args.perEncounter) {
    lines.push('');
    lines.push(`### ${block.encounter.name} (${block.difficulty})`);
    lines.push('');
    if (block.rankings.length === 0) {
      lines.push('No ranking data available.');
      continue;
    }
    lines.push(...renderRoleSections(block.rankings, 5));
  }

  return `${frontmatter}\n\n${lines.join('\n')}\n`;
}

interface RenderMplusArgs {
  zoneId: number;
  zoneName: string;
  patch: string;
  syncedAt: string;
  perDungeon: Array<{ encounter: EncounterRef; rankings: SpecRanking[] }>;
}

export function renderMplusTierListMd(args: RenderMplusArgs): string {
  const frontmatter = renderFrontmatter([
    ['game', 'wow'],
    ['kind', 'meta'],
    ['content_type', 'mplus'],
    ['synced_from', 'warcraft-logs-v2'],
    ['synced_at', args.syncedAt],
    ['patch', args.patch],
    ['zone_id', args.zoneId],
    ['zone_name', args.zoneName],
  ]);

  const overall = aggregateOverall(args.perDungeon.map((d) => d.rankings));
  const lines: string[] = [
    `# Mythic+ Tier List (${args.zoneName}, ${args.patch})`,
    '',
    '## Overall (current season, all dungeons)',
    '',
    ...renderRoleSections(overall, 10),
    '',
    '## Per-Dungeon',
  ];
  for (const block of args.perDungeon) {
    lines.push('');
    lines.push(`### ${block.encounter.name}`);
    lines.push('');
    if (block.rankings.length === 0) {
      lines.push('No ranking data available.');
      continue;
    }
    lines.push(...renderRoleSections(block.rankings, 5));
  }
  return `${frontmatter}\n\n${lines.join('\n')}\n`;
}

/**
 * Combine multiple per-encounter ranking groups into a single
 * overall list — for each spec, average the median across the groups
 * where the spec appears with non-low-sample data.
 */
function aggregateOverall(groups: SpecRanking[][]): SpecRanking[] {
  const totals = new Map<
    string,
    {
      spec: SpecEntry;
      sumMedian: number;
      samples: number;
      minCount: number;
      lowSampleEverywhere: boolean;
    }
  >();
  for (const group of groups) {
    for (const r of group) {
      const key = `${r.spec.classSlug}:${r.spec.specSlug}`;
      const existing = totals.get(key);
      if (existing) {
        existing.sumMedian += r.median;
        existing.samples++;
        existing.minCount = Math.min(existing.minCount, r.count);
        existing.lowSampleEverywhere =
          existing.lowSampleEverywhere && r.lowSample;
      } else {
        totals.set(key, {
          spec: r.spec,
          sumMedian: r.median,
          samples: 1,
          minCount: r.count,
          lowSampleEverywhere: r.lowSample,
        });
      }
    }
  }
  return [...totals.values()].map((t) => ({
    spec: t.spec,
    median: t.samples > 0 ? t.sumMedian / t.samples : 0,
    count: t.minCount,
    lowSample: t.lowSampleEverywhere,
  }));
}

function renderRoleSections(rankings: SpecRanking[], topN: number): string[] {
  const roles: WclRole[] = ['dps', 'healer', 'tank'];
  const labels: Record<WclRole, string> = {
    dps: 'DPS',
    healer: 'Healers',
    tank: 'Tanks',
  };
  const lines: string[] = [];
  for (const role of roles) {
    const filtered = rankings
      .filter((r) => r.spec.role === role)
      .sort((a, b) => b.median - a.median)
      .slice(0, topN);
    if (filtered.length === 0) continue;
    lines.push(`${labels[role]}:`);
    let i = 1;
    for (const r of filtered) {
      const flag = r.lowSample ? ' (low sample)' : '';
      lines.push(
        `${i}. ${titleCaseSlug(r.spec.specSlug)} ${titleCaseSlug(r.spec.classSlug)} — ${r.median.toFixed(0)} ${r.spec.metric.toUpperCase()} (n=${r.count})${flag}`,
      );
      i++;
    }
    lines.push('');
  }
  return lines;
}

export { SPECS };
