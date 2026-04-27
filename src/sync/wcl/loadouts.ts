import { graphql } from '../../apis/warcraftlogs/index.js';
import type {
  CombatantInfoData,
  CombatantInfoGearItem,
  CombatantInfoTalent,
} from '../../apis/warcraftlogs/index.js';

/**
 * One-shot query: pull masterData.actors + CombatantInfo events for a
 * single fight. We then match the rankings player name to an actor.id
 * → use that as `sourceID` to find the right CombatantInfo entry from
 * the events payload.
 *
 * Filtering by `sourceID` on the GraphQL events arg is the cleaner
 * path the plan §10.1 verified, but it only works when we already
 * know the sourceID — and rankings don't expose it. Pulling the full
 * fight's CombatantInfo (~25-30 entries for a raid) and filtering
 * client-side costs effectively the same: ~2 points per query.
 */
const PLAYER_LOADOUT_QUERY = `
  query PlayerLoadout($code: String!, $fightID: Int!) {
    reportData {
      report(code: $code) {
        masterData {
          actors(type: "Player") {
            id
            name
          }
        }
        events(
          dataType: CombatantInfo
          fightIDs: [$fightID]
          limit: 50
        ) {
          data
          nextPageTimestamp
        }
      }
    }
  }
`;

interface PlayerLoadoutResponse {
  reportData: {
    report: {
      masterData: {
        actors: Array<{ id: number; name: string }>;
      } | null;
      events: {
        data: Array<CombatantInfoData & { sourceID?: number }> | null;
      } | null;
    } | null;
  };
}

export interface FetchPlayerLoadoutArgs {
  code: string;
  fightID: number;
  playerName: string;
}

/**
 * Fetch a single player's CombatantInfo from a report fight by name.
 * Returns null if the report is private/missing, the actor isn't in
 * the fight's master data, or no CombatantInfo event matches.
 */
export async function fetchPlayerLoadout(
  args: FetchPlayerLoadoutArgs,
): Promise<CombatantInfoData | null> {
  const res = await graphql<PlayerLoadoutResponse>(PLAYER_LOADOUT_QUERY, {
    code: args.code,
    fightID: args.fightID,
  });
  const report = res.reportData.report;
  if (!report) return null;
  const actor = report.masterData?.actors.find(
    (a) => a.name === args.playerName,
  );
  if (!actor) return null;
  const events = report.events?.data ?? [];
  const match = events.find((e) => e.sourceID === actor.id);
  if (!match) return null;
  return match;
}

export interface PlayerLoadout {
  specID?: number;
  talents: CombatantInfoTalent[];
  gear: CombatantInfoGearItem[];
  stats: PlayerStats;
}

export interface PlayerStats {
  strength: number;
  agility: number;
  stamina: number;
  intellect: number;
  crit: number;
  haste: number;
  mastery: number;
  versatility: number;
}

/**
 * Distill a CombatantInfo payload into a stable shape for aggregation.
 * Drops legacy-empty `talents[]` and `customPowerSet[]` from the API.
 *
 * Stat snapshot picks the highest-rating channel per category — WCL
 * splits crit/haste into melee/ranged/spell but for any given player
 * only one is meaningful. Max-of-three collapses cleanly.
 */
export function extractLoadout(data: CombatantInfoData): PlayerLoadout {
  const talents = (data.talentTree ?? []).filter(
    (t) => typeof t.id === 'number' && t.id > 0,
  );
  const gear = (data.gear ?? []).filter(
    (g) => typeof g.id === 'number' && g.id > 0,
  );
  const stats: PlayerStats = {
    strength: data.strength ?? 0,
    agility: data.agility ?? 0,
    stamina: data.stamina ?? 0,
    intellect: data.intellect ?? 0,
    crit: maxOf(data.critMelee, data.critRanged, data.critSpell),
    haste: maxOf(data.hasteMelee, data.hasteRanged, data.hasteSpell),
    mastery: data.mastery ?? 0,
    versatility: maxOf(
      data.versatilityDamageDone,
      data.versatilityHealingDone,
      data.versatilityDamageReduction,
    ),
  };
  const out: PlayerLoadout = {
    talents,
    gear,
    stats,
  };
  if (data.specID !== undefined) out.specID = data.specID;
  return out;
}

function maxOf(...vals: Array<number | undefined>): number {
  return vals.reduce<number>(
    (acc, v) => (v !== undefined && v > acc ? v : acc),
    0,
  );
}

/**
 * Hash a talent loadout for vote-counting. Sorts by talent id so order
 * doesn't matter; ranks are included so multi-rank picks differentiate.
 */
export function hashLoadout(talents: CombatantInfoTalent[]): string {
  return [...talents]
    .map((t) => `${t.id}:${t.rank}`)
    .sort()
    .join('|');
}

/**
 * WCL gear slots — verified against CombatantInfo responses. Trinkets
 * occupy slots 12 and 13 (0-indexed). Slot map roughly:
 *   0=head 1=neck 2=shoulders 3=shirt 4=chest 5=waist 6=legs 7=feet
 *   8=wrists 9=hands 10=ring1 11=ring2 12=trinket1 13=trinket2
 *   14=back 15=mainhand 16=offhand 17=tabard
 */
export const TRINKET_SLOTS = [12, 13] as const;

export function trinketIds(gear: CombatantInfoGearItem[]): number[] {
  return TRINKET_SLOTS.map((slot) => gear[slot]?.id).filter(
    (id): id is number => typeof id === 'number' && id > 0,
  );
}
