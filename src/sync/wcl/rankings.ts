import { graphql } from '../../apis/warcraftlogs/index.js';
import type {
  CharacterRanking,
  CharacterRankingsBlob,
  EncounterRankingsResponse,
} from '../../apis/warcraftlogs/index.js';
import type { WclMetric } from './specs.js';

/**
 * Encounter difficulty IDs used by WCL's rankings API.
 * Source: https://www.warcraftlogs.com/docs/v2/api-types#integer-difficulty
 */
export const DIFFICULTY: Record<string, number> = {
  Mythic: 5,
  Heroic: 4,
  Normal: 3,
};

export type RaidDifficulty = 'Mythic' | 'Heroic' | 'Normal';

const ENCOUNTER_RANKINGS_QUERY = `
  query EncounterRankings(
    $encounterId: Int!
    $className: String!
    $specName: String!
    $difficulty: Int!
    $metric: CharacterRankingMetricType!
    $page: Int!
  ) {
    worldData {
      encounter(id: $encounterId) {
        characterRankings(
          className: $className
          specName: $specName
          difficulty: $difficulty
          metric: $metric
          page: $page
        )
      }
    }
  }
`;

export interface FetchEncounterRankingsArgs {
  encounterId: number;
  className: string;
  specName: string;
  difficulty: number;
  metric: WclMetric;
  page?: number;
}

export async function fetchEncounterRankings(
  args: FetchEncounterRankingsArgs,
): Promise<CharacterRankingsBlob | null> {
  const data = await graphql<EncounterRankingsResponse>(
    ENCOUNTER_RANKINGS_QUERY,
    {
      encounterId: args.encounterId,
      className: args.className,
      specName: args.specName,
      difficulty: args.difficulty,
      metric: args.metric,
      page: args.page ?? 1,
    },
  );
  return data.worldData.encounter?.characterRankings ?? null;
}

/**
 * Convenience: pull the top N entries from a rankings blob, skipping
 * malformed records (missing report). Returns [] when blob is null.
 */
export function topReports(
  blob: CharacterRankingsBlob | null,
  n: number,
): CharacterRanking[] {
  if (!blob) return [];
  const rankings = blob.rankings ?? [];
  return rankings
    .filter((r) => r && r.report && typeof r.report.code === 'string')
    .slice(0, n);
}

export interface RankingSummary {
  count: number;
  median: number;
  top: number;
  /** True when count is below confidence threshold (50 parses). */
  lowSample: boolean;
}

const LOW_SAMPLE_THRESHOLD = 50;

/**
 * Reduce a rankings blob to a sortable summary for tier-list rendering.
 * Median is approximated as the rank-N/2 amount; with WCL's pre-sorted
 * rankings (descending) this is good enough for class-vs-class
 * comparisons.
 */
export function summarizeRankings(
  blob: CharacterRankingsBlob | null,
): RankingSummary | null {
  if (!blob) return null;
  const rankings = blob.rankings ?? [];
  if (rankings.length === 0) return null;
  const amounts = rankings.map((r) => r.amount);
  const top = amounts[0] ?? 0;
  const mid = amounts[Math.floor(amounts.length / 2)] ?? 0;
  return {
    count: blob.count,
    median: mid,
    top,
    lowSample: blob.count < LOW_SAMPLE_THRESHOLD,
  };
}
